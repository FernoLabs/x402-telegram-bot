<section class="setup">
  <header>
    <h2>Setup checklist</h2>
    <p>Run through these steps when onboarding a new community into the single auction flow.</p>
  </header>

  <ol>
    <li>
      <h3>Confirm group access</h3>
      <p>
        Add the auction bot and a backup human steward to the Telegram group. Verify send
        permissions and pinning rights.
      </p>
    </li>
    <li>
      <h3>Align on reserve logic</h3>
      <p>
        Establish the base reserve (usually 15–22 SOL) and document how over-reserve bids are
        split between treasury and operators.
      </p>
    </li>
    <li>
      <h3>Provide marketing assets</h3>
      <p>
        Collect a banner image, 140-character description, and call-to-action link for the
        standard auction message template.
      </p>
    </li>
    <li>
      <h3>Schedule dry run</h3>
      <p>
        Send a test broadcast using the <a href="/send">message console</a> and confirm it
        appears correctly for moderators and members.
      </p>
    </li>
  </ol>
</section>

<style>
  .setup {
    max-width: 780px;
    margin: 0 auto;
    display: grid;
    gap: 1.5rem;
  }

  header p {
    margin: 0;
    color: #4b5563;
  }

  ol {
    margin: 0;
    padding-left: 1.5rem;
    display: grid;
    gap: 1rem;
  }

  li {
    background: white;
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    border: 1px solid #e5e7eb;
    box-shadow: 0 16px 36px -30px rgba(30, 41, 59, 0.4);
  }

  h3 {
    margin: 0 0 0.5rem;
    color: #111827;
  }

  p {
    margin: 0;
    color: #4b5563;
    line-height: 1.6;
  }

  a {
    color: #2563eb;
    font-weight: 600;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
