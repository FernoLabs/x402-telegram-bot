<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import type { Auction, Group } from '$lib/types';
  import {
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction
  } from '@solana/web3.js';
  import {
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
    getAssociatedTokenAddress
  } from '@solana/spl-token';
  import { Buffer } from 'buffer';
  import type { WalletAdapter, WalletError } from '@solana/wallet-adapter-base';
  import { WalletReadyState } from '@solana/wallet-adapter-base';
  import {
    CoinbaseWalletAdapter,
    PhantomWalletAdapter,
    SolflareWalletAdapter,
    TorusWalletAdapter,
    TrustWalletAdapter
  } from '@solana/wallet-adapter-wallets';

  interface PaymentAcceptOption {
    scheme?: string;
    networkId?: string;
    currencyCode?: string;
    amount?: number;
    recipient?: string;
    memo?: string;
    assetAddress?: string;
    assetType?: string;
  }

  interface PaymentRequestData {
    amount?: number;
    maxAmountRequired?: number;
    currency?: string;
    currencyCode?: string;
    recipient?: string;
    paymentAddress?: string;
    network?: string;
    networkId?: string;
    instructions?: string;
    description?: string;
    resource?: string;
    expiresAt?: string;
    memo?: string;
    groupName?: string;
    accepts?: PaymentAcceptOption[];
    assetAddress?: string;
    assetType?: string;
    paymentId?: string;
    nonce?: string;
  }

  interface PendingPaymentRequest extends PaymentRequestData {
    internalId: string;
    createdAt: number;
  }

  interface WalletEntry {
    name: string;
    adapter: WalletAdapter;
    readyState: WalletReadyState;
    url?: string | null;
  }

  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

  export let data: {
    groups: Group[];
    loadError: boolean;
    preselectedGroupId: number | null;
  };

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const activeGroups = data.groups.filter((group) => group.active);
  let selectedGroupId = (() => {
    if (data.preselectedGroupId !== null) {
      const match = activeGroups.find((group) => group.id === data.preselectedGroupId);
      if (match) {
        return String(match.id);
      }
    }
    return activeGroups.length > 0 ? String(activeGroups[0].id) : '';
  })();

  let message = '';
  let sender = '';
  let loading = false;
  let error: string | null = null;
  let successAuction: Auction | null = null;

  let pendingPayments: PendingPaymentRequest[] = [];
  let activePaymentId: string | null = null;
  let signatureInputs: Record<string, string> = {};
  let signatureErrors: Record<string, string | undefined> = {};
  let paymentInFlight: Record<string, boolean> = {};

  const mintDecimalsCache = new Map<string, number>();

  let availableWallets: WalletEntry[] = [];
  let wallet: WalletAdapter | null = null;
  let selectedWalletName: string | null = null;
  let walletAddress: string | null = null;
  let walletConnecting = false;
  let walletError: string | null = null;
  const walletListeners: Array<() => void> = [];

  const formatUsd = (value: number) => currencyFormatter.format(value);

  const formatAmountForCurrency = (value: number, currency: string): string => {
    const normalized = currency ? currency.toUpperCase() : '';
    if (normalized === 'USDC' || normalized === 'USD') {
      return formatUsd(value);
    }

    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    });
  };

  const formatExpiration = (expiresAt: string): string | null => {
    const timestamp = Date.parse(expiresAt);
    if (Number.isNaN(timestamp)) {
      return null;
    }

    return new Date(timestamp).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  function resetStatus(): void {
    error = null;
    successAuction = null;
  }

  const parseJson = (text: string): unknown => {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.warn('Failed to parse response payload', parseError);
      return null;
    }
  };

  async function fetchJsonOrThrow<T>(
    input: RequestInfo,
    fallbackMessage: string,
    init?: RequestInit
  ): Promise<T> {
    const response = await fetch(input, init);
    const text = await response.text();
    const payload = parseJson(text);

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === 'object' &&
        payload !== null &&
        'error' in payload
          ? String((payload as { error: unknown }).error)
          : fallbackMessage;
      throw new Error(message);
    }

    if (payload === null || (typeof payload !== 'object' && typeof payload !== 'string')) {
      throw new Error(fallbackMessage);
    }

    return payload as T;
  }

  const resolveStringField = (candidates: Array<string | undefined | null>): string | null => {
    for (const value of candidates) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
    return null;
  };

  const resolveAmount = (request: PaymentRequestData): number | null => {
    if (typeof request.maxAmountRequired === 'number' && !Number.isNaN(request.maxAmountRequired)) {
      return request.maxAmountRequired;
    }
    if (typeof request.amount === 'number' && !Number.isNaN(request.amount)) {
      return request.amount;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        if (typeof option.amount === 'number' && !Number.isNaN(option.amount)) {
          return option.amount;
        }
      }
    }
    return null;
  };

  const resolveCurrency = (request: PaymentRequestData): string | null => {
    const direct = resolveStringField([request.currencyCode, request.currency]);
    if (direct) {
      return direct;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        const found = resolveStringField([option.currencyCode]);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  const resolveRecipient = (request: PaymentRequestData): string | null => {
    const direct = resolveStringField([request.paymentAddress, request.recipient]);
    if (direct) {
      return direct;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        const found = resolveStringField([option.recipient]);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  const resolveNetwork = (request: PaymentRequestData): string | null => {
    const direct = resolveStringField([request.networkId, request.network]);
    if (direct) {
      return direct;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        const found = resolveStringField([option.networkId]);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  const resolveMemo = (request: PaymentRequestData): string | null => {
    const direct = resolveStringField([request.memo]);
    if (direct) {
      return direct;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        const found = resolveStringField([option.memo]);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  const parseSelectedGroupId = (value: string): number | null => {
    if (!value) {
      return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const findSelectedGroup = (value: string): Group | null => {
    const parsedId = parseSelectedGroupId(value);

    if (parsedId === null) {
      return null;
    }

    return activeGroups.find((group) => group.id === parsedId) ?? null;
  };

  const generateInternalId = (request: PaymentRequestData): string => {
    if (request.paymentId && request.paymentId.trim()) {
      return request.paymentId;
    }
    if (request.nonce && request.nonce.trim()) {
      return request.nonce;
    }
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `payment-${Date.now()}-${Math.random()}`;
  };

  function addOrUpdatePendingPayment(request: PaymentRequestData): PendingPaymentRequest {
    const internalId = generateInternalId(request);
    const existingIndex = pendingPayments.findIndex((item) => item.internalId === internalId);
    const createdAt = existingIndex >= 0 ? pendingPayments[existingIndex].createdAt : Date.now();
    const normalized: PendingPaymentRequest = { ...request, internalId, createdAt };

    if (existingIndex >= 0) {
      pendingPayments = pendingPayments.map((item, index) => (index === existingIndex ? normalized : item));
    } else {
      pendingPayments = [...pendingPayments, normalized];
    }

    if (!activePaymentId || !pendingPayments.some((item) => item.internalId === activePaymentId)) {
      activePaymentId = internalId;
    }

    return normalized;
  }

  function removePendingPayment(id: string): void {
    pendingPayments = pendingPayments.filter((item) => item.internalId !== id);
    const { [id]: _removedSignature, ...restSignatures } = signatureInputs;
    signatureInputs = restSignatures;
    const { [id]: _removedError, ...restErrors } = signatureErrors;
    signatureErrors = restErrors;
    const { [id]: _removedFlight, ...restFlights } = paymentInFlight;
    paymentInFlight = restFlights;

    if (pendingPayments.length === 0) {
      activePaymentId = null;
    } else if (!activePaymentId || !pendingPayments.some((item) => item.internalId === activePaymentId)) {
      activePaymentId = pendingPayments[0].internalId;
    }
  }

  function clearPendingPayments(): void {
    pendingPayments = [];
    activePaymentId = null;
    signatureInputs = {};
    signatureErrors = {};
    paymentInFlight = {};
  }

  function updateSignatureForActive(value: string): void {
    if (!activePaymentId) {
      return;
    }
    signatureInputs = { ...signatureInputs, [activePaymentId]: value };
    const { [activePaymentId]: _removed, ...rest } = signatureErrors;
    signatureErrors = rest;
  }

  function handleWalletSelection(event: Event): void {
    const target = event.target as HTMLSelectElement;
    selectWallet(target.value);
  }

  function shortenAddress(address: string): string {
    if (address.length <= 10) {
      return address;
    }
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
  }

  function formatWalletError(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }
    if (typeof err === 'string') {
      return err;
    }
    return 'Wallet error. Try again or pick a different wallet.';
  }

  function registerAdapter(adapter: WalletAdapter): WalletEntry | null {
    if (adapter.readyState === WalletReadyState.Unsupported) {
      return null;
    }

    const entry: WalletEntry = {
      name: adapter.name,
      adapter,
      readyState: adapter.readyState,
      url: 'url' in adapter ? ((adapter as { url?: string | null }).url ?? null) : null
    };

    const handleConnect = () => {
      if (wallet === adapter) {
        walletAddress = adapter.publicKey ? adapter.publicKey.toBase58() : null;
      }
      walletError = null;
    };

    const handleDisconnect = () => {
      if (wallet === adapter) {
        walletAddress = null;
      }
    };

    const handleError = (event: WalletError) => {
      walletError = formatWalletError(event);
    };

    const handleReadyStateChange = (state: WalletReadyState) => {
      availableWallets = availableWallets.map((item) =>
        item.name === entry.name ? { ...item, readyState: state } : item
      );
    };

    adapter.on('connect', handleConnect);
    adapter.on('disconnect', handleDisconnect);
    adapter.on('error', handleError);
    adapter.on('readyStateChange', handleReadyStateChange);

    walletListeners.push(() => {
      adapter.off('connect', handleConnect);
      adapter.off('disconnect', handleDisconnect);
      adapter.off('error', handleError);
      adapter.off('readyStateChange', handleReadyStateChange);
    });

    if (adapter.connected && adapter.publicKey) {
      walletAddress = adapter.publicKey.toBase58();
    }

    return entry;
  }

  function selectWallet(name: string | null): void {
    if (!name) {
      wallet = null;
      selectedWalletName = null;
      walletAddress = null;
      return;
    }

    const entry = availableWallets.find((item) => item.name === name);
    if (!entry) {
      wallet = null;
      selectedWalletName = null;
      walletAddress = null;
      return;
    }

    if (wallet && wallet !== entry.adapter && wallet.connected) {
      wallet.disconnect().catch(() => {
        /* ignore */
      });
    }

    wallet = entry.adapter;
    selectedWalletName = name;
    walletError = null;

    if (wallet.connected && wallet.publicKey) {
      walletAddress = wallet.publicKey.toBase58();
    } else if (!wallet.connected) {
      walletAddress = null;
    }
  }

  async function connectSelectedWallet(): Promise<void> {
    if (!wallet) {
      walletError = 'Select a wallet before connecting.';
      return;
    }

    const entry = selectedWalletName
      ? availableWallets.find((item) => item.name === selectedWalletName)
      : null;

    if (!entry) {
      walletError = 'The selected wallet is no longer available.';
      return;
    }

    if (entry.readyState === WalletReadyState.NotDetected) {
      if (entry.url) {
        window.open(entry.url, '_blank', 'noopener');
        walletError = `Install ${entry.name} and reload this page.`;
        return;
      }
      walletError = `${entry.name} wallet not detected. Install the extension and try again.`;
      return;
    }

    walletConnecting = true;
    walletError = null;

    try {
      await wallet.connect();
      walletAddress = wallet.publicKey ? wallet.publicKey.toBase58() : null;
    } catch (connectError) {
      walletError = formatWalletError(connectError);
    } finally {
      walletConnecting = false;
    }
  }

  async function disconnectWallet(): Promise<void> {
    if (!wallet) {
      return;
    }

    try {
      await wallet.disconnect();
    } catch (disconnectError) {
      console.warn('Failed to disconnect wallet', disconnectError);
    } finally {
      walletAddress = null;
    }
  }

  async function fetchLatestSolanaBlockhash(): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  }> {
    const payload = await fetchJsonOrThrow<{ blockhash?: string; lastValidBlockHeight?: number }>(
      '/api/solana/blockhash',
      'Failed to fetch the latest Solana blockhash from the server.'
    );

    if (!payload.blockhash || typeof payload.lastValidBlockHeight !== 'number') {
      throw new Error('The blockhash response from the server was invalid.');
    }

    return {
      blockhash: payload.blockhash,
      lastValidBlockHeight: payload.lastValidBlockHeight
    };
  }

  async function checkAccountExists(address: PublicKey): Promise<boolean> {
    const payload = await fetchJsonOrThrow<{ exists?: boolean }>(
      `/api/solana/account/${address.toBase58()}`,
      'Failed to load account information from the server.'
    );

    return Boolean(payload.exists);
  }

  async function submitSignedTransaction(serialized: Uint8Array): Promise<string> {
    const payload = await fetchJsonOrThrow<{ signature?: string }>(
      '/api/solana/submit',
      'Failed to submit the transaction through the server.',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transaction: Buffer.from(serialized).toString('base64') })
      }
    );

    if (!payload.signature) {
      throw new Error('The server did not return a transaction signature.');
    }

    return payload.signature;
  }

  async function getTokenDecimals(mintAddress: PublicKey): Promise<number> {
    const cacheKey = mintAddress.toBase58();
    if (mintDecimalsCache.has(cacheKey)) {
      return mintDecimalsCache.get(cacheKey) as number;
    }

    const payload = await fetchJsonOrThrow<{ mint: string; decimals: number }>(
      `/api/solana/mint/${cacheKey}`,
      'Failed to load token metadata from the server.'
    );

    if (typeof payload.decimals !== 'number' || Number.isNaN(payload.decimals)) {
      throw new Error('The token metadata returned by the server was invalid.');
    }

    mintDecimalsCache.set(cacheKey, payload.decimals);
    return payload.decimals;
  }

  const toBaseUnits = (amount: number, decimals: number): bigint => {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const normalized = amount.toFixed(decimals);
    const integer = normalized.replace('.', '').replace(/^0+/, '') || '0';
    return BigInt(integer);
  };

  async function sendPaymentWithWallet(request: PendingPaymentRequest): Promise<void> {
    if (!wallet || !wallet.publicKey) {
      walletError = 'Connect a wallet before sending the payment.';
      return;
    }

    const amount = resolveAmount(request);
    const recipientAddress = resolveRecipient(request);
    const network = resolveNetwork(request);

    if (!amount || amount <= 0) {
      signatureErrors = {
        ...signatureErrors,
        [request.internalId]: 'Payment amount was missing from the request.'
      };
      return;
    }

    if (!recipientAddress) {
      signatureErrors = {
        ...signatureErrors,
        [request.internalId]: 'Payment recipient was missing from the request.'
      };
      return;
    }

    if (network && network.toLowerCase() !== 'solana') {
      signatureErrors = {
        ...signatureErrors,
        [request.internalId]: `Wallet payments are only available for Solana requests. (${network})`
      };
      return;
    }

    paymentInFlight = { ...paymentInFlight, [request.internalId]: true };

    try {
      const payer = wallet.publicKey;
      const recipient = new PublicKey(recipientAddress);
      const transaction = new Transaction();
      transaction.feePayer = payer;

      const { blockhash, lastValidBlockHeight } = await fetchLatestSolanaBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;

      const memo = resolveMemo(request);
      const assetType = resolveStringField([request.assetType]);
      const assetAddress = resolveStringField([request.assetAddress]);

      if (assetType === 'spl-token' && assetAddress) {
        const mint = new PublicKey(assetAddress);
        const decimals = await getTokenDecimals(mint);
        const transferAmount = toBaseUnits(amount, decimals);
        const sourceTokenAccount = await getAssociatedTokenAddress(mint, payer);
        const destinationTokenAccount = await getAssociatedTokenAddress(mint, recipient);

        const sourceExists = await checkAccountExists(sourceTokenAccount);
        if (!sourceExists) {
          throw new Error('Your wallet does not hold the required token for this payment.');
        }

        const destinationExists = await checkAccountExists(destinationTokenAccount);
        if (!destinationExists) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              payer,
              destinationTokenAccount,
              recipient,
              mint
            )
          );
        }

        transaction.add(
          createTransferInstruction(
            sourceTokenAccount,
            destinationTokenAccount,
            payer,
            transferAmount
          )
        );
      } else {
        const lamports = amount * LAMPORTS_PER_SOL;
        if (!Number.isFinite(lamports) || lamports <= 0) {
          throw new Error('Payment amount must be greater than zero.');
        }

        transaction.add(
          SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: recipient,
            lamports: Math.round(lamports)
          })
        );
      }

      if (memo) {
        transaction.add(
          new TransactionInstruction({
            keys: [],
            programId: MEMO_PROGRAM_ID,
            data: Buffer.from(memo, 'utf8')
          })
        );
      }

      const signTransaction = wallet.signTransaction?.bind(wallet);
      if (!signTransaction) {
        throw new Error('The selected wallet cannot sign transactions directly.');
      }

      const signedTransaction = await signTransaction(transaction);
      const rawTransaction = signedTransaction.serialize();
      const serializedBytes = rawTransaction instanceof Uint8Array ? rawTransaction : Uint8Array.from(rawTransaction);
      const signature = await submitSignedTransaction(serializedBytes);

      signatureInputs = { ...signatureInputs, [request.internalId]: signature };
      const { [request.internalId]: _removedError, ...rest } = signatureErrors;
      signatureErrors = rest;
      activePaymentId = request.internalId;

      await requestPayment();
    } catch (sendError) {
      console.error('Failed to send Solana payment', sendError);
      signatureErrors = {
        ...signatureErrors,
        [request.internalId]: formatWalletError(sendError)
      };
    } finally {
      paymentInFlight = { ...paymentInFlight, [request.internalId]: false };
    }
  }

  async function requestPayment(): Promise<void> {
    const selectedGroup = findSelectedGroup(selectedGroupId);

    if (!selectedGroup) {
      error = 'Select a group before sending a message.';
      return;
    }

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      error = 'Write the announcement you want the bot to post.';
      return;
    }

    resetStatus();
    loading = true;

    const signatureTargetId = activePaymentId;
    const trimmedSignature = signatureTargetId ? (signatureInputs[signatureTargetId]?.trim() ?? '') : '';

    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (trimmedSignature) {
        headers['x-payment-txhash'] = trimmedSignature;
      }

      const response = await fetch('/api/auctions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          groupId: selectedGroup.id,
          message: trimmedMessage,
          bidderName: sender.trim() ? sender.trim() : undefined
        })
      });

      const payload = parseJson(await response.text());

      if (response.status === 201) {
        successAuction = (payload as Auction) ?? null;
        message = '';
        sender = '';
        clearPendingPayments();
      } else if (response.status === 402) {
        const hasPaymentDetails =
          payload &&
          typeof payload === 'object' &&
          ('maxAmountRequired' in payload ||
            'amount' in payload ||
            'paymentAddress' in payload ||
            'recipient' in payload);

        if (hasPaymentDetails) {
          const pending = addOrUpdatePendingPayment(payload as PaymentRequestData);

          if (trimmedSignature && signatureTargetId) {
            signatureErrors = {
              ...signatureErrors,
              [signatureTargetId]:
                'We could not confirm that signature yet. Wait for the transaction to finalize on Solana, then try again.'
            };
          }

          if (!(pending.internalId in signatureInputs)) {
            signatureInputs = { ...signatureInputs, [pending.internalId]: '' };
          }
        } else {
          error = 'Payment details were not returned by the server.';
        }
      } else {
        const fallbackMessage =
          typeof payload === 'object' && payload !== null && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : 'Failed to submit the message. Please try again.';
        error = fallbackMessage;
      }
    } catch (requestError) {
      error =
        requestError instanceof Error
          ? requestError.message
          : 'Failed to submit the message. Please try again.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (!browser) {
      return;
    }

    const adapters = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new TrustWalletAdapter(),
      new TorusWalletAdapter()
    ];

    availableWallets = adapters
      .map((adapter) => registerAdapter(adapter))
      .filter((entry): entry is WalletEntry => entry !== null);

    if (availableWallets.length > 0) {
      const installed = availableWallets.find((entry) => entry.readyState === WalletReadyState.Installed);
      const initial = installed ?? availableWallets[0];
      selectWallet(initial.name);
    }
  });

  onDestroy(() => {
    walletListeners.forEach((unsubscribe) => unsubscribe());
    walletListeners.length = 0;
  });

  $: selectedGroup = findSelectedGroup(selectedGroupId);
  $: minimumBid = selectedGroup ? formatUsd(selectedGroup.minBid) : null;
  $: {
    if (pendingPayments.length === 0) {
      activePaymentId = null;
    } else if (!activePaymentId || !pendingPayments.some((item) => item.internalId === activePaymentId)) {
      activePaymentId = pendingPayments[0].internalId;
    }
  }
  $: activePayment = activePaymentId
    ? pendingPayments.find((item) => item.internalId === activePaymentId) ?? null
    : null;
  $: paymentAmount = activePayment ? resolveAmount(activePayment) : null;
  $: paymentCurrency = activePayment ? resolveCurrency(activePayment) ?? 'USDC' : 'USDC';
  $: paymentCurrencyLabel = paymentCurrency ? paymentCurrency.toUpperCase() : 'USDC';
  $: paymentAmountDisplay =
    paymentAmount !== null ? formatAmountForCurrency(paymentAmount, paymentCurrencyLabel) : null;
  $: paymentNetwork = activePayment ? resolveNetwork(activePayment) : null;
  $: paymentNetworkDisplay = paymentNetwork ? paymentNetwork : 'the configured network';
  $: paymentRecipient = activePayment ? resolveRecipient(activePayment) : null;
  $: paymentMemo = activePayment ? resolveMemo(activePayment) : null;
  $: paymentInstructions = activePayment?.instructions ?? null;
  $: paymentExpirationDisplay =
    activePayment && activePayment.expiresAt ? formatExpiration(activePayment.expiresAt) : null;
  $: submitButtonLabel = pendingPayments.length > 0 ? 'Submit payment confirmation' : 'Generate payment instructions';
  $: currentSignatureValue = activePaymentId ? signatureInputs[activePaymentId] ?? '' : '';
  $: currentSignatureError = activePaymentId ? signatureErrors[activePaymentId] ?? null : null;
  $: isPaymentSending = activePaymentId ? Boolean(paymentInFlight[activePaymentId]) : false;
  $: selectedWalletEntry = selectedWalletName
    ? availableWallets.find((entry) => entry.name === selectedWalletName) ?? null
    : null;
  $: canUseWalletForActivePayment =
    !!activePayment && (!resolveNetwork(activePayment) || resolveNetwork(activePayment)?.toLowerCase() === 'solana');
