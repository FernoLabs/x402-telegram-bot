<script lang="ts">
  const groups = [
    {
      name: 'Memecoin Cabal',
      audience: 'Degens & Market Makers',
      members: '12,500',
      cadence: 'Daily auction digest',
      note: 'High-velocity memecoin bidding with curated whitelist drops.'
    },
    {
      name: 'Ferno Tech Expert',
      audience: 'Infra founders & angel syndicates',
      members: '8,900',
      cadence: 'Twice weekly technical auctions',
      note: 'Focuses on infrastructure tokens and validator slots.'
    },
    {
      name: 'Monkey DAO',
      audience: 'NFT collectors & DAO treasurers',
      members: '15,300',
      cadence: 'Weekend spotlight auctions',
      note: 'Premier Solana-native collectibles with charity tie-ins.'
    }
  ];
</script>

<section class="groups">
  <header>
    <h2>Telegram auction groups</h2>
    <p>Each community runs the same single auction format to keep coordination tight.</p>
  </header>

  <div class="grid">
    {#each groups as group}
      <article>
        <h3>{group.name}</h3>
        <dl>
          <div>
            <dt>Audience</dt>
            <dd>{group.audience}</dd>
          </div>
          <div>
            <dt>Members</dt>
            <dd>{group.members}</dd>
          </div>
          <div>
            <dt>Cadence</dt>
            <dd>{group.cadence}</dd>
          </div>
        </dl>
        <p>{group.note}</p>
      </article>
    {/each}
  </div>
</section>

<style>
  .groups {
    max-width: 1000px;
    margin: 0 auto;
    display: grid;
    gap: 1.5rem;
  }

  header p {
    margin: 0;
    color: #4b5563;
  }

  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  article {
    background: white;
    border-radius: 14px;
    padding: 1.25rem;
    border: 1px solid #e5e7eb;
    box-shadow: 0 10px 24px -18px rgba(30, 41, 59, 0.35);
    display: grid;
    gap: 0.75rem;
  }

  h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #1f2937;
  }

  dl {
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }

  dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
  }

  dd {
    margin: 0;
    font-weight: 600;
    color: #111827;
  }

  p {
    margin: 0;
    color: #4b5563;
    line-height: 1.6;
  }
</style>
