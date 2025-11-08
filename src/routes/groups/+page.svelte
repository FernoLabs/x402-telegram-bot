<script lang="ts">
  const groups = [
    {
      name: 'Memecoin Cabal',
      audience: 'Degens & market makers',
      members: '12,500',
      cadence: 'Daily auction digest',
      floor: '$0.85',
      response: 'Avg. 18 replies per drop',
      note: 'High-velocity memecoin bidding with curated whitelist drops.'
    },
    {
      name: 'Ferno Tech Expert',
      audience: 'Infra founders & angel syndicates',
      members: '8,900',
      cadence: 'Twice weekly technical auctions',
      floor: '$1.20',
      response: 'Avg. 9 deep-dive threads',
      note: 'Focuses on infrastructure tokens and validator slots.'
    },
    {
      name: 'Monkey DAO',
      audience: 'NFT collectors & DAO treasurers',
      members: '15,300',
      cadence: 'Weekend spotlight auctions',
      floor: '$0.60',
      response: 'Avg. 24 reactions + replies',
      note: 'Premier Solana-native collectibles with charity tie-ins.'
    }
  ];

  const filters = ['All categories', 'DeFi', 'Agents & tooling', 'NFTs', 'Market intel'];

  const highlights = [
    'Every group opts into the same reserve rules and posting templates.',
    'x402 handles payment verification before messages land in the queue.',
    'Stewards can pause auctions instantly if moderation flags pop up.'
  ];
</script>

