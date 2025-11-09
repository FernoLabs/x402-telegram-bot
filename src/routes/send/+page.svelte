<script lang="ts">
  import { goto } from '$app/navigation';
  import type { Group } from '$lib/types';
  import { wallet } from '$lib/wallet/wallet.svelte';

  export let data: {
    groups: Group[];
    loadError: boolean;
    preselectedGroupId: number | null;
  };

  $: activeGroups = data.groups.filter((group) => group.active);

  function resolveDefaultGroupId(): string {
    if (
      data.preselectedGroupId &&
      activeGroups.some((group) => group.id === data.preselectedGroupId)
    ) {
      return String(data.preselectedGroupId);
    }

    if (activeGroups.length > 0) {
      return String(activeGroups[0].id);
    }

    return '';
  }

  $: defaultGroupId = resolveDefaultGroupId();

  let selectedGroupId = '';
  $: {
    const hasSelection = activeGroups.some((group) => String(group.id) === selectedGroupId);
    if (!hasSelection) {
      selectedGroupId = defaultGroupId;
    }
  }
  let senderName = '';
  let message = '';
  let submitting = false;
  let error: string | null = null;
  let successPaymentId: string | null = null;

  $: walletState = $wallet;
  $: connected = walletState.connected;
  $: walletAddress = walletState.publicKey;

  const canSubmit = () => Boolean(selectedGroupId && message.trim());

  interface CreateMessageResponse {
    payment?: { paymentId?: string };
    message?: { id: number };
    error?: string;
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    successPaymentId = null;

    if (!canSubmit()) {
      error = 'Select a group and write a message first.';
      return;
    }

    if (!connected || !walletAddress) {
      error = 'Connect your Solana wallet before sending a message.';
      return;
    }

    submitting = true;

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          groupId: Number(selectedGroupId),
          message: message.trim(),
          senderName: senderName.trim() || undefined,
          walletAddress
        })
      });

      const payload = (await response.json()) as CreateMessageResponse;

      if (!response.ok) {
        const fallback = typeof payload?.error === 'string' ? payload.error : 'Failed to create payment request.';
        error = fallback;
        return;
      }

      successPaymentId = payload?.payment?.paymentId ?? null;
      message = '';
      senderName = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to submit the message request.';
    } finally {
      submitting = false;
    }
  }

  function viewPayments() {
    if (!successPaymentId) {
      goto('/payments');
      return;
    }

    const url = new URL('/payments', window.location.origin);
    url.searchParams.set('paymentId', successPaymentId);
    goto(url.pathname + url.search);
  }
</script>

<svelte:head>
  <title>Create a paid message</title>
</svelte:head>

<article class="send-message">
  <header>
    <h2>Send a paid message</h2>
    <p>Fill out your announcement, then complete the payment from the payments page.</p>
    {#if !connected}
      <p class="wallet-hint">Connect a wallet with the button in the top right before submitting.</p>
    {/if}
  </header>

  {#if data.loadError}
    <p class="error">We couldn&apos;t load available groups right now. Try again in a few minutes.</p>
  {:else if activeGroups.length === 0}
    <p class="error">No active Telegram groups are accepting paid messages at the moment.</p>
  {:else}
    <form on:submit={handleSubmit} class="message-form">
      <label>
        <span>Target group</span>
        <select bind:value={selectedGroupId} required>
          {#each activeGroups as group}
            <option value={group.id}>{group.name} — minimum ${group.minBid.toFixed(2)} USDC</option>
          {/each}
        </select>
      </label>

      <label>
        <span>Agent or sender name (optional)</span>
        <input
          type="text"
          bind:value={senderName}
          placeholder="Name shown above your message"
          maxlength={64}
        />
      </label>

      <label>
        <span>Your message</span>
        <textarea
          bind:value={message}
          rows={6}
          maxlength={800}
          placeholder="Share your announcement for the Telegram group"
          required
        ></textarea>
      </label>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      {#if successPaymentId}
        <div class="success" role="status">
          <p>
            Message saved! Complete the payment from the
            <button type="button" class="link" on:click={viewPayments}>payments page</button>.
          </p>
        </div>
      {/if}

      <button type="submit" class="primary" disabled={!canSubmit() || submitting}>
        {#if submitting}
          Creating payment request…
        {:else}
          Create payment request
        {/if}
      </button>
    </form>
  {/if}
</article>

<style>
  .send-message {
    display: grid;
    gap: 1.75rem;
    max-width: 48rem;
  }

  header > h2 {
    margin: 0;
    font-size: clamp(1.6rem, 3vw, 2.4rem);
  }

  header > p {
    margin: 0.25rem 0 0;
    color: #4b5563;
  }

  .wallet-hint {
    color: #d97706;
    font-weight: 600;
  }

  .message-form {
    display: grid;
    gap: 1.25rem;
    background: white;
    padding: clamp(1.5rem, 3vw, 2.5rem);
    border-radius: 1rem;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
    border: 1px solid rgba(15, 23, 42, 0.08);
  }

  label {
    display: grid;
    gap: 0.5rem;
  }

  label span {
    font-weight: 600;
    color: #111827;
  }

  select,
  input,
  textarea {
    font: inherit;
    padding: 0.75rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 0.75rem;
    background: #f9fafb;
    color: #111827;
  }

  textarea {
    resize: vertical;
    min-height: 8rem;
  }

  .error {
    background: rgba(239, 68, 68, 0.1);
    color: #b91c1c;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    margin: 0;
  }

  .success {
    background: rgba(16, 185, 129, 0.12);
    color: #047857;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
  }

  .link {
    background: none;
    border: none;
    color: #2563eb;
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    padding: 0;
  }

  .primary {
    background: #111827;
    color: white;
    border: none;
    border-radius: 0.75rem;
    padding: 0.85rem 1.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .primary[disabled] {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .primary:not([disabled]):hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 24px rgba(17, 24, 39, 0.18);
  }
</style>
