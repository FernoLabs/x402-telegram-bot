<script lang="ts">
  const steps = [
    {
      title: 'Confirm group access',
      detail:
        'Add the auction bot plus a backup human steward. Verify send permissions, pinning rights, and reply threads.'
    },
    {
      title: 'Align on reserve logic',
      detail:
        'Set the base reserve (typically $0.50–$5.00 or 15–22 SOL) and log how over-reserve bids split between treasury and ops.'
    },
    {
      title: 'Provide marketing assets',
      detail:
        'Capture artwork, 140-character positioning, and the CTA URL that every auction placement will feature.'
    },
    {
      title: 'Schedule dry run',
      detail:
        'Trigger a test broadcast via the message console and confirm formatting for moderators and pinned posts.'
    }
  ];

  const resources = [
    { label: 'x402 payment middleware', href: 'https://github.com/coinbase-samples/x402' },
    { label: 'Telegram bot permissions guide', href: 'https://core.telegram.org/bots/features#administration' },
    { label: 'Auction message template', href: '/send' }
  ];
</script>

<section class="setup" aria-labelledby="setup-title">
  <header class="hero">
    <div>
      <h2 id="setup-title">Onboarding checklist for new Telegram communities</h2>
      <p>
        Follow the playbook to bring a new group online without surprises. Each step is built for a
        single auction format so stewards can launch in under 30 minutes.
      </p>
    </div>
    <dl class="metrics" aria-label="Setup outcomes">
      <div>
        <dt>~25 min completion</dt>
        <dd>When the steward and admin work in tandem.</dd>
      </div>
      <div>
        <dt>2 approvals</dt>
        <dd>One for creative, one for payment routing.</dd>
      </div>
      <div>
        <dt>100% audit trail</dt>
        <dd>Docs live alongside the auction console.</dd>
      </div>
    </dl>
  </header>

  <ol class="timeline" aria-label="Setup steps">
    {#each steps as step, index}
      <li>
        <span class="badge" aria-hidden="true">{index + 1}</span>
        <div>
          <h3>{step.title}</h3>
          <p>{step.detail}</p>
        </div>
      </li>
    {/each}
  </ol>

  <section class="resources" aria-label="Reference material">
    <h3>Helpful resources</h3>
    <p>Keep these links handy while you work through approvals and dry runs.</p>
    <ul>
      {#each resources as resource}
        <li>
          <a
            href={resource.href}
            target={resource.href.startsWith('http') ? '_blank' : undefined}
            rel={resource.href.startsWith('http') ? 'noreferrer' : undefined}
            >{resource.label}</a
          >
        </li>
      {/each}
    </ul>
  </section>
</section>

<style>
  .setup {
    display: grid;
    gap: clamp(1.75rem, 3vw, 2.5rem);
    max-width: 960px;
    margin: 0 auto;
  }

  .hero {
    background: white;
    border-radius: 24px;
    padding: clamp(1.75rem, 3vw, 2.75rem);
    border: 1px solid #e0e7ff;
    box-shadow: 0 28px 64px -50px rgba(30, 41, 59, 0.55);
    display: grid;
    gap: clamp(1.5rem, 3vw, 2.25rem);
  }

  @media (min-width: 880px) {
    .hero {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      align-items: start;
    }
  }

  .hero h2 {
    margin: 0;
    font-size: clamp(2rem, 2vw + 1.6rem, 2.7rem);
    color: #0f172a;
  }

  .hero p {
    margin: 0;
    color: #475569;
    line-height: 1.7;
  }

  .metrics {
    display: grid;
    gap: 1rem;
  }

  .metrics div {
    background: #f8fafc;
    border-radius: 16px;
    padding: 1.1rem 1.35rem;
    border: 1px solid #e2e8f0;
    display: grid;
    gap: 0.35rem;
  }

  .metrics dt {
    margin: 0;
    font-weight: 700;
    color: #0f172a;
  }

  .metrics dd {
    margin: 0;
    color: #475569;
  }

  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1.25rem;
  }

  .timeline li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    align-items: start;
    background: white;
    border-radius: 20px;
    padding: clamp(1.4rem, 3vw, 2rem);
    border: 1px solid #e0e7ff;
    box-shadow: 0 24px 56px -48px rgba(30, 41, 59, 0.5);
  }

  .badge {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    background: rgba(37, 99, 235, 0.12);
    color: #1d4ed8;
    font-weight: 700;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.25rem;
    color: #0f172a;
  }

  p {
    margin: 0;
    color: #475569;
    line-height: 1.65;
  }

  .resources {
    background: linear-gradient(135deg, #111827, #1f2937 55%, #1e293b 100%);
    color: white;
    border-radius: 22px;
    padding: clamp(1.75rem, 3vw, 2.5rem);
    display: grid;
    gap: 1.25rem;
    box-shadow: 0 28px 64px -50px rgba(15, 23, 42, 0.85);
  }

  .resources h3 {
    margin: 0;
    font-size: 1.45rem;
  }

  .resources ul {
    margin: 0;
    padding-left: 1.25rem;
    display: grid;
    gap: 0.75rem;
    color: rgba(226, 232, 240, 0.9);
  }

  a {
    color: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-decoration-thickness: 0.1em;
    text-underline-offset: 0.2em;
  }

  a:hover,
  a:focus-visible {
    opacity: 0.85;
  }
</style>
