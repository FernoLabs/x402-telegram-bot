<section class="page" aria-labelledby="setup-title">
  <header>
    <h2 id="setup-title">Setup checklist</h2>
    <p>
      Use this guide to connect your Telegram group to x402 payments. Once complete, anyone with the
      link can pay in USDC on Solana and the bot will post to your members.
    </p>
  </header>

  <ol class="checklist" aria-label="Group setup steps">
    <li>
      <h3>Invite the bot</h3>
      <p>
        Search for <strong>@x402_bot</strong> in Telegram, add it as an admin, and enable the
        ability to post, pin, and delete messages. Keep other permissions off until you are ready to
        go live.
      </p>
    </li>
    <li>
      <h3>Link your payout wallet</h3>
      <p>
        Provide the Solana address that should receive USDC. Payouts settle automatically once a
        message is confirmed, so pick a wallet you check often.
      </p>
    </li>
    <li>
      <h3>Choose a price per message</h3>
      <p>
        Decide on a flat rate in USDC. Most communities start between $0.50 and $5.00. You can edit
        this number anytime from the group directory.
      </p>
    </li>
    <li>
      <h3>Share your guidelines</h3>
      <p>
        Write a short note about what senders can promote. The message console shows these rules so
        everyone stays on the same page.
      </p>
    </li>
    <li>
      <h3>Send a test message</h3>
      <p>
        Use the <a href="/send">Send a Message</a> page to fund a small test. Confirm the copy, the
        payment receipt, and that the post reaches your group.
      </p>
    </li>
  </ol>

  <section class="help" aria-labelledby="help-title">
    <h3 id="help-title">Need a hand?</h3>
    <ul>
      <li>
        <a href="https://www.x402.org/" target="_blank" rel="noreferrer">x402 documentation</a>
      </li>
      <li>
        <a href="https://core.telegram.org/bots" target="_blank" rel="noreferrer"
          >Telegram bot admin overview</a
        >
      </li>
      <li><a href="mailto:hello@x402.org">Contact support</a></li>
    </ul>
  </section>
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

  .checklist {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 1rem;
  }

  .checklist li {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.25rem, 3vw, 1.85rem);
    display: grid;
    gap: 0.4rem;
  }

  h3 {
    margin: 0;
    color: #111827;
    font-size: 1.2rem;
  }

  strong {
    color: #111827;
  }

  a {
    color: #0f172a;
  }

  .help {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2rem);
  }

  .help ul {
    margin: 0;
    padding-left: 1.1rem;
    color: #475569;
    line-height: 1.6;
  }
</style>
