<script lang="ts">
  const groups = ['Memecoin Cabal', 'Ferno Tech Expert', 'Monkey DAO'];
  const templates = [
    {
      label: 'Standard Auction Blast',
      message:
        'Auction live now! Claim your slot in the next 15 minutes. Reply with bid + wallet.'
    },
    {
      label: 'Whitelist Reminder',
      message: 'Whitelist closes in 2 hours. Reply ✅ to confirm and lock your reserve bid.'
    },
    {
      label: 'Final Call',
      message: 'Final call for bids! Highest standing offer wins the lot at 8pm UTC.'
    }
  ];

  let selectedGroup = groups[0];
  let selectedTemplate = templates[0].message;
  let customMessage = templates[0].message;
  let schedule = '';
</script>

<section class="send">
  <header>
    <h2>Send a message</h2>
    <p>Compose one auction broadcast at a time. Everything stays aligned across groups.</p>
  </header>

  <form class="form">
    <label>
      <span>Target group</span>
      <select bind:value={selectedGroup}>
        {#each groups as group}
          <option value={group}>{group}</option>
        {/each}
      </select>
    </label>

    <label>
      <span>Message template</span>
      <select
        bind:value={selectedTemplate}
        on:change={(event) => (customMessage = (event.currentTarget as HTMLSelectElement).value)}
      >
        {#each templates as template}
          <option value={template.message}>{template.label}</option>
        {/each}
      </select>
    </label>

    <label>
      <span>Custom message</span>
      <textarea
        bind:value={customMessage}
        rows={5}
        spellcheck="false"
        placeholder="Enter the final copy that will be sent to Telegram"
      ></textarea>
    </label>

    <label>
      <span>Schedule (optional)</span>
      <input
        type="datetime-local"
        bind:value={schedule}
        aria-describedby="schedule-help"
      />
      <small id="schedule-help">Leave blank to send immediately.</small>
    </label>

    <button type="button">Queue message</button>
  </form>
</section>

<style>
  .send {
    max-width: 720px;
    margin: 0 auto;
    display: grid;
    gap: 1.5rem;
  }

  header p {
    margin: 0;
    color: #4b5563;
  }

  .form {
    background: white;
    border-radius: 14px;
    padding: 1.5rem;
    border: 1px solid #e5e7eb;
    box-shadow: 0 20px 40px -32px rgba(30, 41, 59, 0.45);
    display: grid;
    gap: 1.25rem;
  }

  label {
    display: grid;
    gap: 0.5rem;
  }

  span {
    font-weight: 600;
    color: #1f2937;
  }

  select,
  textarea,
  input {
    font: inherit;
    padding: 0.75rem;
    border-radius: 10px;
    border: 1px solid #d1d5db;
    background: #f9fafb;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  select:focus,
  textarea:focus,
  input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
    background: white;
  }

  textarea {
    resize: vertical;
  }

  small {
    color: #6b7280;
  }

  button {
    justify-self: start;
    padding: 0.75rem 1.5rem;
    border-radius: 999px;
    background: #111827;
    color: white;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  button:hover {
    background: #1f2937;
  }
</style>
