<section class="page" aria-labelledby="page-title">
  <header class="hero">
    <div>
      <h2 id="page-title">Set paid Telegram posts in minutes</h2>
      <p>
        Invite the x402 bot to your group, choose a price per message, and accept USDC on the
        Solana network. The console keeps setup, pricing, and delivery in one simple flow.
      </p>
      <div class="hero-actions" role="group" aria-label="Primary actions">
        <a class="action primary" href="/setup">Follow the setup guide</a>
        <a class="action" href="/send">Send a paid message</a>
      </div>
    </div>
    <aside>
      <h3>What you need</h3>
      <ul>
        <li>A Telegram group where you are an admin</li>
        <li>USDC wallet on Solana for payouts</li>
        <li>Group rules for what paid messages can promote</li>
      </ul>
    </aside>
  </header>

  <section class="steps" aria-labelledby="steps-title">
    <h3 id="steps-title">Three steps to start</h3>
    <ol>
      <li>
        <h4>1. Invite the bot</h4>
        <p>Add the x402 Telegram bot and grant it permission to post and pin messages.</p>
      </li>
      <li>
        <h4>2. Pick a price</h4>
        <p>
          Choose the USDC amount per message. You can update the rate anytime from the group
          directory.
        </p>
      </li>
      <li>
        <h4>3. Share the link</h4>
        <p>Send the payment link to partners or agents. They fund with x402 and the bot posts.</p>
      </li>
    </ol>
  </section>

  <section class="details" aria-labelledby="details-title">
    <div>
      <h3 id="details-title">Built on x402 micropayments</h3>
      <p>
        x402 handles the USDC transfer on Solana and confirms the payment before anything reaches
        your members. Every message is logged so you can audit payouts later.
      </p>
    </div>
    <div class="grid">
      <article>
        <h4>Simple pricing</h4>
        <p>Set one price per post and pause the bot whenever the group is closed.</p>
      </article>
      <article>
        <h4>Fast confirmation</h4>
        <p>USDC payments settle in seconds and the bot posts right after success.</p>
      </article>
      <article>
        <h4>Group friendly</h4>
        <p>Stay in control with pinned receipts and optional manual approval.</p>
      </article>
    </div>
  </section>
</section>

<style>
  .page {
    display: grid;
    gap: clamp(1.5rem, 3vw, 2.75rem);
    max-width: 960px;
    margin: 0 auto;
  }

  .hero {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.5rem);
    display: grid;
    gap: clamp(1.5rem, 3vw, 2rem);
  }

  @media (min-width: 880px) {
    .hero {
      grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr);
      align-items: start;
    }
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: clamp(2rem, 2vw + 1.5rem, 2.6rem);
    color: #111827;
  }

  h3 {
    margin: 0 0 0.5rem;
    color: #111827;
  }

  h4 {
    margin: 0 0 0.25rem;
    color: #111827;
    font-size: 1.05rem;
  }

  p {
    margin: 0;
    line-height: 1.6;
    color: #475569;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1.25rem;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.55rem 1.25rem;
    border-radius: 10px;
    text-decoration: none;
    font-weight: 600;
    color: #0f172a;
    background: #f1f5f9;
  }

  .action.primary {
    background: #111827;
    color: white;
  }

  .hero aside {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1.25rem;
  }

  .hero aside ul {
    margin: 0;
    padding-left: 1.1rem;
    color: #475569;
    line-height: 1.6;
  }

  .steps {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
  }

  .steps h3 {
    margin-bottom: 1rem;
  }

  .steps ol {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.9rem;
  }

  .details {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
    display: grid;
    gap: clamp(1.25rem, 3vw, 1.75rem);
  }

  .details .grid {
    display: grid;
    gap: 1rem;
  }

  @media (min-width: 720px) {
    .details .grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .details article {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1rem;
  }
</style>
