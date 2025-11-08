<script lang="ts">
  const groups = [
    {
      name: 'Memecoin Cabal',
      focus: 'Markets & rapid launches',
      members: '12,500',
      price: '1.00 USDC',
      pace: 'Open 24/7'
    },
    {
      name: 'Ferno Tech Expert',
      focus: 'Infrastructure founders',
      members: '8,900',
      price: '1.50 USDC',
      pace: 'Weekdays only'
    },
    {
      name: 'Monkey DAO',
      focus: 'Solana NFT collectors',
      members: '15,300',
      price: '0.75 USDC',
      pace: 'Afternoons UTC'
    }
  ];
</script>

<section class="page" aria-labelledby="groups-title">
  <header>
    <h2 id="groups-title">Active groups</h2>
    <p>
      These communities accept paid posts through x402. Each listing shows the current USDC price per
      message and the posting cadence so you can plan ahead.
    </p>
  </header>

  <table>
    <caption class="visually-hidden">Telegram groups enabled for x402 payments</caption>
    <thead>
      <tr>
        <th scope="col">Group</th>
        <th scope="col">Focus</th>
        <th scope="col">Members</th>
        <th scope="col">Price per message</th>
        <th scope="col">Availability</th>
        <th scope="col" class="actions">Action</th>
      </tr>
    </thead>
    <tbody>
      {#each groups as group}
        <tr>
          <th scope="row">{group.name}</th>
          <td>{group.focus}</td>
          <td>{group.members}</td>
          <td>{group.price}</td>
          <td>{group.pace}</td>
          <td class="actions">
            <a href="/send" class="action">Send message</a>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <section class="note" aria-labelledby="note-title">
    <h3 id="note-title">How pricing works</h3>
    <p>
      Senders pay the listed amount in USDC on the Solana network using x402. Payments confirm within
      seconds and the bot posts the message with a receipt. Group owners can pause listings or adjust
      pricing at any time.
    </p>
    <a class="action" href="/setup">Add your group</a>
  </section>
</section>

<style>
  .page {
    max-width: 960px;
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

  table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    overflow: hidden;
  }

  th,
  td {
    padding: 0.9rem 1rem;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
    color: #1f2937;
  }

  thead th {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #6b7280;
    background: #f9fafb;
  }

  tbody tr:last-child th,
  tbody tr:last-child td {
    border-bottom: none;
  }

  th[scope='row'] {
    font-weight: 600;
    color: #111827;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.45rem 1rem;
    border-radius: 8px;
    background: #111827;
    color: white;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .actions {
    text-align: right;
    min-width: 130px;
  }

  .note {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
    display: grid;
    gap: 1rem;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
