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

  const formatExpiration = (value: string | null) => {
    if (!value) {
      return null;
    }

    const timestamp = Date.parse(value);
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

  const buildFallbackCheckoutUrl = () => {
    const url = new URL('https://facilitator.payai.network/pay');
    url.searchParams.set('amount', data.payment.amount.toString());
    url.searchParams.set('recipient', data.payment.recipient);
    url.searchParams.set('currency', data.payment.currency);
    url.searchParams.set('network', data.payment.network);

    if (data.payment.group) {
      url.searchParams.set('group', data.payment.group);
    }

    if (data.payment.memo) {
      url.searchParams.set('memo', data.payment.memo);
    }

    if (data.payment.facilitator) {
      url.searchParams.set('facilitator', data.payment.facilitator);
    }

    if (data.payment.paymentId) {
      url.searchParams.set('paymentId', data.payment.paymentId);
    }

    if (data.payment.nonce) {
      url.searchParams.set('nonce', data.payment.nonce);
    }

    return url.toString();
  };

  $: checkoutUrl = data.payment.checkout ?? buildFallbackCheckoutUrl();
  $: facilitatorUrl = data.payment.facilitator ?? null;
  $: expiresAtDisplay = formatExpiration(data.payment.expiresAt ?? null);
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
    <div class="checkout">
      <a class="checkout-button" href={checkoutUrl} rel="noreferrer" target="_blank"
        >Open x402 checkout</a
      >
      <p class="checkout-hint">
        This opens the hosted x402 facilitator so you can approve the USDC transfer from your Solana wallet.
      </p>
    </div>
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
      {#if data.payment.paymentId}
        <div>
          <dt>Payment ID</dt>
          <dd><code>{data.payment.paymentId}</code></dd>
        </div>
      {/if}
      {#if data.payment.nonce}
        <div>
          <dt>Nonce</dt>
          <dd><code>{data.payment.nonce}</code></dd>
        </div>
      {/if}
      {#if facilitatorUrl}
        <div>
          <dt>Facilitator</dt>
          <dd><a href={facilitatorUrl} target="_blank" rel="noreferrer">{facilitatorUrl}</a></dd>
        </div>
      {/if}
      {#if expiresAtDisplay}
        <div>
          <dt>Payment window expires</dt>
          <dd>{expiresAtDisplay}</dd>
        </div>
      {/if}
    </dl>
  </section>

  <section class="steps">
    <h3>How to pay</h3>
    <ol>
      <li>
        Click <strong>Open x402 checkout</strong> to launch the hosted facilitator. It will load the payment
        payload for this request.
      </li>
      <li>
        Approve the USDC transfer from your Solana wallet (e.g. Phantom). The facilitator will broadcast the
        transaction and share the encoded payment payload with this app, following the x402 flow described in
        the QuickNode guide.
      </li>
      <li>
        Once the transaction confirms, return to the previous tab and submit the payment payload so the bot
        can post your message.
      </li>
    </ol>
    <p class="footnote">
      Once the payment confirms on-chain, the facilitator reports success via x402 and this bot can publish
      your announcement automatically.
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

  .checkout {
    margin-top: 1.5rem;
    display: grid;
    gap: 0.5rem;
    align-items: start;
  }

  .checkout-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: #1d4ed8;
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 999px;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.2s ease;
  }

  .checkout-button:hover,
  .checkout-button:focus-visible {
    background: #1e40af;
  }

  .checkout-hint {
    color: #475569;
    margin: 0;
    font-size: 0.95rem;
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

    .checkout-button {
      width: 100%;
    }
  }
</style>
