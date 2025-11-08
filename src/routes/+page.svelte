<section class="intro">
  <h2>Operate a single auction-ready Telegram feed.</h2>
  <p>
    Keep things simple: manage one curated auction format across your communities. Use the
    navigation above to browse the group list, broadcast auction updates, and oversee daily
    operations.
  </p>

  <div class="cards">
    <article>
      <h3>1. Review the groups</h3>
      <p>Check current inventory like Memecoin Cabal, Ferno Tech Expert, and Monkey DAO.</p>
      <a href="/groups">Go to group list →</a>
    </article>
    <article>
      <h3>2. Schedule the message</h3>
      <p>Pick your target group, compose the auction call-to-action, and set the timing.</p>
      <a href="/send">Open message console →</a>
    </article>
    <article>
      <h3>3. Confirm operations</h3>
      <p>Track admins, contact methods, and reserve price updates in one place.</p>
      <a href="/admin">Visit group admin →</a>
    </article>
  </div>
</section>

<style>
  .intro {
    max-width: 960px;
    margin: 0 auto;
    display: grid;
    gap: 1.5rem;
  }

  h2 {
    font-size: clamp(1.75rem, 2vw + 1.5rem, 2.25rem);
    margin-bottom: 0.5rem;
  }

  p {
    margin: 0;
    color: #4b5563;
    line-height: 1.6;
  }

  .cards {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  article {
    background: white;
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 12px 24px -20px rgba(15, 23, 42, 0.45);
    border: 1px solid #e0e7ff;
    display: grid;
    gap: 0.75rem;
  }

  article h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #111827;
  }

  article a {
    color: #2563eb;
    font-weight: 600;
    text-decoration: none;
  }

  article a:hover {
    text-decoration: underline;
  }
</style>
