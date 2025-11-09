<script lang="ts">
  import { browser } from '$app/environment';
  import {
    Connection,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction
  } from '@solana/web3.js';
  import {
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
    getAssociatedTokenAddress,
    getMint
  } from '@solana/spl-token';
  import { Buffer } from 'buffer';
  import type { Auction, Group } from '$lib/types';
  import { wallet } from '$lib/wallet/wallet.svelte';

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
    checkout?: string;
    facilitator?: string;
  }

  interface PendingPaymentRequest extends PaymentRequestData {
    internalId: string;
    createdAt: number;
  }

  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

  const DEFAULT_FACILITATOR_URL = 'https://facilitator.payai.network/pay';

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
  let walletProcessing = false;
  let walletStatus: string | null = null;
  let walletError: string | null = null;
  let lastActivePaymentId: string | null = null;
  let walletConnected = false;
  let walletPublicKey: PublicKey | null = null;
  let solanaConnection: Connection | null = null;
  let currentRpcEndpoint: string | null = null;
  let walletPaymentSupported = false;
  let canUseWallet = false;
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

  const buildHostedCheckoutUrl = (request: PaymentRequestData): string | null => {
    const amount = resolveAmount(request);
    const recipient = resolveRecipient(request);

    if (amount === null || !recipient) {
      return null;
    }

    const currency = resolveCurrency(request) ?? 'USDC';
    const network = resolveNetwork(request) ?? 'Solana';
    const memo = resolveMemo(request);
    const checkout = resolveStringField([request.checkout]);
    const facilitator = resolveStringField([request.facilitator]) ?? DEFAULT_FACILITATOR_URL;
    const params = new URLSearchParams();

    params.set('amount', amount.toString());
    params.set('recipient', recipient);
    params.set('currency', currency);
    params.set('network', network);

    if (request.groupName) {
      params.set('group', request.groupName);
    }

    if (memo) {
      params.set('memo', memo);
    }

    if (request.paymentId) {
      params.set('paymentId', request.paymentId);
    }

    if (request.nonce) {
      params.set('nonce', request.nonce);
    }

    if (request.expiresAt) {
      params.set('expiresAt', request.expiresAt);
    }

    if (checkout) {
      params.set('checkout', checkout);
    }

    if (facilitator) {
      params.set('facilitator', facilitator);
    }

    return `/pay?${params.toString()}`;
  };

  const isSupportedWalletPayment = (request: PaymentRequestData | null): boolean => {
    if (!request) {
      return false;
    }

    const network = resolveNetwork(request)?.toLowerCase();
    if (network !== 'solana') {
      return false;
    }

    const currency = resolveCurrency(request)?.toUpperCase() ?? 'USDC';
    if (currency === 'SOL') {
      return true;
    }

    if ((currency === 'USDC' || currency === 'USD') && request.assetAddress) {
      return true;
    }

    return false;
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
  }

  function updateSignatureForActive(value: string): void {
    if (!activePaymentId) {
      return;
    }
    signatureInputs = { ...signatureInputs, [activePaymentId]: value };
    const { [activePaymentId]: _removed, ...rest } = signatureErrors;
    signatureErrors = rest;
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

  async function payWithWallet(): Promise<void> {
    const state = $wallet;
    const request = activePayment;

    if (!request) {
      walletError = 'Select a payment request to continue.';
      return;
    }

    if (!state.connected || !state.publicKey) {
      walletError = 'Connect a Solana wallet before paying.';
      return;
    }

    if (!solanaConnection) {
      walletError = 'Solana connection is still initializing. Try again in a moment.';
      return;
    }

    if (!isSupportedWalletPayment(request)) {
      walletError = 'This payment request cannot be settled with the in-browser wallet flow.';
      return;
    }

    const amount = resolveAmount(request);
    const recipientAddress = resolveRecipient(request);
    const memo = resolveMemo(request);
    const currency = (resolveCurrency(request) ?? 'USDC').toUpperCase();

    if (amount === null || amount <= 0) {
      walletError = 'The payment amount returned by the server is invalid.';
      return;
    }

    if (!recipientAddress) {
      walletError = 'The payment request is missing a recipient address.';
      return;
    }

    walletError = null;
    walletStatus = null;
    walletProcessing = true;

    try {
      const connection = solanaConnection;
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      const payer = state.publicKey;
      const transaction = new Transaction({
        feePayer: payer,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      });

      if (currency === 'SOL') {
        let lamports = Math.round(amount * LAMPORTS_PER_SOL);
        if (!Number.isFinite(lamports) || lamports <= 0) {
          throw new Error('The SOL amount is too small to send.');
        }

        const recipient = new PublicKey(recipientAddress);
        transaction.add(
          SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports })
        );
      } else {
        const mintAddress = request.assetAddress;
        if (!mintAddress) {
          throw new Error('This payment requires a token mint address.');
        }

        const mint = new PublicKey(mintAddress);
        const payerAta = await getAssociatedTokenAddress(mint, payer);
        const recipientWallet = new PublicKey(recipientAddress);
        const recipientAta = await getAssociatedTokenAddress(mint, recipientWallet);

        const payerAccountInfo = await connection.getAccountInfo(payerAta, 'confirmed');
        if (!payerAccountInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(payer, payerAta, payer, mint)
          );
        }

        const recipientAccountInfo = await connection.getAccountInfo(recipientAta, 'confirmed');
        if (!recipientAccountInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(payer, recipientAta, recipientWallet, mint)
          );
        }

        const mintInfo = await getMint(connection, mint);
        const decimals = typeof mintInfo.decimals === 'number' ? mintInfo.decimals : 6;
        const multiplier = Math.pow(10, decimals);
        const baseUnits = BigInt(Math.round(amount * multiplier));

        if (baseUnits <= 0n) {
          throw new Error('The token amount is too small to transfer.');
        }

        transaction.add(
          createTransferInstruction(payerAta, recipientAta, payer, baseUnits)
        );
      }

      if (memo) {
        const memoInstruction = new TransactionInstruction({
          keys: [],
          programId: MEMO_PROGRAM_ID,
          data: Buffer.from(new TextEncoder().encode(memo))
        });
        transaction.add(memoInstruction);
      }

      const signature = await wallet.sendTransaction(transaction, connection);

      walletStatus = 'Transaction submitted. Awaiting confirmation…';

      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        },
        'confirmed'
      );

      walletStatus = 'Transaction confirmed. Sending the receipt to the server…';
      updateSignatureForActive(signature);
      await requestPayment();

      if (successAuction) {
        walletStatus = 'Payment confirmed. Your message will be posted shortly.';
      } else if (!error) {
        walletStatus = 'Transaction confirmed. Awaiting server confirmation…';
      }
    } catch (walletException) {
      console.error('Wallet payment failed', walletException);
      walletError =
        walletException instanceof Error
          ? walletException.message
          : 'Failed to process the wallet payment. Please try again.';
    } finally {
      walletProcessing = false;
    }
  }

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
  $: hostedCheckoutLink = activePayment ? buildHostedCheckoutUrl(activePayment) : null;
  $: paymentExpirationDisplay =
    activePayment && activePayment.expiresAt ? formatExpiration(activePayment.expiresAt) : null;
  $: submitButtonLabel = pendingPayments.length > 0 ? 'Submit payment confirmation' : 'Generate payment instructions';
  $: currentSignatureValue = activePaymentId ? signatureInputs[activePaymentId] ?? '' : '';
  $: currentSignatureError = activePaymentId ? signatureErrors[activePaymentId] ?? null : null;
  $: walletConnected = $wallet.connected;
  $: walletPublicKey = $wallet.publicKey ?? null;
  $: if (browser && $wallet.rpcEndpoint && $wallet.rpcEndpoint !== currentRpcEndpoint) {
    currentRpcEndpoint = $wallet.rpcEndpoint;
    solanaConnection = new Connection($wallet.rpcEndpoint, 'confirmed');
  }
  $: walletPaymentSupported = isSupportedWalletPayment(activePayment);
  $: canUseWallet = Boolean(
    walletPaymentSupported && walletConnected && walletPublicKey && solanaConnection
  );
  $: if (activePaymentId !== lastActivePaymentId) {
    walletError = null;
    walletStatus = null;
    walletProcessing = false;
    lastActivePaymentId = activePaymentId;
  }
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
          <div class="hosted-panel">
            <h4>Hosted checkout</h4>
            {#if hostedCheckoutLink}
              <p>
                Open the hosted facilitator in a new tab to complete this payment without connecting a browser wallet here.
              </p>
              <a class="hosted-checkout" href={hostedCheckoutLink} target="_blank" rel="noreferrer">
                Open hosted checkout
              </a>
              <p class="hosted-hint">
                After confirming the transfer, copy the transaction signature back into this page before resubmitting the
                form.
              </p>
            {:else}
              <p>
                Use the instructions below to settle the transfer from your preferred Solana wallet, then paste the signature
                here once it finalizes.
              </p>
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

            {#if walletPaymentSupported}
              <div class="wallet-settlement" aria-live="polite">
                <button
                  type="button"
                  class="wallet-pay-button"
                  on:click={payWithWallet}
                  disabled={walletProcessing || loading || !canUseWallet}
                >
                  {#if walletProcessing}
                    Paying with wallet…
                  {:else if !walletConnected}
                    Connect a wallet to pay
                  {:else}
                    Pay with connected wallet
                  {/if}
                </button>
                {#if !walletConnected}
                  <p class="wallet-hint">Use the wallet button in the header to connect.</p>
                {/if}
                {#if walletError}
                  <p class="wallet-error">{walletError}</p>
                {/if}
                {#if walletStatus}
                  <p class="wallet-status">{walletStatus}</p>
                {/if}
              </div>
            {/if}

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
      <li>Open the hosted facilitator link (or settle the transfer from your own wallet) to broadcast the payment.</li>
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

  .hosted-panel,
  .payment-instructions {
    border: 1px solid #dbeafe;
    border-radius: 16px;
    padding: clamp(1rem, 2vw, 1.5rem);
    background: #f8fbff;
    display: grid;
    gap: 0.75rem;
  }

  .hosted-checkout {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.55rem 1.25rem;
    border-radius: 10px;
    background: #2563eb;
    color: #fff;
    font-weight: 600;
    text-decoration: none;
  }

  .hosted-checkout:hover {
    background: #1d4ed8;
  }

  .hosted-hint {
    margin: 0.25rem 0 0;
    font-size: 0.9rem;
    color: #475569;
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

  .wallet-settlement {
    display: grid;
    gap: 0.5rem;
    margin: 0.5rem 0 0;
  }

  .wallet-pay-button {
    justify-self: start;
    padding: 0.55rem 1.25rem;
    border: none;
    border-radius: 10px;
    background: #2563eb;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }

  .wallet-pay-button[disabled] {
    background: #94a3b8;
    cursor: not-allowed;
  }

  .wallet-hint {
    margin: 0;
    font-size: 0.9rem;
    color: #475569;
  }

  .wallet-error {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #b91c1c;
  }

  .wallet-status {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #047857;
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
