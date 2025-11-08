<script lang="ts">
  const adminRows = [
    {
      group: 'Memecoin Cabal',
      steward: 'Jules Vega',
      contact: '@jules_vega',
      reserve: '15 SOL',
      notes: 'Confirm treasury split before Friday auction.'
    },
    {
      group: 'Ferno Tech Expert',
      steward: 'Iris Ferno',
      contact: '@ferno_ops',
      reserve: '22 SOL',
      notes: 'Validator partner wants extra spotlight slide.'
    },
    {
      group: 'Monkey DAO',
      steward: 'Kade Monroe',
      contact: '@monkey_ops',
      reserve: '18 SOL',
      notes: 'DAO treasury matching highest bid up to 20 SOL.'
    }
  ];
</script>

<section class="admin">
  <header>
    <h2>Group administration</h2>
    <p>Single auction type keeps these stewardship details consistent each week.</p>
  </header>

  <div class="panel">
    <table>
      <caption>Operational checklist</caption>
      <thead>
        <tr>
          <th scope="col">Group</th>
          <th scope="col">Steward</th>
          <th scope="col">Contact</th>
          <th scope="col">Reserve price</th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        {#each adminRows as row}
          <tr>
            <th scope="row">{row.group}</th>
            <td>{row.steward}</td>
            <td>{row.contact}</td>
            <td>{row.reserve}</td>
            <td>{row.notes}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .admin {
    max-width: 940px;
    margin: 0 auto;
    display: grid;
    gap: 1.5rem;
  }

  header p {
    margin: 0;
    color: #4b5563;
  }

  .panel {
    background: white;
    border-radius: 14px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 18px 40px -30px rgba(30, 41, 59, 0.4);
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  caption {
    text-align: left;
    font-weight: 600;
    padding: 1.25rem 1.5rem 0.75rem;
    color: #1f2937;
  }

  th,
  td {
    padding: 0.75rem 1.5rem;
    text-align: left;
    border-top: 1px solid #f1f5f9;
    color: #1f2937;
  }

  thead th {
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: #6b7280;
  }

  tbody th {
    font-size: 0.95rem;
  }

  tbody tr:nth-child(even) {
    background: #f9fafb;
  }
</style>
