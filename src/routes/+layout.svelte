<script lang="ts">
  import { page } from '$app/stores';
  import favicon from '$lib/assets/favicon.svg';
  import { WalletButton, WalletProvider } from '$lib/components';

  let { children } = $props();

  const navLinks = [
    { href: '/', label: 'Overview' },
    { href: '/setup', label: 'Setup Guide' },
    { href: '/groups', label: 'Groups' },
    { href: '/send', label: 'Send a Message' }
  ];
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<WalletProvider rpcEndpoint="/api/solana/rpc" />

<div class="app-shell">
  <header>
    <h1>x402 Telegram Console</h1>
    <div class="header-actions">
      <nav aria-label="Main navigation">
        <ul>
          {#each navLinks as link}
            <li>
              <a
                href={link.href}
                aria-current={$page.url.pathname === link.href ? 'page' : undefined}
              >
                {link.label}
              </a>
            </li>
          {/each}
        </ul>
      </nav>
      <div class="wallet-actions" aria-live="polite">
        <WalletButton />
      </div>
    </div>
  </header>

  <main>
    {@render children?.()}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f5f6fa;
    color: #1f2933;
  }

  .app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    background: white;
    border-bottom: 1px solid #e3e8f0;
    padding: 1rem clamp(1rem, 3vw, 3rem);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 2rem;
    justify-content: space-between;
  }

  .header-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
  }

  h1 {
    font-size: clamp(1.25rem, 2vw + 1rem, 1.75rem);
    margin: 0;
  }

  nav ul {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
  }

  nav a {
    text-decoration: none;
    color: #4b5563;
    font-weight: 600;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    transition: background 0.2s ease, color 0.2s ease;
  }

  nav a[aria-current='page'] {
    background: #111827;
    color: white;
  }

  nav a:not([aria-current='page']):hover {
    background: rgba(17, 24, 39, 0.08);
    color: #111827;
  }

  .wallet-actions {
    display: flex;
    align-items: center;
  }

  main {
    flex: 1;
    padding: clamp(1.5rem, 3vw, 3rem);
  }
</style>
