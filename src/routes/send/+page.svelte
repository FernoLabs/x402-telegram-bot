<script lang="ts">
  import type { Auction, Group } from '$lib/types';

  interface PaymentRequestData {
    amount: number;
    currency?: string;
    recipient: string;
    network?: string;
    instructions?: string;
    facilitator?: string;
    checkoutUrl?: string;
    accepts?: Array<{
      scheme?: string;
      networkId?: string;
      currencyCode?: string;
      amount?: number;
      recipient?: string;
      facilitator?: string;
      url?: string;
    }>;
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

  const formatUsd = (value: number) => currencyFormatter.format(value);

  const resetStatus = () => {
    error = null;
    paymentRequest = null;
    successAuction = null;
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

  function buildPaymentUrl(request: PaymentRequestData, group: Group | null, note: string): string {
    const url = new URL('https://payai.network/pay');
    url.searchParams.set('amount', request.amount.toString());
    url.searchParams.set('recipient', request.recipient);

    if (request.currency) {
      url.searchParams.set('currency', request.currency);
    }

    if (request.network) {
      url.searchParams.set('network', request.network);
    }

    if (group) {
      url.searchParams.set('group', group.name);
    }

    if (note) {
      url.searchParams.set('memo', note);
    }

    if (request.facilitator) {
      url.searchParams.set('facilitator', request.facilitator);
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
      const response = await fetch('/api/auctions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      } else if (response.status === 402) {
        if (
          payload &&
          typeof payload === 'object' &&
          'amount' in payload &&
          'recipient' in payload
        ) {
          paymentRequest = payload as PaymentRequestData;
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
  $: paymentUrl = paymentRequest
    ? paymentRequest.checkoutUrl ?? buildPaymentUrl(paymentRequest, selectedGroup, message.trim())
    : null;
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
        Generating payment request…
      {:else}
        Generate payment link
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
        Send {formatUsd(paymentRequest.amount)} {paymentRequest.currency ?? 'USDC'} on
        {paymentRequest.network ?? 'Solana'} to <code>{paymentRequest.recipient}</code>. Use x402 to
        broadcast the transfer, then resubmit this form to confirm delivery.
      </p>
      {#if paymentUrl}
        <a class="action" href={paymentUrl} target="_blank" rel="noreferrer">
          Open x402 checkout
        </a>
      {/if}
      {#if paymentRequest.instructions}
        <p class="footnote">{paymentRequest.instructions}</p>
      {/if}
      {#if paymentRequest.facilitator}
        <p class="footnote">Payments are verified via {paymentRequest.facilitator}.</p>
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
      <li>Click “Generate payment link” to retrieve x402 payment instructions.</li>
      <li>Approve the Solana transaction from your wallet using x402.</li>
      <li>The bot posts the message and pins a receipt once payment confirms.</li>
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