</script>

<section class="page" aria-labelledby="send-title">
  <header>
    <h2 id="send-title">Send a paid message</h2>
    <p>
      Fund your post with USDC on Solana. Once the payment clears, the bot drops the message into the selected Telegram
      group and shares a receipt with members.
    </p>
  </header>

  {#if data.loadError}
    <div class="status error" role="alert">
      <strong>Unable to load groups.</strong>
      <span>Refresh the page once the API is reachable.</span>
    </div>
  {/if}

  <form class="form" aria-label="Paid message form" on:submit|preventDefault={requestPayment}>
    <label>
      <span>Group</span>
      <select bind:value={selectedGroupId} disabled={activeGroups.length === 0 || loading}>
        {#if activeGroups.length === 0}
          <option value="">No active groups available</option>
        {/if}
        {#each activeGroups as group (group.id)}
          <option value={group.id}>{group.name} — {formatUsd(group.minBid)}</option>
        {/each}
      </select>
      {#if selectedGroup}
        <small class="field-note">
          Minimum bid {minimumBid} USDC. Payout wallet: <code>{selectedGroup.ownerAddress}</code>
        </small>
      {/if}
    </label>

    <label>
      <span>Sender name</span>
      <input
        type="text"
        bind:value={sender}
        placeholder="How should this message be credited?"
        maxlength={120}
        disabled={loading}
      />
    </label>

    <label>
      <span>Message</span>
      <textarea
        rows={5}
        bind:value={message}
        placeholder="Write the announcement you want the bot to post"
        maxlength={1000}
        disabled={loading || !selectedGroup}
      ></textarea>
    </label>

    <button type="submit" disabled={loading || !selectedGroup} aria-busy={loading}>
      {#if loading}
        Submitting…
      {:else}
        {submitButtonLabel}
      {/if}
    </button>
  </form>

  {#if error}
    <div class="status error" role="alert">
      <strong>We couldn't submit that message.</strong>
      <span>{error}</span>
    </div>
  {/if}

  {#if pendingPayments.length > 0}
    <section class="payment-center" aria-live="polite">
      <aside class="payment-list">
        <h3>Pending payment requests</h3>
        <ul>
          {#each pendingPayments as request (request.internalId)}
            <li class:selected={request.internalId === activePaymentId}>
              <button type="button" on:click={() => (activePaymentId = request.internalId)}>
                <span class="amount-label">
                  {#if resolveAmount(request) !== null}
                    {formatAmountForCurrency(resolveAmount(request) ?? 0, resolveCurrency(request) ?? 'USDC')}
                    {resolveCurrency(request) ? ` ${resolveCurrency(request)?.toUpperCase()}` : ''}
                  {:else}
                    Amount pending
                  {/if}
                </span>
                {#if request.expiresAt}
                  <span class="expires-label">
                    Expires {formatExpiration(request.expiresAt) ?? request.expiresAt}
                  </span>
                {/if}
                {#if signatureInputs[request.internalId]}
                  <span class="signature-flag">Signature saved</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </aside>

      <div class="payment-details">
        {#if activePayment}
          <div class="wallet-panel">
            <h4>Wallet connection</h4>
            {#if walletAddress}
              <p>
                <strong>{shortenAddress(walletAddress)}</strong> connected.
              </p>
              <div class="wallet-actions">
                <button type="button" on:click={disconnectWallet} disabled={walletConnecting}>
                  Disconnect
                </button>
              </div>
            {:else if availableWallets.length > 0}
              <label>
                <span>Choose wallet</span>
                <select bind:value={selectedWalletName} on:change={handleWalletSelection}>
                  {#each availableWallets as entry (entry.name)}
                    <option value={entry.name}>
                      {entry.name}
                      {#if entry.readyState === WalletReadyState.Installed}
                        (installed)
                      {:else if entry.readyState === WalletReadyState.Loadable}
                        (loadable)
                      {:else if entry.readyState === WalletReadyState.NotDetected}
                        (not detected)
                      {/if}
                    </option>
                  {/each}
                </select>
              </label>
              <div class="wallet-actions">
                <button type="button" on:click={connectSelectedWallet} disabled={walletConnecting}>
                  {walletConnecting ? 'Connecting…' : 'Connect wallet'}
                </button>
                {#if selectedWalletEntry && selectedWalletEntry.readyState === WalletReadyState.NotDetected && selectedWalletEntry.url}
                  <a class="install-link" href={selectedWalletEntry.url} target="_blank" rel="noreferrer">
                    Install {selectedWalletEntry.name}
                  </a>
                {/if}
              </div>
            {:else}
              <p class="wallet-warning">
                No compatible Solana wallets detected. Install Phantom, Solflare, Coinbase, Trust, or Torus, then reload this
                page.
              </p>
            {/if}
            {#if walletError}
              <p class="wallet-error">{walletError}</p>
            {/if}
          </div>

          <div class="payment-instructions">
            <h4>Payment details</h4>
            <p>
              {#if paymentAmountDisplay}
                Send {paymentAmountDisplay} {paymentCurrencyLabel}
              {:else}
                Send the required amount of {paymentCurrencyLabel}
              {/if}
              on {paymentNetworkDisplay}
              {#if paymentRecipient}
                to <code>{paymentRecipient}</code>
              {:else}
                to the configured payment address
              {/if}
              . After the transfer settles, submit the transaction signature below.
            </p>
            {#if paymentMemo}
              <p>
                Include memo <code>{paymentMemo}</code> with the transfer.
              </p>
            {/if}
            {#if paymentInstructions}
              <p>{paymentInstructions}</p>
            {/if}

            <div class="cta-row">
              <button
                type="button"
                class="wallet-pay"
                on:click={() => sendPaymentWithWallet(activePayment)}
                disabled={!canUseWalletForActivePayment || !wallet || walletConnecting || isPaymentSending}
              >
                {#if isPaymentSending}
                  Sending…
                {:else if !canUseWalletForActivePayment}
                  Wallet payment unavailable
                {:else if !wallet || !walletAddress}
                  Connect wallet to pay
                {:else}
                  Pay with connected wallet
                {/if}
              </button>
            </div>

            <label class="signature-field">
              <span>Transaction signature</span>
              <input
                type="text"
                value={currentSignatureValue}
                placeholder="Paste or generate the Solana transaction signature"
                on:input={(event) => updateSignatureForActive((event.target as HTMLInputElement).value)}
                disabled={loading}
              />
              <small>Resubmit this form after the transaction is confirmed on Solana.</small>
              {#if currentSignatureError}
                <span class="payload-error">{currentSignatureError}</span>
              {/if}
            </label>
            {#if paymentExpirationDisplay}
              <p class="footnote">Payment request expires {paymentExpirationDisplay}.</p>
            {/if}
          </div>
        {:else}
          <p class="payment-placeholder">Select a payment request to view the settlement instructions.</p>
        {/if}
      </div>
    </section>
  {/if}

  {#if successAuction && selectedGroup}
    <div class="status success" aria-live="polite" role="status">
      <h3>Payment confirmed</h3>
      <p>
        Your message for <strong>{selectedGroup.name}</strong> posted after receiving
        {formatUsd(successAuction.amount)} USDC. Check Telegram for the pinned receipt.
      </p>
    </div>
  {/if}

  <aside class="help" aria-live="polite">
    <h3>What happens next</h3>
    <ol>
      <li>Click “Generate payment instructions” to retrieve the required amount and payout address.</li>
      <li>Connect a Solana wallet and use the “Pay with connected wallet” button, or settle the transfer manually.</li>
      <li>Paste or confirm the transaction signature and submit the form again once the transfer finalizes.</li>
    </ol>
    <p>
      Need to adjust the price? Update it from the <a href="/groups">group directory</a> before sharing the link.
    </p>
  </aside>
</section>

<style>
  .page {
    max-width: 960px;
    margin: 0 auto;
    display: grid;
    gap: clamp(1.5rem, 3vw, 2.5rem);
  }

  header {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: clamp(2rem, 2vw + 1.5rem, 2.4rem);
    color: #111827;
  }

  p {
    margin: 0;
    color: #475569;
    line-height: 1.6;
  }

  .form {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
    display: grid;
    gap: 1rem;
  }

  label {
    display: grid;
    gap: 0.4rem;
  }

  span {
    font-weight: 600;
    color: #111827;
  }

  input,
  select,
  textarea {
    border: 1px solid #cbd5f5;
    border-radius: 10px;
    padding: 0.55rem 0.75rem;
    font: inherit;
    color: #111827;
    background: #f8fafc;
  }

  textarea {
    resize: vertical;
  }

  button {
    justify-self: start;
    padding: 0.55rem 1.25rem;
    border: none;
    border-radius: 10px;
    background: #111827;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }

  button[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .status {
    background: white;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
    display: grid;
    gap: 0.5rem;
  }

  .status h3 {
    margin: 0;
    font-size: 1.2rem;
  }

  .status.error {
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #991b1b;
  }

  .status.success {
    border: 1px solid #bbf7d0;
    background: #f0fdf4;
    color: #14532d;
  }

  .payment-center {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
    display: grid;
    gap: clamp(1.25rem, 2.5vw, 2rem);
  }

  @media (min-width: 960px) {
    .payment-center {
      grid-template-columns: minmax(240px, 1fr) minmax(0, 2fr);
    }
  }

  .payment-list h3 {
    margin: 0 0 0.75rem;
  }

  .payment-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  .payment-list li button {
    width: 100%;
    text-align: left;
    background: #f8fafc;
    border: 1px solid #dbeafe;
    color: #0f172a;
    border-radius: 12px;
    padding: 0.75rem;
    display: grid;
    gap: 0.25rem;
  }

  .payment-list li.selected button {
    border-color: #111827;
    background: rgba(17, 24, 39, 0.08);
  }

  .amount-label {
    font-weight: 600;
    color: #0f172a;
  }

  .expires-label {
    font-size: 0.85rem;
    color: #475569;
  }

  .signature-flag {
    font-size: 0.75rem;
    font-weight: 600;
    color: #047857;
  }

  .payment-details {
    display: grid;
    gap: clamp(1rem, 2vw, 1.5rem);
  }

  .wallet-panel,
  .payment-instructions {
    border: 1px solid #dbeafe;
    border-radius: 16px;
    padding: clamp(1rem, 2vw, 1.5rem);
    background: #f8fbff;
    display: grid;
    gap: 0.75rem;
  }

  .wallet-panel select {
    background: white;
  }

  .wallet-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .wallet-actions button {
    background: #0f172a;
  }

  .install-link {
    font-weight: 600;
    color: #0f172a;
    text-decoration: none;
  }

  .wallet-warning {
    font-size: 0.95rem;
    color: #9a3412;
  }

  .wallet-error {
    margin: 0;
    color: #b91c1c;
    font-weight: 600;
  }

  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .wallet-pay {
    background: #111827;
  }

  .signature-field {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.5rem;
  }

  .signature-field small {
    color: #0f172a;
    opacity: 0.8;
    font-size: 0.85rem;
  }

  .payload-error {
    color: #b91c1c;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .footnote {
    margin: 0;
    font-size: 0.95rem;
    color: inherit;
    opacity: 0.85;
  }

  .field-note {
    color: #475569;
    font-size: 0.9rem;
  }

  .payment-placeholder {
    color: #475569;
  }

  .help {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
    display: grid;
    gap: 0.75rem;
  }

  .help ol {
    margin: 0;
    padding-left: 1.2rem;
    color: #475569;
    line-height: 1.6;
  }

  a {
    color: #0f172a;
  }

  select[disabled],
  textarea[disabled],
  input[disabled] {
    background: #e2e8f0;
    cursor: not-allowed;
  }
</style>
