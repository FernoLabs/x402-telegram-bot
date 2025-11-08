<script lang="ts">
  const groups = ['Memecoin Cabal', 'Ferno Tech Expert', 'Monkey DAO'];
  const prices: Record<string, string> = {
    'Memecoin Cabal': '1.00 USDC',
    'Ferno Tech Expert': '1.50 USDC',
    'Monkey DAO': '0.75 USDC'
  };

  let selectedGroup = groups[0];
  let message = '';
  let sender = '';
</script>

<section class="page" aria-labelledby="send-title">
  <header>
    <h2 id="send-title">Send a paid message</h2>
    <p>
      Fund your post with x402 using USDC on Solana. Once the payment clears, the bot drops the
      message into the selected Telegram group and shares a receipt with members.
    </p>
  </header>

  <form class="form" aria-label="Paid message form">
    <label>
      <span>Group</span>
      <select bind:value={selectedGroup}>
        {#each groups as group}
          <option value={group}>{group} — {prices[group]}</option>
        {/each}
      </select>
    </label>

    <label>
      <span>Sender name</span>
      <input
        type="text"
        bind:value={sender}
        placeholder="How should this message be credited?"
      />
    </label>

    <label>
      <span>Message</span>
      <textarea
        rows={5}
        bind:value={message}
        placeholder="Write the announcement you want the bot to post"
      ></textarea>
    </label>

    <button type="button">Generate payment link</button>
  </form>

  <aside class="help" aria-live="polite">
    <h3>What happens next</h3>
    <ol>
      <li>Click “Generate payment link” to open x402 with the correct USDC amount.</li>
      <li>Approve the Solana transaction from your wallet.</li>
      <li>The bot posts the message and pins a receipt once payment confirms.</li>
    </ol>
    <p>
      Need to adjust the price? Update it from the <a href="/groups">group directory</a> before
      sharing the link.
    </p>
  </aside>
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

  .form {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
    display: grid;
    gap: 1rem;
  }

  label {
    display: grid;
    gap: 0.4rem;
  }

  span {
    font-weight: 600;
    color: #111827;
  }

  input,
  select,
  textarea {
    border: 1px solid #cbd5f5;
    border-radius: 10px;
    padding: 0.55rem 0.75rem;
    font: inherit;
    color: #111827;
    background: #f8fafc;
  }

  textarea {
    resize: vertical;
  }

  button {
    justify-self: start;
    padding: 0.55rem 1.25rem;
    border: none;
    border-radius: 10px;
    background: #111827;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }

  .help {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
    display: grid;
    gap: 0.75rem;
  }

  .help ol {
    margin: 0;
    padding-left: 1.2rem;
    color: #475569;
    line-height: 1.6;
  }

  a {
    color: #0f172a;
  }
</style>
