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

  const guidelines = [
    'Keep the hero line under 120 characters for Telegram preview cards.',
    'Mention the reserve price or remaining slots to create urgency.',
    'Tag stewards with @handles if human review is required before posting.'
  ];

  let selectedGroup = groups[0];
  let selectedTemplateIndex = 0;
  let customMessage = templates[0].message;
  let schedule = '';

  $: scheduledLabel = (() => {
    if (!schedule) return 'Sending ASAP';
    const parsed = new Date(schedule);
    return Number.isNaN(parsed.getTime()) ? 'Schedule pending' : parsed.toLocaleString();
  })();

  const handleTemplateChange = (event: Event) => {
    const index = Number((event.currentTarget as HTMLSelectElement).value);
    selectedTemplateIndex = index;
    customMessage = templates[index].message;
  };
</script>

<section class="send-page" aria-labelledby="send-title">
  <header class="hero">
    <div class="hero-copy">
      <h2 id="send-title">Compose the winning auction message</h2>
      <p>
        Align on tone, timing, and compliance before the bot posts into Telegram. The console keeps
        every broadcast consistent with your approved templates.
      </p>
      <div class="cta-row">
        <a class="cta primary" href="/groups">Check group roster</a>
        <a class="cta secondary" href="/admin">Sync with stewards</a>
      </div>
    </div>
    <dl class="metrics" aria-label="Delivery snapshot">
      <div>
        <dt>15 min windows</dt>
        <dd>Queue up before the next auction refresh.</dd>
      </div>
      <div>
        <dt>Auto pinning</dt>
        <dd>Winning copy pins for 2 hours by default.</dd>
      </div>
      <div>
        <dt>Reply routing</dt>
        <dd>All responses forward back to the originating agent.</dd>
      </div>
    </dl>
  </header>

  <div class="composer">
    <form class="form" aria-labelledby="composer-title">
      <h3 id="composer-title">Message builder</h3>
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
        <select bind:value={selectedTemplateIndex} on:change={handleTemplateChange}>
          {#each templates as template, index}
            <option value={index}>{template.label}</option>
          {/each}
        </select>
      </label>

      <label>
        <span>Custom message</span>
        <textarea
          bind:value={customMessage}
          rows={6}
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
        <small id="schedule-help">Leave blank to send immediately after steward approval.</small>
      </label>

      <button type="button">Queue message</button>
    </form>

    <aside class="preview" aria-live="polite">
      <h3>Preview</h3>
      <div class="preview-card">
        <header>
          <span class="pill">{selectedGroup}</span>
          <span>{scheduledLabel}</span>
        </header>
        <p>{customMessage}</p>
        <footer>
          <span>Template: {templates[selectedTemplateIndex].label}</span>
          <span>Bot pins message &amp; forwards replies</span>
        </footer>
      </div>
      <ul>
        {#each guidelines as guideline}
          <li>{guideline}</li>
        {/each}
      </ul>
    </aside>
  </div>
</section>

<style>
  .send-page {
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

  .composer {
    display: grid;
    gap: 1.75rem;
  }

  @media (min-width: 980px) {
    .composer {
      grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
      align-items: start;
    }
  }

  .form {
    background: white;
    border-radius: 22px;
    padding: clamp(1.5rem, 3vw, 2.25rem);
    border: 1px solid #e0e7ff;
    box-shadow: 0 28px 64px -50px rgba(30, 41, 59, 0.5);
    display: grid;
    gap: 1.2rem;
  }

  .form h3 {
    margin: 0;
    font-size: 1.35rem;
    color: #0f172a;
  }

  label {
    display: grid;
    gap: 0.6rem;
  }

  span {
    font-weight: 600;
    color: #1f2937;
  }

  select,
  textarea,
  input {
    font: inherit;
    padding: 0.75rem 0.85rem;
    border-radius: 12px;
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
    padding: 0.8rem 1.6rem;
    border-radius: 999px;
    background: #111827;
    color: white;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  button:hover,
  button:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 16px 32px -28px rgba(17, 24, 39, 0.7);
  }

  .preview {
    background: linear-gradient(135deg, #111827, #1f2937 55%, #1e293b 100%);
    color: white;
    border-radius: 22px;
    padding: clamp(1.6rem, 3vw, 2.2rem);
    display: grid;
    gap: 1.35rem;
    box-shadow: 0 32px 70px -54px rgba(15, 23, 42, 0.9);
  }

  .preview h3 {
    margin: 0;
    font-size: 1.35rem;
  }

  .preview-card {
    background: rgba(15, 23, 42, 0.55);
    border-radius: 18px;
    padding: 1.25rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    display: grid;
    gap: 1rem;
  }

  .preview-card header,
  .preview-card footer {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    color: rgba(226, 232, 240, 0.85);
  }

  .preview-card p {
    margin: 0;
    line-height: 1.65;
    color: rgba(248, 250, 252, 0.95);
    white-space: pre-line;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.25);
    color: #bfdbfe;
    font-weight: 600;
  }

  .preview ul {
    margin: 0;
    padding-left: 1.25rem;
    display: grid;
    gap: 0.75rem;
    color: rgba(226, 232, 240, 0.85);
    line-height: 1.6;
  }
</style>
