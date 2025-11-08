<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Auction, Group } from '$lib/types';

  interface PaymentAcceptOption {
    scheme?: string;
    networkId?: string;
    currencyCode?: string;
    amount?: number;
    recipient?: string;
    facilitator?: string;
    url?: string;
    assetAddress?: string;
    assetType?: string;
    paymentId?: string;
    nonce?: string;
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
    facilitator?: string;
    checkoutUrl?: string;
    accepts?: PaymentAcceptOption[];
    description?: string;
    resource?: string;
    expiresAt?: string;
    paymentId?: string;
    nonce?: string;
    memo?: string;
    groupName?: string;
  }

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
  let paymentRequest: PaymentRequestData | null = null;
  let successAuction: Auction | null = null;
  let paymentPayloadInput = '';
  let paymentPayloadNotice: string | null = null;
  let paymentPayloadError: string | null = null;
  let lastCheckoutWindow: Window | null = null;
  let paymentAmount: number | null = null;
  let paymentCurrency: string | null = null;
  let paymentNetwork: string | null = null;
  let paymentRecipient: string | null = null;
  let paymentFacilitator: string | null = null;
  let paymentAmountDisplay: string | null = null;
  let paymentCurrencyLabel = 'USDC';
  let paymentNetworkDisplay = 'the configured network';
  let paymentExpirationDisplay: string | null = null;
  let resolvedMemo = '';

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

  const resetStatus = () => {
    error = null;
    paymentRequest = null;
    successAuction = null;
    paymentPayloadNotice = null;
    paymentPayloadError = null;
  };

  const clearPaymentPayload = () => {
    paymentPayloadInput = '';
    paymentPayloadNotice = null;
    paymentPayloadError = null;
  };

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

  const resolveFacilitator = (request: PaymentRequestData): string | null => {
    const direct = resolveStringField([request.facilitator]);
    if (direct) {
      return direct;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        const found = resolveStringField([option.facilitator, option.url]);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  const resolvePaymentId = (request: PaymentRequestData): string | null => {
    const direct = resolveStringField([request.paymentId]);
    if (direct) {
      return direct;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        const found = resolveStringField([option.paymentId]);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  const resolveNonce = (request: PaymentRequestData): string | null => {
    const direct = resolveStringField([request.nonce]);
    if (direct) {
      return direct;
    }
    if (request.accepts) {
      for (const option of request.accepts) {
        const found = resolveStringField([option.nonce]);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  function buildPaymentUrl(request: PaymentRequestData, group: Group | null, note: string): string {
    const url = new URL('https://payai.network/pay');
    const amount = resolveAmount(request);
    const recipient = resolveRecipient(request);
    const currency = resolveCurrency(request);
    const network = resolveNetwork(request);
    const facilitator = resolveFacilitator(request);
    const paymentId = resolvePaymentId(request);
    const nonce = resolveNonce(request);

    if (amount !== null) {
      url.searchParams.set('amount', amount.toString());
    }

    if (recipient) {
      url.searchParams.set('recipient', recipient);
    }

    if (currency) {
      url.searchParams.set('currency', currency);
    }

    if (network) {
      url.searchParams.set('network', network);
    }

    if (group) {
      url.searchParams.set('group', group.name);
    }

    if (note) {
      url.searchParams.set('memo', note);
    }

    if (facilitator) {
      url.searchParams.set('facilitator', facilitator);
    }

    if (paymentId) {
      url.searchParams.set('paymentId', paymentId);
    }

    if (nonce) {
      url.searchParams.set('nonce', nonce);
    }

    return url.toString();
  }

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

    try {
      const trimmedPayload = paymentPayloadInput.trim();
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (trimmedPayload) {
        headers['x-payment'] = trimmedPayload;
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
        clearPaymentPayload();
      } else if (response.status === 402) {
        const hasPaymentDetails =
          payload &&
          typeof payload === 'object' &&
          ('maxAmountRequired' in payload || 'amount' in payload || 'paymentAddress' in payload || 'recipient' in payload);

        if (hasPaymentDetails) {
          paymentRequest = payload as PaymentRequestData;
          if (trimmedPayload) {
            paymentPayloadError =
              'The facilitator has not confirmed this payment yet. Wait a few seconds and try again after the checkout reports the transfer is complete.';
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

  $: selectedGroup = findSelectedGroup(selectedGroupId);
  $: minimumBid = selectedGroup ? formatUsd(selectedGroup.minBid) : null;
  $: resolvedMemo = paymentRequest?.memo?.trim() ?? message.trim();
  $: paymentUrl = paymentRequest
    ? paymentRequest.checkoutUrl ?? buildPaymentUrl(paymentRequest, selectedGroup, resolvedMemo)
    : null;
  $: paymentAmount = paymentRequest ? resolveAmount(paymentRequest) : null;
  $: paymentCurrency = paymentRequest ? resolveCurrency(paymentRequest) : null;
  $: paymentNetwork = paymentRequest ? resolveNetwork(paymentRequest) : null;
  $: paymentRecipient = paymentRequest ? resolveRecipient(paymentRequest) : null;
  $: paymentFacilitator = paymentRequest ? resolveFacilitator(paymentRequest) : null;
  $: paymentCurrencyLabel = (paymentCurrency ?? 'USDC').toUpperCase();
  $: paymentAmountDisplay =
    paymentAmount !== null ? formatAmountForCurrency(paymentAmount, paymentCurrencyLabel) : null;
  $: paymentNetworkDisplay = paymentNetwork ?? 'the configured network';
  $: paymentExpirationDisplay =
    paymentRequest?.expiresAt ? formatExpiration(paymentRequest.expiresAt) : null;
  $: submitButtonLabel = paymentRequest
    ? paymentPayloadInput.trim()
      ? 'Submit payment confirmation'
      : 'Check payment status'
    : 'Generate payment link';

  const applyDetectedPayload = (rawPayload: string) => {
    const trimmed = rawPayload.trim();
    if (!trimmed) {
      return;
    }

    paymentPayloadInput = trimmed;
    paymentPayloadNotice = 'Captured payment payload from the x402 checkout window.';
    paymentPayloadError = null;
  };

  const extractPaymentPayload = (data: unknown): string | null => {
    if (typeof data === 'string') {
      const trimmed = data.trim();
      if (!trimmed) {
        return null;
      }
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          return extractPaymentPayload(parsed);
        } catch (parseError) {
          console.warn('Unable to parse payment payload message', parseError);
          return null;
        }
      }
      return trimmed;
    }

    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const candidateKeys = ['paymentPayload', 'payload', 'x402'];
      for (const key of candidateKeys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      if (typeof record.type === 'string' && record.type.toLowerCase().includes('payment')) {
        const nested = record.data ?? record.payload ?? record.paymentPayload;
        if (typeof nested === 'string' && nested.trim()) {
          return nested.trim();
        }
      }
    }

    return null;
  };

  const handlePaymentMessage = (event: MessageEvent) => {
    if (!paymentRequest) {
      return;
    }

    if (paymentUrl) {
      try {
        const checkoutOrigin = new URL(paymentUrl).origin;
        if (checkoutOrigin && checkoutOrigin !== 'null' && checkoutOrigin !== event.origin) {
          return;
        }
      } catch (originError) {
        console.warn('Failed to validate payment payload origin', originError);
      }
    }

    const payload = extractPaymentPayload(event.data);
    if (!payload) {
      return;
    }

    applyDetectedPayload(payload);
  };

  const launchCheckout = () => {
    if (!paymentUrl) {
      return;
    }

    paymentPayloadNotice = null;
    paymentPayloadError = null;
    if (lastCheckoutWindow && !lastCheckoutWindow.closed) {
      lastCheckoutWindow.close();
    }
    const target = window.open(paymentUrl, '_blank', 'noopener,noreferrer');
    if (!target) {
      window.location.href = paymentUrl;
      return;
    }
    lastCheckoutWindow = target;
    target.focus();
  };

  onMount(() => {
    window.addEventListener('message', handlePaymentMessage);
  });

  onDestroy(() => {
    window.removeEventListener('message', handlePaymentMessage);
    if (lastCheckoutWindow && !lastCheckoutWindow.closed) {
      lastCheckoutWindow.close();
    }
  });
</script>

<section class="page" aria-labelledby="send-title">
  <header>
    <h2 id="send-title">Send a paid message</h2>
    <p>
      Fund your post with x402 using USDC on Solana. Once the payment clears, the bot drops the
      message into the selected Telegram group and shares a receipt with members.
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

  {#if paymentRequest && selectedGroup}
    <section class="status payment" aria-live="polite">
      <h3>Payment required</h3>
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
          to the payment address shown in checkout
        {/if}
        . Use x402 to broadcast the transfer, then resubmit this form to confirm delivery.
      </p>
      {#if paymentRequest.description}
        <p>{paymentRequest.description}</p>
      {/if}
      {#if paymentUrl}
        <button class="action" type="button" on:click={launchCheckout}>
          Open x402 checkout
        </button>
      {/if}
      <label class="payload-field">
        <span>Payment payload</span>
        <textarea
          rows={3}
          placeholder="Paste the payment payload returned after the transaction completes"
          bind:value={paymentPayloadInput}
          on:input={() => {
            paymentPayloadNotice = null;
            paymentPayloadError = null;
          }}
          disabled={loading}
        ></textarea>
        <small>
          Keep this tab open while completing checkout. We'll capture the payload automatically when
          possible, or you can paste it above.
        </small>
        {#if paymentPayloadNotice}
          <span class="payload-notice">{paymentPayloadNotice}</span>
        {/if}
        {#if paymentPayloadError}
          <span class="payload-error">{paymentPayloadError}</span>
        {/if}
      </label>
      {#if paymentRequest.instructions}
        <p class="footnote">{paymentRequest.instructions}</p>
      {/if}
      {#if paymentRequest.resource}
        <p class="footnote">Resource: {paymentRequest.resource}</p>
      {/if}
      {#if paymentFacilitator}
        <p class="footnote">Payments are verified via {paymentFacilitator}.</p>
      {/if}
      {#if paymentExpirationDisplay}
        <p class="footnote">Payment request expires {paymentExpirationDisplay}.</p>
      {/if}
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
      <li>Click “Generate payment link” to retrieve x402 payment instructions and open checkout.</li>
      <li>
        Approve the Solana transaction from your wallet using x402. Keep this page open so we can capture
        the payment payload or paste it manually.
      </li>
      <li>
        Press “Submit payment confirmation” once a payload is present to notify the bot and post the
        message.
      </li>
    </ol>
    <p>
      Need to adjust the price? Update it from the <a href="/groups">group directory</a> before
      sharing the link.
    </p>
  </aside>
</section>

<style>
  .page {
    max-width: 760px;
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

  .status.payment {
    border: 1px solid #bae6fd;
    background: #eff6ff;
    color: #0c4a6e;
  }

  .status.success {
    border: 1px solid #bbf7d0;
    background: #f0fdf4;
    color: #14532d;
  }

  .status code {
    font-family: 'Fira Code', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
    font-size: 0.9rem;
    background: rgba(15, 23, 42, 0.08);
    padding: 0.1rem 0.3rem;
    border-radius: 6px;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.55rem 1.2rem;
    border-radius: 10px;
    background: #111827;
    color: white;
    font-weight: 600;
    text-decoration: none;
    width: fit-content;
    border: none;
    cursor: pointer;
  }

  .action:focus-visible {
    outline: 3px solid rgba(59, 130, 246, 0.65);
    outline-offset: 2px;
  }

  .payload-field {
    display: grid;
    gap: 0.45rem;
    margin-top: 1rem;
  }

  .payload-field textarea {
    min-height: 3.75rem;
    font-family: 'Fira Code', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
  }

  .payload-field small {
    color: #0f172a;
    opacity: 0.8;
    font-size: 0.85rem;
  }

  .payload-notice {
    color: #15803d;
    font-size: 0.85rem;
    font-weight: 600;
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