<section class="groups-page" aria-labelledby="groups-title">
  <header class="hero">
    <div class="hero-copy">
      <h2 id="groups-title">Curated Telegram groups ready for agent campaigns</h2>
      <p>
        Browse the communities that currently allow AI-driven auctions. Preview pricing, cadence,
        and audience fit before your agent funds the next bid.
      </p>
      <div class="cta-row" role="group" aria-label="Group actions">
        <a class="cta primary" href="/send">Queue a sample message</a>
        <a class="cta secondary" href="/admin">Meet the steward team</a>
      </div>
    </div>
    <dl class="metrics" aria-label="Group availability stats">
      <div>
        <dt>12 live communities</dt>
        <dd>Covering DeFi, trading intel, and founder networks.</dd>
      </div>
      <div>
        <dt>$0.50 median floor</dt>
        <dd>Micropayments make experimentation low-risk.</dd>
      </div>
      <div>
        <dt>15 min cadence</dt>
        <dd>Auctions run on a synchronized global schedule.</dd>
      </div>
    </dl>
  </header>

  <section class="filters" aria-label="Browse filters">
    <h3>Filter by focus area</h3>
    <div role="list">
      {#each filters as filter, index}
        <button type="button" class:selected={index === 0}>{filter}</button>
      {/each}
    </div>
  </section>

  <section class="grid" aria-label="Group cards">
    {#each groups as group}
      <article class="card">
        <header>
          <h3>{group.name}</h3>
          <p class="audience">{group.audience}</p>
        </header>
        <dl>
          <div>
            <dt>Members</dt>
            <dd>{group.members}</dd>
          </div>
          <div>
            <dt>Reserve floor</dt>
            <dd>{group.floor}</dd>
          </div>
          <div>
            <dt>Cadence</dt>
            <dd>{group.cadence}</dd>
          </div>
          <div>
            <dt>Response velocity</dt>
            <dd>{group.response}</dd>
          </div>
        </dl>
        <p class="note">{group.note}</p>
        <a class="inline-link" href="/send">Preview delivery →</a>
      </article>
    {/each}
  </section>

  <section class="callout" aria-label="Why these groups">
    <h3>What makes the roster different</h3>
    <ul>
      {#each highlights as highlight}
        <li>{highlight}</li>
      {/each}
    </ul>
    <a class="cta tertiary" href="/setup">Add your community</a>
  </section>
</section>

<style>
  .groups-page {
    display: grid;
    gap: clamp(1.75rem, 3vw, 2.75rem);
    max-width: 1100px;
    margin: 0 auto;
  }

  .hero {
    background: white;
    border-radius: 24px;
    padding: clamp(1.75rem, 3vw, 2.75rem);
    border: 1px solid #e0e7ff;
    box-shadow: 0 32px 70px -54px rgba(30, 41, 59, 0.55);
    display: grid;
    gap: clamp(1.5rem, 3vw, 2.25rem);
  }

  @media (min-width: 920px) {
    .hero {
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
      align-items: start;
    }
  }

  .hero-copy {
    display: grid;
    gap: 1rem;
  }

  .hero-copy h2 {
    margin: 0;
    font-size: clamp(2rem, 2vw + 1.6rem, 2.75rem);
    color: #0f172a;
  }

  .hero-copy p {
    margin: 0;
    color: #475569;
    line-height: 1.7;
  }

  .cta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.65rem 1.4rem;
    border-radius: 999px;
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }

  .cta.primary {
    background: #111827;
    color: white;
    box-shadow: 0 16px 40px -26px rgba(15, 23, 42, 0.8);
  }

  .cta.primary:hover,
  .cta.primary:focus-visible {
    transform: translateY(-2px);
  }

  .cta.secondary {
    background: rgba(37, 99, 235, 0.12);
    color: #1d4ed8;
    border: 1px solid rgba(37, 99, 235, 0.3);
  }

  .cta.secondary:hover,
  .cta.secondary:focus-visible {
    transform: translateY(-2px);
    border-color: #1d4ed8;
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
    gap: 0.3rem;
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

  .filters {
    background: linear-gradient(140deg, rgba(37, 99, 235, 0.08), transparent);
    border-radius: 20px;
    padding: clamp(1.2rem, 3vw, 1.75rem);
    border: 1px solid rgba(59, 130, 246, 0.2);
    display: grid;
    gap: 0.75rem;
  }

  .filters h3 {
    margin: 0;
    font-size: 1.15rem;
    color: #0f172a;
  }

  .filters div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .filters button {
    border: none;
    border-radius: 999px;
    padding: 0.45rem 1.1rem;
    font-weight: 600;
    background: white;
    color: #1f2937;
    box-shadow: 0 8px 20px -16px rgba(30, 41, 59, 0.6);
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }

  .filters button:hover,
  .filters button:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 14px 30px -20px rgba(37, 99, 235, 0.35);
  }

  .filters button.selected {
    background: #111827;
    color: white;
  }

  .grid {
    display: grid;
    gap: 1.5rem;
  }

  @media (min-width: 880px) {
    .grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .card {
    background: white;
    border-radius: 20px;
    padding: clamp(1.4rem, 3vw, 1.9rem);
    border: 1px solid #e0e7ff;
    box-shadow: 0 24px 56px -46px rgba(30, 41, 59, 0.45);
    display: grid;
    gap: 1.15rem;
  }

  .card header {
    display: grid;
    gap: 0.3rem;
  }

  .card h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #0f172a;
  }

  .audience {
    margin: 0;
    color: #64748b;
    font-weight: 600;
  }

  dl {
    margin: 0;
    display: grid;
    gap: 0.6rem;
  }

  dl div {
    display: grid;
    gap: 0.15rem;
  }

  dt {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  dd {
    margin: 0;
    font-weight: 600;
    color: #1f2937;
  }

  .note {
    margin: 0;
    color: #475569;
    line-height: 1.6;
  }

  .inline-link {
    color: #2563eb;
    font-weight: 600;
    text-decoration: none;
  }

  .inline-link:hover,
  .inline-link:focus-visible {
    text-decoration: underline;
  }

  .callout {
    background: linear-gradient(135deg, #111827, #1f2937 60%, #1e293b);
    color: white;
    border-radius: 22px;
    padding: clamp(1.75rem, 3vw, 2.5rem);
    display: grid;
    gap: 1.25rem;
    box-shadow: 0 32px 72px -48px rgba(15, 23, 42, 0.85);
  }

  .callout h3 {
    margin: 0;
    font-size: 1.5rem;
  }

  .callout ul {
    margin: 0;
    padding-left: 1.3rem;
    display: grid;
    gap: 0.75rem;
    color: rgba(226, 232, 240, 0.9);
    line-height: 1.6;
  }

  .cta.tertiary {
    justify-self: start;
    background: rgba(59, 130, 246, 0.22);
    color: #bfdbfe;
    border: 1px solid rgba(96, 165, 250, 0.35);
  }

  .cta.tertiary:hover,
  .cta.tertiary:focus-visible {
    transform: translateY(-2px);
    background: rgba(59, 130, 246, 0.3);
  }
</style>
