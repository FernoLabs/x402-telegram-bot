<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

  const formatAmount = (amount: number, currency: string) => {
    if (currency.toUpperCase() === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    }

    return `${amount.toFixed(2)} ${currency}`;
  };
</script>

<svelte:head>
  <title>Complete your x402 payment</title>
  <meta
    name="description"
    content={`Send ${formatAmount(data.payment.amount, data.payment.currency)} to ${data.payment.recipient} on ${data.payment.network} using x402.`}
  />
</svelte:head>

<article class="payment-page">
  <header class="intro">
    <h2>Complete your x402 payment</h2>
    <p>
      Send {formatAmount(data.payment.amount, data.payment.currency)} on {data.payment.network} to
      <code>{data.payment.recipient}</code>.
    </p>
    {#if data.payment.group}
      <p class="group-note">Payment requested for <strong>{data.payment.group}</strong>.</p>
    {/if}
  </header>

  <section class="details">
    <h3 id="payment-details">Payment details</h3>
    <dl aria-labelledby="payment-details">
      <div>
        <dt>Amount</dt>
        <dd>{formatAmount(data.payment.amount, data.payment.currency)}</dd>
      </div>
      <div>
        <dt>Currency</dt>
        <dd>{data.payment.currency}</dd>
      </div>
      <div>
        <dt>Network</dt>
        <dd>{data.payment.network}</dd>
      </div>
      <div>
        <dt>Recipient address</dt>
        <dd><code>{data.payment.recipient}</code></dd>
      </div>
      {#if data.payment.memo}
        <div>
          <dt>Memo / Reference</dt>
          <dd>{data.payment.memo}</dd>
        </div>
      {/if}
    </dl>
  </section>

  <section class="steps">
    <h3>How to pay</h3>
    <ol>
      <li>Open your Solana wallet that supports sending USDC.</li>
      <li>Send the amount above to the recipient address with the memo if required.</li>
      <li>Submit the transaction on Solana and wait for confirmation.</li>
    </ol>
    <p class="footnote">
      Once the payment confirms on-chain, x402 will automatically process the request and notify the
      bot.
    </p>
  </section>
</article>

<style>
  .payment-page {
    display: grid;
    gap: 2rem;
    max-width: 48rem;
  }

  .intro {
    background: white;
    border-radius: 1rem;
    padding: clamp(1.5rem, 3vw, 2.5rem);
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
    border: 1px solid rgba(15, 23, 42, 0.08);
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: clamp(1.5rem, 3vw, 2.25rem);
  }

  p {
    margin: 0;
    line-height: 1.6;
  }

  .group-note {
    margin-top: 0.75rem;
    font-weight: 600;
    color: #1d4ed8;
  }

  code {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    background: rgba(15, 23, 42, 0.08);
    padding: 0.15rem 0.35rem;
    border-radius: 0.4rem;
    font-size: 0.95rem;
    word-break: break-all;
  }

  .details {
    background: white;
    border-radius: 1rem;
    padding: clamp(1.5rem, 3vw, 2rem);
    border: 1px solid rgba(148, 163, 184, 0.35);
  }

  h3 {
    margin-top: 0;
    font-size: clamp(1.25rem, 2.2vw, 1.5rem);
  }

  dl {
    display: grid;
    gap: 1rem;
    margin: 1.25rem 0 0;
  }

  dl div {
    display: grid;
    gap: 0.25rem;
  }

  dt {
    font-weight: 600;
    color: #475569;
  }

  dd {
    margin: 0;
    font-size: 1.05rem;
    word-break: break-word;
  }

  .steps {
    background: white;
    border-radius: 1rem;
    padding: clamp(1.5rem, 3vw, 2rem);
    border: 1px solid rgba(148, 163, 184, 0.35);
  }

  ol {
    padding-left: 1.25rem;
    margin: 1rem 0;
    display: grid;
    gap: 0.75rem;
    line-height: 1.6;
  }

  .footnote {
    color: #475569;
    margin-top: 1.5rem;
    font-size: 0.95rem;
  }

  @media (max-width: 40rem) {
    .payment-page {
      gap: 1.5rem;
    }

    .intro,
    .details,
    .steps {
      border-radius: 0.85rem;
    }
  }
</style>
