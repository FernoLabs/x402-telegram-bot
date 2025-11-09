<script lang="ts">
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
