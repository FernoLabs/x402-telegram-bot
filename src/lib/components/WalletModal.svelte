<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import MobileWalletQR from './MobileWalletQR.svelte';
  import { wallet } from '$lib/wallet/wallet.svelte';
  import type { StandardWallet } from '$lib/wallet/types';

  interface Props {
    show?: boolean;
    appName?: string;
    appUrl?: string;
  }

  const dispatch = createEventDispatcher<{ closed: void }>();

  let {
    show = $bindable(false),
    appName = 'My Solana dApp',
    appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  }: Props = $props();

  let showMWAMode = $state<'qr' | 'deeplink' | null>(null);
  let connectError = $state<string | null>(null);

  async function handleWalletSelect(selectedWallet: StandardWallet): Promise<void> {
    connectError = null;
    try {
      await wallet.connectStandard(selectedWallet);
      show = false;
      dispatch('closed');
    } catch (error) {
      connectError =
        error instanceof Error ? error.message : 'Failed to connect with the selected wallet.';
    }
  }

  async function handleMWAConnect(): Promise<void> {
    connectError = null;

    if ($wallet.useMWA) {
      showMWAMode = 'deeplink';
      try {
        await wallet.connectMWA(appName, appUrl);
        show = false;
        dispatch('closed');
      } catch (error) {
        connectError =
          error instanceof Error ? error.message : 'Failed to connect to a mobile wallet.';
      }
    } else {
      showMWAMode = 'qr';
    }
  }

  function handleClose(): void {
    show = false;
    showMWAMode = null;
    connectError = null;
    dispatch('closed');
  }

  function handleMWABack(): void {
    showMWAMode = null;
    connectError = null;
  }

  function handleOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClose();
    }
  }

  function handleOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }
</script>

{#if show}
  <div
    class="modal-overlay"
    role="presentation"
    onclick={handleOverlayClick}
    onkeydown={handleOverlayKeydown}
    tabindex="-1"
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div class="modal-header">
        <button
          class="back-button"
          type="button"
          onclick={handleMWABack}
          style:opacity={showMWAMode ? '1' : '0'}
          style:pointer-events={showMWAMode ? 'auto' : 'none'}
          aria-label="Back"
        >
          ←
        </button>
        <h2>{showMWAMode ? 'Mobile Wallet Adapter' : 'Connect Wallet'}</h2>
        <button class="close-button" type="button" onclick={handleClose} aria-label="Close">×</button>
      </div>

      <div class="modal-content">
        {#if showMWAMode === 'qr'}
          <MobileWalletQR {appName} {appUrl} />
        {:else if showMWAMode === 'deeplink'}
          <div class="loading-state">
            <div class="spinner-large" aria-hidden="true"></div>
            <p>Opening mobile wallet…</p>
            <p class="hint">Switch back to this tab after approving the request.</p>
          </div>
        {:else}
          <div class="wallet-list">
            <button class="wallet-item featured" type="button" onclick={handleMWAConnect}>
              <div class="wallet-icon mobile">📱</div>
              <div class="wallet-info">
                <div class="wallet-name">
                  {$wallet.useMWA ? 'Mobile Wallets' : 'Scan with Mobile Wallet'}
                </div>
                <div class="wallet-description">
                  {$wallet.useMWA
                    ? 'Connect any Solana mobile wallet'
                    : 'Generate a QR code for mobile wallets'}
                </div>
              </div>
              <span aria-hidden="true">→</span>
            </button>

            {#if $wallet.availableWallets.length > 0}
              <div class="divider"><span>Detected wallets</span></div>
              {#each $wallet.availableWallets as w (w.name)}
                <button class="wallet-item" type="button" onclick={() => handleWalletSelect(w)}>
                  <div class="wallet-icon">
                    <img src={w.icon} alt={w.name} />
                  </div>
                  <div class="wallet-info">
                    <div class="wallet-name">{w.name}</div>
                    <div class="wallet-status">Installed</div>
                  </div>
                </button>
              {/each}
            {:else}
              <div class="no-wallets">
                <p>No browser wallets detected.</p>
                <p class="hint">
                  Install
                  <a href="https://phantom.app" target="_blank" rel="noopener">Phantom</a>
                  or
                  <a href="https://backpack.app" target="_blank" rel="noopener">Backpack</a>
                  to connect directly from this browser.
                </p>
              </div>
            {/if}

            {#if connectError}
              <p class="error" role="alert">{connectError}</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(4px);
    z-index: 40;
  }

  .modal {
    background: white;
    border-radius: 1.25rem;
    border: 1px solid rgba(15, 23, 42, 0.08);
    width: min(440px, 100%);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(15, 23, 42, 0.25);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }

  .back-button,
  .close-button {
    position: absolute;
    left: 1rem;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #0f172a;
    border-radius: 0.5rem;
    width: 2.25rem;
    height: 2.25rem;
  }

  .close-button {
    left: auto;
    right: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: #111827;
  }

  .modal-content {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .wallet-list {
    display: grid;
    gap: 0.75rem;
  }

  .wallet-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border-radius: 0.9rem;
    border: 1px solid rgba(15, 23, 42, 0.08);
    padding: 0.9rem 1rem;
    background: white;
    cursor: pointer;
    text-align: left;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    font-weight: 600;
  }

  .wallet-item:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  }

  .wallet-item.featured {
    background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
    color: white;
    border-color: transparent;
  }

  .wallet-item.featured .wallet-description {
    color: rgba(255, 255, 255, 0.85);
  }

  .wallet-item.featured span[aria-hidden="true"] {
    opacity: 0.8;
  }

  .wallet-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(99, 102, 241, 0.1);
    overflow: hidden;
  }

  .wallet-icon.mobile {
    font-size: 1.5rem;
    background: rgba(255, 255, 255, 0.15);
  }

  .wallet-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .wallet-info {
    flex: 1;
    min-width: 0;
  }

  .wallet-name {
    font-size: 1rem;
    color: currentColor;
  }

  .wallet-description {
    font-size: 0.85rem;
    color: #475569;
    font-weight: 500;
  }

  .wallet-status {
    font-size: 0.75rem;
    color: #16a34a;
    font-weight: 600;
  }

  .divider {
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: rgba(15, 23, 42, 0.5);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0.5rem 0;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(15, 23, 42, 0.1);
  }

  .no-wallets {
    padding: 1.25rem;
    background: rgba(15, 23, 42, 0.03);
    border-radius: 0.9rem;
    border: 1px solid rgba(15, 23, 42, 0.06);
    color: #475569;
    font-size: 0.9rem;
  }

  .no-wallets .hint a {
    color: #6366f1;
    text-decoration: none;
  }

  .error {
    margin: 0.75rem 0 0;
    color: #b91c1c;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .loading-state {
    padding: 2.5rem 1rem;
    text-align: center;
  }

  .spinner-large {
    width: 3rem;
    height: 3rem;
    border-radius: 999px;
    border: 3px solid rgba(99, 102, 241, 0.25);
    border-top-color: #6366f1;
    animation: spin 1s linear infinite;
    margin: 0 auto 1.5rem;
  }

  .loading-state p {
    margin: 0.5rem 0;
    color: #475569;
    font-weight: 600;
  }

  .hint {
    font-size: 0.85rem;
    color: rgba(15, 23, 42, 0.6);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
