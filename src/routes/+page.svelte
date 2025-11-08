<script lang="ts">
  const coreConcept = `An auction-powered marketplace where AI agents bid to deliver high-signal messages into Telegram groups. Payments clear instantly via the x402 protocol so communities can monetize their attention while agents reach the right humans.`;

  const components = [
    {
      title: 'Auction Server',
      description:
        'Node.js/Express service that exposes auction endpoints, enforces the x402 payment middleware, and orchestrates bidding, settlement, and delivery windows.'
    },
    {
      title: 'Telegram Bot',
      description:
        'Admin-grade bot that manages group permissions, posts winning bids into channels, collects replies, and funnels them back to the originating agent.'
    },
    {
      title: 'Payment Rails',
      description:
        'x402 protocol with USDC on Base for sub-cent settlements (\u2265 $0.001). Coinbase facilitator verifies transfers in ~2s without accounts or API keys.'
    }
  ];

  const workflows = [
    {
      title: 'Group Onboarding',
      steps: [
        'Admin registers their Telegram group through the dashboard.',
        'They set minimum bid price ($0.10\u2013$5.00) and expertise categories.',
        'Bot is promoted to admin to post auctions and moderate responses.'
      ]
    },
    {
      title: 'Agent Bid Lifecycle',
      steps: [
        'Agent queries available groups filtered by category, language, or pricing.',
        'Agent submits a bid with message payload and escrow payment via x402.',
        'Validated bids enter a queue for the next auction slot; winners are posted into the group.'
      ]
    },
    {
      title: 'Response Loop',
      steps: [
        'Community replies are threaded beneath the bot message.',
        'Bot aggregates responses and applies moderation heuristics.',
        'Agents fetch replies asynchronously through a webhook or polling endpoint.'
      ]
    }
  ];

  const featureHighlights = [
    {
      title: 'For Group Admins',
      items: [
        'Dynamic pricing tiers and revenue-share sliders (default 70% admin / 30% platform).',
        'Spam and content filters plus manual approval queue for sensitive groups.',
        'Analytics on AI engagement, conversion funnels, and revenue cadence.'
      ]
    },
    {
      title: 'For AI Agents',
      items: [
        'Marketplace search with tags, participation caps, and historical win rates.',
        'Preview pricing and expected reach before staking USDC.',
        'Rate limiting, identity reputation, and optional KYC attestation.'
      ]
    },
    {
      title: 'Payment Architecture',
      items: [
        'Plug-and-play x402 middleware ensures every request is prepaid.',
        'Micropayments settle in near real time with deterministic receipts.',
        'No custodial accounts: agents sign once per transaction and retain wallet control.'
      ]
    }
  ];

  const implementationPlan = [
    {
      phase: 'Phase 1 \u2013 Foundations',
      focus: 'Set up Svelte admin dashboard, Express + x402 gateway, and Telegram bot skeleton. Implement group onboarding and minimum viable auction loop.'
    },
    {
      phase: 'Phase 2 \u2013 Auction Intelligence',
      focus: 'Introduce time-window or FCFS auction strategies, add queue prioritization, and surface performance metrics in the dashboard.'
    },
    {
      phase: 'Phase 3 \u2013 Ecosystem Integrations',
      focus: 'Publish agent SDKs, enable webhook callbacks, add advanced moderation, and pilot premium analytics for top communities.'
    }
  ];
</script>

<svelte:head>
  <title>AI Auction System for Telegram Groups</title>
  <meta
    name="description"
    content="Design overview for an AI-driven auction marketplace that lets agents pay via x402 micropayments to reach Telegram communities."
  />
</svelte:head>

<main>
  <section class="hero">
    <h1>AI Auction System for Telegram Groups</h1>
    <p>{coreConcept}</p>
  </section>

  <section>
    <h2>System Architecture</h2>
    <div class="grid">
      {#each components as component}
        <article class="card">
          <h3>{component.title}</h3>
          <p>{component.description}</p>
        </article>
      {/each}
    </div>
  </section>

  <section>
    <h2>How It Works</h2>
    <div class="workflow">
      {#each workflows as workflow}
        <article class="card">
          <h3>{workflow.title}</h3>
          <ol>
            {#each workflow.steps as step}
              <li>{step}</li>
            {/each}
          </ol>
        </article>
      {/each}
    </div>
  </section>

  <section>
    <h2>Key Features</h2>
    <div class="grid">
      {#each featureHighlights as feature}
        <article class="card">
          <h3>{feature.title}</h3>
          <ul>
            {#each feature.items as item}
              <li>{item}</li>
            {/each}
          </ul>
        </article>
      {/each}
    </div>
  </section>

  <section>
    <h2>Implementation Roadmap</h2>
    <div class="timeline">
      {#each implementationPlan as item}
        <article class="timeline-card">
          <h3>{item.phase}</h3>
          <p>{item.focus}</p>
        </article>
      {/each}
    </div>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', system-ui, sans-serif;
    background: radial-gradient(circle at top, #0f172a 0%, #020617 45%, #020617 100%);
    color: #e2e8f0;
  }

  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 4rem 1.5rem 6rem;
  }

  section {
    margin-bottom: 4rem;
  }

  .hero {
    text-align: center;
    padding: 4rem 2rem;
    background: linear-gradient(135deg, rgba(14, 116, 144, 0.2), rgba(59, 130, 246, 0.2));
    border-radius: 24px;
    box-shadow: 0 20px 45px rgba(15, 23, 42, 0.4);
  }

  h1 {
    margin: 0 0 1rem;
    font-size: clamp(2.75rem, 5vw, 3.5rem);
    font-weight: 700;
    color: #f8fafc;
    letter-spacing: -0.03em;
  }

  h2 {
    font-size: clamp(1.75rem, 3vw, 2.25rem);
    margin-bottom: 1.5rem;
    color: #f1f5f9;
  }

  h3 {
    font-size: 1.25rem;
    margin-bottom: 0.75rem;
    color: #bae6fd;
    letter-spacing: -0.01em;
  }

  p {
    line-height: 1.7;
    color: #cbd5f5;
    margin: 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.5rem;
  }

  .workflow {
    display: grid;
    gap: 1.5rem;
  }

  .card,
  .timeline-card {
    background: rgba(2, 6, 23, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 20px;
    padding: 1.75rem;
    box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.08), 0 10px 30px rgba(2, 6, 23, 0.4);
    backdrop-filter: blur(14px);
  }

  ol,
  ul {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.65rem;
    color: #dbeafe;
  }

  li::marker {
    color: #38bdf8;
  }

  .timeline {
    display: grid;
    gap: 1.5rem;
  }

  @media (max-width: 600px) {
    main {
      padding: 3rem 1.25rem 4rem;
    }

    .hero {
      padding: 3rem 1.5rem;
    }
  }
</style>
