<script lang="ts">
  import { browser } from '$app/environment';

  import {
    buildPendingPaymentFromRecord,
    DEFAULT_FACILITATOR_URL,
    loadStoredPendingPayments,
    persistPendingPayments,
    type PaymentRequestData,
    type PendingPaymentRequest,
    type StoredPendingPaymentRecord
  } from '$lib/payments/storage';
  import { wallet } from '$lib/wallet/wallet.svelte';
  import type { PaymentHistoryEntry } from '$lib/types';

  const datetimeFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  let payments: PaymentHistoryEntry[] = [];
  let loading = false;
  let error: string | null = null;
  let lastWallet: string | null = null;
  let refreshingPaymentId: number | null = null;

  let pendingPayments: PendingPaymentRequest[] = [];
  let activePaymentId: string | null = null;
  let signatureInputs: Record<string, string> = {};
  let signatureErrors: Record<string, string | undefined> = {};
  let signatureSubmitted: Record<string, boolean> = {};
  let transactionRecords: Record<string, string | null> = {};
  let lastActivePaymentId: string | null = null;
  let pendingAction = false;
  let pendingStatus: string | null = null;
  let pendingError: string | null = null;

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
        const currency = resolveStringField([option.currencyCode]);
        if (currency) {
          return currency;
        }
      }
    }
    return null;
  };

  const resolveNetwork = (request: PaymentRequestData): string | null => {
    const direct = resolveStringField([request.network, request.networkId]);
    if (direct) {
      return direct;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        const network = resolveStringField([option.networkId]);
        if (network) {
          return network;
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
        const recipient = resolveStringField([option.recipient]);
        if (recipient) {
          return recipient;
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
        const memo = resolveStringField([option.memo]);
        if (memo) {
          return memo;
        }
      }
    }
    return null;
  };

  const resolveInstructions = (request: PaymentRequestData): string | null =>
    resolveStringField([request.instructions, request.description, request.resource]);

  const resolveAssetAddress = (request: PaymentRequestData): string | null => {
    const direct = resolveStringField([request.assetAddress]);
    if (direct) {
      return direct;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        const asset = resolveStringField([option.assetAddress]);
        if (asset) {
          return asset;
        }
      }
    }
    return null;
  };

  const resolveAssetType = (request: PaymentRequestData): string | null => {
    const direct = resolveStringField([request.assetType]);
    if (direct) {
      return direct;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        const assetType = resolveStringField([option.assetType]);
        if (assetType) {
          return assetType;
        }
      }
    }
    return null;
  };

  const formatAmountForCurrency = (amount: number, currency: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatNetwork = (value: string | null): string => {
    if (!value) {
      return 'Solana';
    }
    if (value.toLowerCase() === 'solana') {
      return 'Solana';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  const formatMemo = (memo: string | null): string | null => {
    if (!memo) {
      return null;
    }
    return memo.trim();
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

  function persistPendingState(): void {
    const records: StoredPendingPaymentRecord[] = pendingPayments.map((payment) => ({
      request: payment,
      signature: signatureInputs[payment.internalId]?.trim() || undefined,
      transaction:
        payment.internalId in transactionRecords ? transactionRecords[payment.internalId] : null,
      submitted: signatureSubmitted[payment.internalId] ?? false
    }));

    persistPendingPayments(records);
  }

  function applyStoredPending(records: StoredPendingPaymentRecord[]): void {
    pendingPayments = records
      .map((record) => record.request)
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt);

    signatureInputs = records.reduce<Record<string, string>>((acc, record) => {
      if (record.signature) {
        acc[record.request.internalId] = record.signature;
      }
      return acc;
    }, {});

    signatureSubmitted = records.reduce<Record<string, boolean>>((acc, record) => {
      if (record.submitted) {
        acc[record.request.internalId] = true;
      }
      return acc;
    }, {});

    transactionRecords = records.reduce<Record<string, string | null>>((acc, record) => {
      if (record.transaction !== undefined) {
        acc[record.request.internalId] = record.transaction;
      }
      return acc;
    }, {});

    if (pendingPayments.length > 0) {
      if (!activePaymentId || !pendingPayments.some((item) => item.internalId === activePaymentId)) {
        activePaymentId = pendingPayments[0].internalId;
      }
    } else {
      activePaymentId = null;
    }
  }

  if (browser) {
    applyStoredPending(loadStoredPendingPayments());
  }

  function applyServerPayments(records: PaymentHistoryEntry[]): void {
    if (!Array.isArray(records) || records.length === 0) {
      return;
    }

    let nextPending = [...pendingPayments];

    for (const entry of records) {
      const paymentId = entry.request.paymentId;
      if (!paymentId) {
        continue;
      }

      const reconstructed = buildPendingPaymentFromRecord(entry);
      const existingIndex = nextPending.findIndex((candidate) => candidate.internalId === paymentId);

      if (existingIndex >= 0) {
        const existing = nextPending[existingIndex];
        nextPending = nextPending.map((item, index) =>
          index === existingIndex
            ? { ...item, ...reconstructed, internalId: item.internalId, createdAt: item.createdAt }
            : item
        );
      } else {
        nextPending = [...nextPending, reconstructed];
      }

      if (entry.pending?.wireTransaction) {
        transactionRecords = { ...transactionRecords, [paymentId]: entry.pending.wireTransaction };
      }

      if (entry.pending?.signature) {
        signatureInputs = { ...signatureInputs, [paymentId]: entry.pending.signature };
        signatureSubmitted = { ...signatureSubmitted, [paymentId]: entry.pending.status !== 'failed' };
      }

      if (entry.pending?.status === 'failed') {
        signatureErrors = {
          ...signatureErrors,
          [paymentId]: entry.pending.error ??
            'The backend could not submit this transaction. Try signing and sending again.'
        };
      } else if (entry.request.status === 'confirmed' || entry.pending?.status === 'confirmed' || entry.verification) {
        const { [paymentId]: _removed, ...restErrors } = signatureErrors;
        signatureErrors = restErrors;
      }
    }

    pendingPayments = nextPending
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt);

    if (pendingPayments.length > 0) {
      if (!activePaymentId || !pendingPayments.some((item) => item.internalId === activePaymentId)) {
        activePaymentId = pendingPayments[0].internalId;
      }
    } else {
      activePaymentId = null;
    }

    persistPendingState();
  }

  function setActivePayment(id: string): void {
    if (activePaymentId === id) {
      return;
    }
    if (!pendingPayments.some((item) => item.internalId === id)) {
      return;
    }
    activePaymentId = id;
  }

  function updateSignatureFor(id: string, value: string): void {
    signatureInputs = { ...signatureInputs, [id]: value };
    persistPendingState();
  }

  function removePending(id: string): void {
    pendingPayments = pendingPayments.filter((item) => item.internalId !== id);
    const { [id]: _removedSignature, ...restSignatures } = signatureInputs;
    signatureInputs = restSignatures;
    const { [id]: _removedError, ...restErrors } = signatureErrors;
    signatureErrors = restErrors;
    const { [id]: _removedSubmitted, ...restSubmitted } = signatureSubmitted;
    signatureSubmitted = restSubmitted;
    const { [id]: _removedTx, ...restTransactions } = transactionRecords;
    transactionRecords = restTransactions;

    if (pendingPayments.length === 0) {
      activePaymentId = null;
    } else if (!activePaymentId || !pendingPayments.some((item) => item.internalId === activePaymentId)) {
      activePaymentId = pendingPayments[0].internalId;
    }

    persistPendingState();
  }

  function downloadTransaction(): void {
    if (!activePaymentId) {
      return;
    }

    const payload = transactionRecords[activePaymentId];
    if (!payload) {
      return;
    }

    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activePaymentId}-transaction.json`;
    anchor.rel = 'noopener';
    anchor.click();
    URL.revokeObjectURL(url);
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

  interface PaymentSubmissionResult {
    payment: PaymentHistoryEntry | null;
    error: string | null;
    status: number;
  }

  async function submitPaymentToBackend(params: {
    paymentId: string;
    signature?: string | null;
    wireTransaction?: string | null;
    payer?: string | null;
  }): Promise<PaymentSubmissionResult> {
    const body: Record<string, unknown> = { paymentId: params.paymentId };

    if (params.signature && params.signature.trim()) {
      body.signature = params.signature.trim();
    }

    if (params.wireTransaction && params.wireTransaction.trim()) {
      body.wireTransaction = params.wireTransaction.trim();
    }

    if (params.payer && params.payer.trim()) {
      body.payer = params.payer.trim();
    }

    const response = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });

    const text = await response.text();
    const payload = parseJson(text);
    const paymentEntry =
      payload && typeof payload === 'object' && 'payment' in payload
        ? ((payload as { payment?: PaymentHistoryEntry | null }).payment ?? null)
        : null;

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && payload !== null && 'error' in payload
          ? String((payload as { error?: unknown }).error ?? 'Failed to submit the transaction to the backend.')
          : 'Failed to submit the transaction to the backend.';

      return { payment: paymentEntry, error: message, status: response.status };
    }

    if (!paymentEntry) {
      return {
        payment: null,
        error: 'Unexpected response from the payment API.',
        status: response.status
      };
    }

    return { payment: paymentEntry, error: null, status: response.status };
  }

  async function submitActiveSignature(): Promise<void> {
    if (pendingAction) {
      return;
    }

    if (!activePaymentId) {
      pendingError = 'Select a payment request before submitting.';
      return;
    }

    const activePayment = pendingPayments.find((item) => item.internalId === activePaymentId) ?? null;
    if (!activePayment) {
      pendingError = 'The selected payment request is no longer available.';
      return;
    }

    const backendPaymentId = activePayment.paymentId?.trim() ?? activePayment.internalId;
    if (!backendPaymentId) {
      pendingError = 'The payment request is missing its backend identifier.';
      return;
    }

    const signature = (signatureInputs[activePaymentId] ?? '').trim();
    if (!signature) {
      signatureErrors = {
        ...signatureErrors,
        [activePaymentId]: 'Paste the transaction signature before submitting.'
      };
      return;
    }

    pendingAction = true;
    pendingStatus = 'Submitting signature…';
    pendingError = null;

    try {
      const submission = await submitPaymentToBackend({
        paymentId: backendPaymentId,
        signature,
        wireTransaction: transactionRecords[activePaymentId] ?? null,
        payer: $wallet.publicKey ?? null
      });

      if (submission.payment) {
        applyServerPayments([submission.payment]);
      }

      if (submission.error) {
      signatureErrors = { ...signatureErrors, [activePaymentId]: submission.error };
      pendingError = submission.error;
      return;
    }

      const { [activePaymentId]: _clearedError, ...remainingErrors } = signatureErrors;
      signatureErrors = remainingErrors;
      signatureSubmitted = { ...signatureSubmitted, [activePaymentId]: true };
      pendingStatus = 'Signature saved. Refresh to check confirmation.';
      persistPendingState();
    } catch (submissionError) {
      pendingError =
        submissionError instanceof Error
          ? submissionError.message
          : 'Failed to submit the payment signature.';
    } finally {
      pendingAction = false;
    }
  }

  async function refreshPendingStatus(): Promise<void> {
    if (pendingAction) {
      return;
    }

    if (!$wallet.connected || !$wallet.publicKey) {
      pendingError = 'Connect a wallet to refresh payment status.';
      return;
    }

    pendingAction = true;
    pendingStatus = 'Refreshing payment status…';
    pendingError = null;

    try {
      await fetchPayments($wallet.publicKey);
      pendingStatus = 'Payment status updated.';
    } catch (refreshError) {
      pendingError =
        refreshError instanceof Error
          ? refreshError.message
          : 'Failed to refresh payment status.';
    } finally {
      pendingAction = false;
    }
  }

  $: activePayment = activePaymentId
    ? pendingPayments.find((item) => item.internalId === activePaymentId) ?? null
    : null;

  $: currentSignatureValue = activePaymentId ? signatureInputs[activePaymentId] ?? '' : '';
  $: currentSignatureError = activePaymentId ? signatureErrors[activePaymentId] ?? null : null;
  $: activeSignatureSubmitted = activePaymentId ? signatureSubmitted[activePaymentId] ?? false : false;

  $: paymentAmount = activePayment ? resolveAmount(activePayment) : null;
  $: paymentCurrency = activePayment ? (resolveCurrency(activePayment)?.toUpperCase() ?? null) : null;
  $: paymentCurrencyLabel = paymentCurrency ?? 'USDC';
  $: paymentAmountDisplay =
    paymentAmount !== null && paymentCurrency ? formatAmountForCurrency(paymentAmount, paymentCurrency) : null;
  $: paymentNetwork = activePayment ? resolveNetwork(activePayment) : null;
  $: paymentNetworkDisplay = formatNetwork(paymentNetwork);
  $: paymentRecipient = activePayment ? resolveRecipient(activePayment) : null;
  $: paymentMemo = activePayment ? formatMemo(resolveMemo(activePayment)) : null;
  $: paymentInstructions = activePayment ? resolveInstructions(activePayment) : null;
  $: paymentExpiration = activePayment?.expiresAt
    ? formatExpiration(activePayment.expiresAt) ?? activePayment.expiresAt
    : null;
  $: hostedCheckoutLink = activePayment ? buildHostedCheckoutUrl(activePayment) : null;
  $: paymentAssetAddress = activePayment ? resolveAssetAddress(activePayment) : null;
  $: paymentAssetType = activePayment ? resolveAssetType(activePayment) : null;
  $: if (activePaymentId !== lastActivePaymentId) {
    lastActivePaymentId = activePaymentId;
    pendingStatus = null;
    pendingError = null;
  }

  async function fetchPayments(address: string): Promise<void> {
    loading = true;
    error = null;

    try {
      const response = await fetch(`/api/payments?wallet=${encodeURIComponent(address)}`);
      const payload = (await response.json()) as { payments?: PaymentHistoryEntry[]; error?: string };

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to load payment history.');
      }

      payments = Array.isArray(payload.payments) ? payload.payments : [];
      applyServerPayments(payments);
    } catch (fetchError) {
      console.warn('Failed to load payment history', fetchError);
      error = fetchError instanceof Error ? fetchError.message : 'Failed to load payment history.';
      payments = [];
    } finally {
      loading = false;
    }
  }

  function refresh(): void {
    refreshingPaymentId = null;
    if ($wallet.connected && $wallet.publicKey) {
      void fetchPayments($wallet.publicKey);
    }
  }

  async function refreshEntry(entry: PaymentHistoryEntry): Promise<void> {
    if (!$wallet.connected || !$wallet.publicKey) {
      return;
    }

    refreshingPaymentId = entry.request.id;

    try {
      await fetchPayments($wallet.publicKey);
    } finally {
      refreshingPaymentId = null;
    }
  }

  function formatTimestamp(value: string): string {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      return value;
    }
    return datetimeFormatter.format(new Date(timestamp));
  }

  function formatStatus(entry: PaymentHistoryEntry): string {
    if (entry.request.status === 'confirmed') {
      return 'Confirmed';
    }
    if (entry.pending?.status === 'failed') {
      return 'Failed';
    }
    if (entry.pending?.status === 'submitted') {
      return 'Submitted';
    }
    if (entry.pending?.status) {
      return entry.pending.status.charAt(0).toUpperCase() + entry.pending.status.slice(1);
    }
    return entry.request.status.charAt(0).toUpperCase() + entry.request.status.slice(1);
  }

  function shortSignature(signature: string | null | undefined): string | null {
    if (!signature) {
      return null;
    }
    return `${signature.slice(0, 8)}…${signature.slice(-6)}`;
  }

  function canRefreshEntry(entry: PaymentHistoryEntry): boolean {
    const status = entry.pending?.status ?? entry.request.status;
    return status === 'pending' || status === 'submitted' || status === 'failed';
  }

  $: if ($wallet.connected && $wallet.publicKey) {
    if (lastWallet !== $wallet.publicKey) {
      lastWallet = $wallet.publicKey;
      void fetchPayments($wallet.publicKey);
    }
  } else {
    payments = [];
    error = null;
    lastWallet = null;
  }
</script>

<section class="page" aria-labelledby="payments-title">
  <header>
    <h2 id="payments-title">Payment history</h2>
    <p>Review payments submitted through the in-browser flow.</p>
    <button type="button" class="refresh" on:click={refresh} aria-busy={loading} disabled={!$wallet.connected}>
      Refresh
    </button>
  </header>

  <section class="pending" aria-labelledby="pending-title">
    <div class="pending-header">
      <h3 id="pending-title">Pending payment requests</h3>
      <button
        type="button"
        class="pending-refresh"
        on:click={refreshPendingStatus}
        aria-busy={pendingAction}
        disabled={pendingAction || !$wallet.connected}
      >
        Refresh status
      </button>
    </div>

    {#if pendingPayments.length === 0}
      <div class="pending-empty">
        <strong>No pending payments stored.</strong>
        <span>Submit a paid message to generate payment instructions.</span>
      </div>
    {:else}
      <div class="pending-layout" aria-live="polite">
        <aside class="pending-list" aria-label="Stored payment requests">
          <ul>
            {#each pendingPayments as request (request.internalId)}
              <li class:selected={request.internalId === activePaymentId}>
                <button type="button" on:click={() => setActivePayment(request.internalId)}>
                  <span class="amount-label">
                    {#if resolveAmount(request) !== null}
                      {formatAmountForCurrency(resolveAmount(request) ?? 0, (resolveCurrency(request) ?? 'USDC').toUpperCase())}
                    {:else}
                      Amount pending
                    {/if}
                  </span>
                  {#if request.expiresAt}
                    <span class="expires-label">
                      Expires {formatExpiration(request.expiresAt) ?? request.expiresAt}
                    </span>
                  {/if}
                  {#if signatureSubmitted[request.internalId]}
                    <span class="signature-flag">Signature saved</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        </aside>

        <div class="pending-details">
          {#if activePayment}
            <div class="hosted-panel">
              <h4>Hosted checkout</h4>
              {#if hostedCheckoutLink}
                <p>
                  Open the hosted facilitator in a new tab to complete this payment without using a connected wallet.
                </p>
                <a class="hosted-checkout" href={hostedCheckoutLink} target="_blank" rel="noreferrer">
                  Open hosted checkout
                </a>
                <p class="hosted-hint">
                  After confirming the transfer, copy the transaction signature back into this page and submit it below.
                </p>
              {:else}
                <p>
                  Use the instructions below to settle the transfer from your preferred Solana wallet, then paste the
                  signature once it finalizes.
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
                .
              </p>
              {#if paymentAssetAddress}
                <p>
                  Asset address: <code>{paymentAssetAddress}</code>
                  {#if paymentAssetType}
                    <small>({paymentAssetType})</small>
                  {/if}
                </p>
              {/if}
              {#if paymentMemo}
                <p>Include memo <code>{paymentMemo}</code> with the transfer.</p>
              {/if}
              {#if paymentInstructions}
                <p>{paymentInstructions}</p>
              {/if}
              {#if paymentExpiration}
                <p class="expires-note">Payment expires {paymentExpiration}.</p>
              {/if}

              <label class="signature-field">
                <span>Transaction signature</span>
                <input
                  type="text"
                  value={currentSignatureValue}
                  placeholder="Paste the Solana transaction signature"
                  on:input={(event) => {
                    if (activePaymentId) {
                      updateSignatureFor(activePaymentId, (event.target as HTMLInputElement).value);
                    }
                  }}
                  disabled={pendingAction}
                />
                <small>Submit after the transaction is confirmed on Solana.</small>
                {#if currentSignatureError}
                  <span class="payload-error">{currentSignatureError}</span>
                {/if}
              </label>

              <div class="signature-actions" aria-live="polite">
                <button type="button" class="primary" on:click={submitActiveSignature} disabled={pendingAction}>
                  {#if pendingAction}
                    Submitting…
                  {:else}
                    Submit signature
                  {/if}
                </button>
                <button
                  type="button"
                  class="secondary"
                  on:click={refreshPendingStatus}
                  disabled={pendingAction || !$wallet.connected}
                >
                  Refresh status
                </button>
              </div>

              <div class="pending-actions">
                <button type="button" class="dismiss" on:click={() => removePending(activePayment.internalId)}>
                  Remove request
                </button>
                {#if transactionRecords[activePayment.internalId]}
                  <button type="button" class="download" on:click={downloadTransaction}>
                    Download unsigned transaction
                  </button>
                {/if}
              </div>

              {#if pendingError}
                <div class="pending-feedback error" role="alert">{pendingError}</div>
              {:else if pendingStatus}
                <div class="pending-feedback info">{pendingStatus}</div>
              {/if}
            </div>
          {:else}
            <div class="no-selection">
              <p>Select a payment request to view instructions.</p>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </section>

  {#if !$wallet.connected}
    <div class="status info">
      <strong>Connect a wallet to view payments.</strong>
      <span>Use the connect button in the header to link a Solana wallet.</span>
    </div>
  {:else if loading}
    <div class="status" aria-live="polite">Loading payment history…</div>
  {:else if error}
    <div class="status error" role="alert">
      <strong>Unable to load payments.</strong>
      <span>{error}</span>
    </div>
  {:else if payments.length === 0}
    <div class="status info">
      <strong>No payments found.</strong>
      <span>Send a paid message to see it listed here.</span>
    </div>
  {:else}
    <table class="payments-table">
      <thead>
        <tr>
          <th scope="col">Payment</th>
          <th scope="col">Amount</th>
          <th scope="col">Status</th>
          <th scope="col">Signature</th>
          <th scope="col">Updated</th>
        </tr>
      </thead>
      <tbody>
        {#each payments as entry (entry.request.paymentId)}
          <tr>
            <td>
              <div class="cell-primary">
                <span class="payment-id">{entry.request.paymentId}</span>
                <small class="network">{entry.request.network.toUpperCase()}</small>
              </div>
              {#if entry.request.memo}
                <div class="memo">Memo: {entry.request.memo}</div>
              {/if}
            </td>
            <td>
              <strong>{entry.request.amount.toFixed(2)} {entry.request.currency}</strong>
              <small class="recipient">→ {entry.request.recipient}</small>
            </td>
            <td>
              <span class={`status-pill ${formatStatus(entry).toLowerCase()}`}>
                {formatStatus(entry)}
              </span>
              {#if canRefreshEntry(entry)}
                <button
                  type="button"
                  class="row-refresh"
                  on:click={() => void refreshEntry(entry)}
                  aria-busy={loading && refreshingPaymentId === entry.request.id}
                  disabled={loading}
                >
                  {#if loading && refreshingPaymentId === entry.request.id}
                    Refreshing…
                  {:else}
                    Refresh
                  {/if}
                </button>
              {/if}
              {#if entry.pending?.error}
                <div class="status-note">{entry.pending.error}</div>
              {/if}
            </td>
            <td>
              {#if shortSignature(entry.pending?.signature ?? entry.request.lastSignature)}
                <code>{shortSignature(entry.pending?.signature ?? entry.request.lastSignature)}</code>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td>
              <span>{formatTimestamp(entry.pending?.updatedAt ?? entry.request.updatedAt)}</span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  header {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .refresh {
    align-self: flex-start;
    background: #111827;
    color: white;
    border: none;
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    font-size: 0.95rem;
    cursor: pointer;
    transition: opacity 0.2s ease;
  }

  .refresh[disabled] {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .pending {
    background: white;
    border-radius: 0.75rem;
    padding: 1.5rem;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .pending-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .pending-refresh {
    border: 1px solid #111827;
    background: transparent;
    color: #111827;
    border-radius: 999px;
    padding: 0.4rem 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }

  .pending-refresh:hover,
  .pending-refresh:focus-visible {
    background: #111827;
    color: #f9fafb;
  }

  .pending-refresh[disabled] {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .pending-empty {
    border: 1px dashed #cbd5f5;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: #475569;
    background: #f8fafc;
  }

  .pending-layout {
    display: grid;
    gap: 1.5rem;
  }

  @media (min-width: 960px) {
    .pending-layout {
      grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr);
    }
  }

  .pending-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .pending-list li button {
    width: 100%;
    text-align: left;
    border: 1px solid #e5e7eb;
    background: #f8fafc;
    border-radius: 0.75rem;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .pending-list li.selected button,
  .pending-list li button:hover,
  .pending-list li button:focus-visible {
    border-color: #111827;
    background: #eef2ff;
  }

  .amount-label {
    font-weight: 600;
    color: #111827;
  }

  .expires-label {
    font-size: 0.8rem;
    color: #475569;
  }

  .signature-flag {
    font-size: 0.75rem;
    font-weight: 600;
    color: #047857;
    background: rgba(16, 185, 129, 0.15);
    border-radius: 999px;
    padding: 0.15rem 0.5rem;
    align-self: flex-start;
  }

  .pending-details {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .hosted-panel,
  .payment-instructions {
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: grid;
    gap: 0.75rem;
    background: #f9fafb;
  }

  .hosted-checkout {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #2563eb;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 999px;
    font-weight: 600;
    text-decoration: none;
  }

  .hosted-hint,
  .expires-note {
    font-size: 0.85rem;
    color: #475569;
  }

  .signature-field {
    display: grid;
    gap: 0.35rem;
  }

  .signature-field input {
    border: 1px solid #d1d5db;
    border-radius: 0.6rem;
    padding: 0.55rem 0.75rem;
    font-size: 0.95rem;
  }

  .signature-field small {
    font-size: 0.8rem;
    color: #6b7280;
  }

  .payload-error {
    color: #b91c1c;
    font-size: 0.85rem;
  }

  .signature-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .signature-actions .primary {
    background: #111827;
    color: #f9fafb;
    border: none;
    border-radius: 999px;
    padding: 0.5rem 1.25rem;
    font-weight: 600;
    cursor: pointer;
  }

  .signature-actions .secondary {
    border: 1px solid #d1d5db;
    background: transparent;
    color: #1f2937;
    border-radius: 999px;
    padding: 0.5rem 1.1rem;
    font-weight: 600;
    cursor: pointer;
  }

  .signature-actions button[disabled] {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .pending-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }

  .pending-actions button {
    border: 1px solid #d1d5db;
    background: transparent;
    color: #1f2937;
    border-radius: 999px;
    padding: 0.4rem 1rem;
    font-weight: 600;
    cursor: pointer;
  }

  .pending-actions .dismiss {
    border-color: #dc2626;
    color: #b91c1c;
  }

  .pending-feedback {
    padding: 0.65rem 0.75rem;
    border-radius: 0.6rem;
    font-size: 0.9rem;
  }

  .pending-feedback.error {
    background: rgba(248, 113, 113, 0.15);
    color: #b91c1c;
  }

  .pending-feedback.info {
    background: rgba(59, 130, 246, 0.15);
    color: #1d4ed8;
  }

  .status {
    background: white;
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .status.info {
    border-left: 4px solid #2563eb;
  }

  .status.error {
    border-left: 4px solid #dc2626;
  }

  .payments-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  }

  .payments-table th,
  .payments-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    text-align: left;
    vertical-align: top;
  }

  .payments-table tbody tr:last-child td {
    border-bottom: none;
  }

  .cell-primary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .payment-id {
    font-weight: 600;
  }

  .network {
    background: rgba(37, 99, 235, 0.12);
    color: #1d4ed8;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .memo {
    margin-top: 0.35rem;
    font-size: 0.85rem;
    color: #4b5563;
  }

  .recipient {
    display: block;
    font-size: 0.85rem;
    color: #4b5563;
  }

  .status-pill {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .status-pill.confirmed {
    background: rgba(16, 185, 129, 0.12);
    color: #047857;
  }

  .status-pill.failed {
    background: rgba(248, 113, 113, 0.12);
    color: #b91c1c;
  }

  .status-pill.submitted,
  .status-pill.pending {
    background: rgba(251, 191, 36, 0.12);
    color: #d97706;
  }

  .row-refresh {
    margin-top: 0.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    background: transparent;
    border: 1px solid #d1d5db;
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #1f2937;
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
  }

  .row-refresh:hover,
  .row-refresh:focus-visible {
    background: #111827;
    color: #f9fafb;
    border-color: #111827;
  }

  .row-refresh[disabled] {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .status-note {
    margin-top: 0.35rem;
    font-size: 0.8rem;
    color: #b91c1c;
  }

  .muted {
    color: #9ca3af;
  }

  @media (max-width: 768px) {
    .payments-table th,
    .payments-table td {
      padding: 0.65rem;
    }

    header {
      gap: 0.5rem;
    }
  }
</style>
