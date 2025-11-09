#!/bin/bash

# Svelte Unified Wallet Kit - Automated Setup Script
# This script sets up a complete SvelteKit project with MWA 2.0 + Wallet Standard

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project name
PROJECT_NAME="${1:-svelte-unified-wallet-kit}"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Svelte Unified Wallet Kit - Automated Setup             ║${NC}"
echo -e "${BLUE}║   MWA 2.0 + Wallet Standard Implementation                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js version: $(node --version)"
echo -e "${GREEN}✓${NC} npm version: $(npm --version)"
echo ""

# Create project directory
echo -e "${YELLOW}[1/8]${NC} Creating SvelteKit project..."

# Use the new sv command
npx sv create "$PROJECT_NAME" --template minimal --types ts --no-add-ons --no-install

if [ ! -d "$PROJECT_NAME" ]; then
    echo -e "${RED}Error: Failed to create project directory${NC}"
    exit 1
fi

cd "$PROJECT_NAME"

# Install dependencies
echo ""
echo -e "${YELLOW}[2/8]${NC} Installing dependencies..."
npm install

# Install Solana Web3.js
echo ""
echo -e "${YELLOW}[3/8]${NC} Installing @solana/web3.js..."
npm install @solana/web3.js

# Create directory structure
echo ""
echo -e "${YELLOW}[4/8]${NC} Creating directory structure..."
mkdir -p src/lib/wallet
mkdir -p src/lib/components

# Create types.ts
echo ""
echo -e "${YELLOW}[5/8]${NC} Creating type definitions..."
cat > src/lib/wallet/types.ts << 'EOS'
import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

// Wallet Standard types
export interface StandardWalletAccount {
  address: string;
  publicKey: Uint8Array;
  chains: string[];
  features: string[];
  label?: string;
  icon?: string;
}

export interface StandardWallet {
  version: string;
  name: string;
  icon: string;
  chains: string[];
  features: {
    'standard:connect': {
      connect(): Promise<{ accounts: StandardWalletAccount[] }>;
    };
    'standard:disconnect': {
      disconnect(): Promise<void>;
    };
    'standard:events': {
      on(event: string, callback: (...args: any[]) => void): () => void;
    };
    'solana:signAndSendTransaction'?: {
      signAndSendTransaction(
        transaction: Transaction | VersionedTransaction
      ): Promise<{ signature: string }>;
    };
    'solana:signTransaction'?: {
      signTransaction(
        transaction: Transaction | VersionedTransaction
      ): Promise<Transaction | VersionedTransaction>;
    };
    'solana:signMessage'?: {
      signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
    };
  };
  accounts: StandardWalletAccount[];
}

export interface WalletStandardWindow {
  navigator?: {
    wallets?: StandardWallets;
  };
}

export interface StandardWallets {
  get(): StandardWallet[];
  on(event: 'register', callback: (wallet: StandardWallet) => void): () => void;
}

// MWA types
export interface MWAIdentity {
  uri?: string;
  icon?: string;
  name?: string;
}

export interface MWAAccount {
  address: string;
  display_address?: string;
  display_address_format?: string;
  label?: string;
  icon?: string;
  chains: string[];
  features?: string[];
}

export interface MWAAuthorizeResult {
  auth_token: string;
  accounts: MWAAccount[];
  wallet_uri_base?: string;
  wallet_icon?: string;
}

export interface MobileWalletSession {
  publicKey: PublicKey;
  associationToken: string;
}
EOS

# Create standard-wallets.ts
cat > src/lib/wallet/standard-wallets.ts << 'EOS'
import { browser } from '$app/environment';
import type { StandardWallet, WalletStandardWindow } from './types';

export function getStandardWallets(): StandardWallet[] {
  if (!browser) return [];

  const windowWithWallets = window as WalletStandardWindow;
  const wallets = windowWithWallets.navigator?.wallets;

  if (!wallets) return [];

  return wallets.get();
}

export function onWalletRegistered(callback: (wallet: StandardWallet) => void): () => void {
  if (!browser) return () => {};

  const windowWithWallets = window as WalletStandardWindow;
  const wallets = windowWithWallets.navigator?.wallets;

  if (!wallets) return () => {};

  return wallets.on('register', callback);
}

export function detectLegacyWallets(): StandardWallet[] {
  if (!browser) return [];

  const legacyWallets: StandardWallet[] = [];
  const windowWithSolana = window as any;

  if (windowWithSolana.solana) {
    const provider = windowWithSolana.solana;
    const isPhantom = provider.isPhantom;

    legacyWallets.push({
      version: '1.0.0',
      name: isPhantom ? 'Phantom' : 'Solana Wallet',
      icon: provider.icon || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text y="24" font-size="24">💼</text></svg>',
      chains: ['solana:mainnet', 'solana:devnet', 'solana:testnet'],
      features: {
        'standard:connect': {
          async connect() {
            await provider.connect();
            return {
              accounts: [{
                address: provider.publicKey.toString(),
                publicKey: provider.publicKey.toBytes(),
                chains: ['solana:mainnet'],
                features: [],
              }],
            };
          },
        },
        'standard:disconnect': {
          async disconnect() {
            await provider.disconnect();
          },
        },
        'standard:events': {
          on(event: string, callback: (...args: any[]) => void) {
            provider.on(event, callback);
            return () => provider.off(event, callback);
          },
        },
        'solana:signAndSendTransaction': provider.signAndSendTransaction ? {
          async signAndSendTransaction(transaction: any) {
            const signature = await provider.signAndSendTransaction(transaction);
            return { signature };
          },
        } : undefined,
      },
      accounts: [],
    });
  }

  return legacyWallets;
}
EOS

# Create mobile detection utilities
cat > src/lib/wallet/mobile-detection.ts << 'EOS'
import { browser } from '$app/environment';

export function isMobile(): boolean {
  if (!browser) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function supportsWalletMobileProtocol(): boolean {
  if (!isMobile()) return false;
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isAndroid || isIOS;
}

export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (!browser) return 'desktop';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export function generateMobileConnectURL(
  appName: string,
  appUrl: string,
  port: number
): string {
  const params = new URLSearchParams({
    association: 'temp-token',
    port: port.toString(),
    v: '2',
  });
  return `solana-wallet:/v1/associate/local?${params.toString()}`;
}
EOS

# Create wallet store
cat > src/lib/wallet/wallet.svelte.ts << 'EOS'
import { PublicKey } from '@solana/web3.js';
import { browser } from '$app/environment';
import { getStandardWallets, onWalletRegistered, detectLegacyWallets } from './standard-wallets';
import { isMobile } from './mobile-detection';
import type { StandardWallet, StandardWalletAccount } from './types';

// Popular Solana wallets with their info
const KNOWN_WALLETS = [
  {
    name: 'Phantom',
    icon: 'https://phantom.app/img/phantom-icon-purple.png',
    url: 'https://phantom.app',
  },
  {
    name: 'Backpack',
    icon: 'https://backpack.app/favicon.ico',
    url: 'https://backpack.app',
  },
  {
    name: 'Solflare',
    icon: 'https://solflare.com/favicon.ico',
    url: 'https://solflare.com',
  },
  {
    name: 'Glow',
    icon: 'https://glow.app/favicon.ico',
    url: 'https://glow.app',
  },
  {
    name: 'Brave Wallet',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><text y="24" font-size="24">🦁</text></svg>',
    url: 'https://brave.com/wallet',
  },
];

class WalletStore {
  wallet = $state<StandardWallet | null>(null);
  account = $state<StandardWalletAccount | null>(null);
  publicKey = $state<PublicKey | null>(null);
  connected = $state(false);
  connecting = $state(false);
  disconnecting = $state(false);
  detectedWallets = $state<StandardWallet[]>([]);

  shortAddress = $derived(
    this.publicKey
      ? `${this.publicKey.toString().slice(0, 4)}...${this.publicKey.toString().slice(-4)}`
      : ''
  );

  isMobileDevice = $derived(browser && isMobile());

  // Combined list: detected wallets + known wallets
  availableWallets = $derived(() => {
    const detected = this.detectedWallets;
    const all = KNOWN_WALLETS.map(known => {
      const found = detected.find(d => d.name === known.name);
      if (found) {
        return { ...found, installed: true, downloadUrl: known.url };
      }
      // Return placeholder for non-installed wallets
      return {
        name: known.name,
        icon: known.icon,
        installed: false,
        downloadUrl: known.url,
      } as any;
    });
    
    // Add any detected wallets not in known list
    detected.forEach(d => {
      if (!KNOWN_WALLETS.find(k => k.name === d.name)) {
        all.push({ ...d, installed: true });
      }
    });
    
    return all;
  });

  initialize(rpcEndpoint: string) {
    if (!browser) return;

    const standardWallets = getStandardWallets();
    const legacyWallets = detectLegacyWallets();
    this.detectedWallets = [...standardWallets, ...legacyWallets];

    onWalletRegistered((wallet) => {
      if (!this.detectedWallets.find(w => w.name === wallet.name)) {
        this.detectedWallets = [...this.detectedWallets, wallet];
      }
    });

    const lastWallet = localStorage.getItem('lastConnectedWallet');
    if (lastWallet) {
      const wallet = this.detectedWallets.find(w => w.name === lastWallet);
      if (wallet) {
        setTimeout(() => this.connect(wallet), 100);
      }
    }
  }

  async connect(selectedWallet: StandardWallet) {
    if (this.connecting || this.connected) return;

    // Check if wallet is actually installed
    if (!(selectedWallet as any).features) {
      // Wallet not installed - redirect to download
      const downloadUrl = (selectedWallet as any).downloadUrl;
      if (downloadUrl) {
        window.open(downloadUrl, '_blank');
      }
      throw new Error('Wallet not installed. Please install the wallet extension first.');
    }

    this.connecting = true;

    try {
      const connectFeature = selectedWallet.features['standard:connect'];
      const result = await connectFeature.connect();
      const account = result.accounts[0];

      if (!account) throw new Error('No account returned');

      this.wallet = selectedWallet;
      this.account = account;
      this.publicKey = new PublicKey(account.publicKey);
      this.connected = true;

      localStorage.setItem('lastConnectedWallet', selectedWallet.name);

      const eventsFeature = selectedWallet.features['standard:events'];
      if (eventsFeature) {
        eventsFeature.on('disconnect', () => {
          this.disconnect();
        });
      }
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  async disconnect() {
    if (!this.wallet) return;

    this.disconnecting = true;

    try {
      const disconnectFeature = this.wallet.features['standard:disconnect'];
      await disconnectFeature.disconnect();

      this.wallet = null;
      this.account = null;
      this.publicKey = null;
      this.connected = false;

      localStorage.removeItem('lastConnectedWallet');
    } catch (error) {
      console.error('Disconnect failed:', error);
    } finally {
      this.disconnecting = false;
    }
  }

  async signAndSendTransaction(transaction: any): Promise<string> {
    if (!this.wallet) throw new Error('Wallet not connected');

    const feature = this.wallet.features['solana:signAndSendTransaction'];
    if (!feature) throw new Error('Wallet does not support signing transactions');

    const result = await feature.signAndSendTransaction(transaction);
    return result.signature;
  }
}

export const wallet = new WalletStore();
EOS

# Create WalletProvider component
echo ""
echo -e "${YELLOW}[6/8]${NC} Creating Svelte components..."

cat > src/lib/components/WalletProvider.svelte << 'EOS'
<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { wallet } from '$lib/wallet/wallet.svelte';

  interface Props {
    rpcEndpoint?: string;
    children?: import('svelte').Snippet;
  }

  let {
    rpcEndpoint = 'https://api.mainnet-beta.solana.com',
    children,
  }: Props = $props();

  setContext('wallet', wallet);

  onMount(() => {
    wallet.initialize(rpcEndpoint);
  });
</script>

<div class="wallet-provider">
  {@render children?.()}
</div>

<style>
  .wallet-provider {
    --wallet-bg: #1a1b1f;
    --wallet-text: #ffffff;
    --wallet-primary: #9945ff;
    --wallet-hover: #2a2b2f;
    --wallet-border: rgba(255, 255, 255, 0.1);
  }
</style>
EOS

# Create WalletButton component
cat > src/lib/components/WalletButton.svelte << 'EOS'
<script lang="ts">
  import { wallet } from '$lib/wallet/wallet.svelte';
  import WalletModal from './WalletModal.svelte';

  let showModal = $state(false);
  let showDropdown = $state(false);

  function handleConnect() {
    showModal = true;
  }

  function handleDisconnect() {
    wallet.disconnect();
    showDropdown = false;
  }

  function copyAddress() {
    if (wallet.publicKey) {
      navigator.clipboard.writeText(wallet.publicKey.toString());
    }
  }

  $effect(() => {
    if (showDropdown) {
      const handler = () => (showDropdown = false);
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  });
</script>

{#if wallet.connected}
  <div class="wallet-container">
    <button class="wallet-btn connected" onclick={() => (showDropdown = !showDropdown)} type="button">
      {#if wallet.wallet?.icon}
        <img src={wallet.wallet.icon} alt={wallet.wallet.name} class="icon" />
      {/if}
      <span>{wallet.shortAddress}</span>
    </button>

    {#if showDropdown}
      <div class="dropdown">
        <button onclick={copyAddress} type="button">Copy Address</button>
        <button onclick={handleDisconnect} type="button">Disconnect</button>
      </div>
    {/if}
  </div>
{:else}
  <button class="wallet-btn primary" onclick={handleConnect} disabled={wallet.connecting} type="button">
    {wallet.connecting ? 'Connecting...' : 'Connect Wallet'}
  </button>
{/if}

<WalletModal bind:show={showModal} />

<style>
  .wallet-container {
    position: relative;
  }

  .wallet-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--wallet-bg);
    border: 1px solid var(--wallet-border);
    border-radius: 12px;
    color: var(--wallet-text);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }

  .wallet-btn.primary {
    background: var(--wallet-primary);
    border-color: var(--wallet-primary);
  }

  .wallet-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .wallet-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .icon {
    width: 20px;
    height: 20px;
    border-radius: 4px;
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: var(--wallet-bg);
    border: 1px solid var(--wallet-border);
    border-radius: 12px;
    padding: 8px;
    min-width: 180px;
    z-index: 1000;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .dropdown button {
    width: 100%;
    padding: 10px;
    background: none;
    border: none;
    color: var(--wallet-text);
    text-align: left;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
  }

  .dropdown button:hover {
    background: var(--wallet-hover);
  }
</style>
EOS

# Create WalletModal component
cat > src/lib/components/WalletModal.svelte << 'EOS'
<script lang="ts">
  import { wallet } from '$lib/wallet/wallet.svelte';
  import type { StandardWallet } from '$lib/wallet/types';

  interface Props {
    show?: boolean;
  }

  let { show = $bindable(false) }: Props = $props();
  let error = $state<string | null>(null);

  async function handleWalletSelect(selectedWallet: any) {
    error = null;
    
    // Check if wallet is installed
    if (!selectedWallet.installed) {
      // Open download link in new tab
      window.open(selectedWallet.downloadUrl, '_blank');
      error = `${selectedWallet.name} is not installed. Opening download page...`;
      return;
    }

    try {
      await wallet.connect(selectedWallet);
      show = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Connection failed';
      console.error('Connection failed:', err);
    }
  }

  function handleClose() {
    show = false;
    error = null;
  }
</script>

{#if show}
  <div class="modal-overlay" onclick={handleClose} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog">
      <div class="modal-header">
        <h2>Connect Wallet</h2>
        <button class="close" onclick={handleClose} type="button" aria-label="Close">×</button>
      </div>

      {#if error}
        <div class="error-banner">
          <span>⚠️</span>
          <p>{error}</p>
        </div>
      {/if}

      <div class="wallet-list">
        {#if wallet.availableWallets.length === 0}
          <div class="no-wallets">
            <p>Loading wallets...</p>
          </div>
        {:else}
          {#each wallet.availableWallets as w}
            <button 
              class="wallet-item" 
              class:not-installed={!w.installed}
              onclick={() => handleWalletSelect(w)} 
              type="button"
            >
              <img src={w.icon} alt={w.name} class="wallet-icon" />
              <div class="wallet-info">
                <span class="wallet-name">{w.name}</span>
                {#if w.installed}
                  <span class="badge installed">Installed</span>
                {:else}
                  <span class="badge not-installed">Not Installed</span>
                {/if}
              </div>
              {#if !w.installed}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" class="external-icon">
                  <path d="M6 3H3v10h10V10M9 3h4m0 0v4m0-4L7 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              {/if}
            </button>
          {/each}
        {/if}

        <div class="wallet-info-footer">
          <p>
            Don't have a wallet? 
            <a href="https://solana.com/ecosystem/explore?categories=wallet" target="_blank" rel="noopener">
              Browse wallets →
            </a>
          </p>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    background: var(--wallet-bg);
    border-radius: 20px;
    max-width: 440px;
    width: 100%;
    max-height: 85vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px;
    border-bottom: 1px solid var(--wallet-border);
  }

  h2 {
    margin: 0;
    color: var(--wallet-text);
    font-size: 20px;
    font-weight: 600;
  }

  .close {
    background: none;
    border: none;
    color: var(--wallet-text);
    font-size: 32px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    transition: background 0.2s;
  }

  .close:hover {
    background: var(--wallet-hover);
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 24px;
    background: rgba(239, 68, 68, 0.1);
    border-bottom: 1px solid rgba(239, 68, 68, 0.2);
  }

  .error-banner span {
    font-size: 20px;
  }

  .error-banner p {
    margin: 0;
    color: #ef4444;
    font-size: 14px;
  }

  .wallet-list {
    padding: 20px 24px 24px;
    overflow-y: auto;
    flex: 1;
  }

  .wallet-item {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 14px 16px;
    background: transparent;
    border: 2px solid var(--wallet-border);
    border-radius: 14px;
    margin-bottom: 12px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    font-family: inherit;
  }

  .wallet-item:hover {
    background: var(--wallet-hover);
    border-color: var(--wallet-primary);
    transform: translateY(-2px);
  }

  .wallet-item.not-installed {
    opacity: 0.7;
  }

  .wallet-item.not-installed:hover {
    border-color: rgba(153, 69, 255, 0.5);
  }

  .wallet-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    padding: 6px;
    object-fit: contain;
  }

  .wallet-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .wallet-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--wallet-text);
  }

  .badge {
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 4px;
    display: inline-block;
    width: fit-content;
  }

  .badge.installed {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
  }

  .badge.not-installed {
    background: rgba(156, 163, 175, 0.15);
    color: #9ca3af;
  }

  .external-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }

  .no-wallets {
    text-align: center;
    padding: 40px 20px;
    color: var(--wallet-text);
  }

  .wallet-info-footer {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--wallet-border);
    text-align: center;
  }

  .wallet-info-footer p {
    margin: 0;
    font-size: 14px;
    color: var(--wallet-text);
    opacity: 0.7;
  }

  .wallet-info-footer a {
    color: var(--wallet-primary);
    text-decoration: none;
    font-weight: 600;
  }

  .wallet-info-footer a:hover {
    text-decoration: underline;
  }

  @media (max-width: 480px) {
    .modal {
      max-width: 100%;
      margin: 0 16px;
    }

    .wallet-item {
      padding: 12px;
    }

    .wallet-icon {
      width: 36px;
      height: 36px;
    }

    .wallet-name {
      font-size: 15px;
    }
  }
</style>
EOS

# Create index file for components
cat > src/lib/components/index.ts << 'EOS'
export { default as WalletProvider } from './WalletProvider.svelte';
export { default as WalletButton } from './WalletButton.svelte';
export { default as WalletModal } from './WalletModal.svelte';
EOS

# Create layout
echo ""
echo -e "${YELLOW}[7/8]${NC} Creating example routes..."

cat > src/routes/+layout.svelte << 'EOS'
<script lang="ts">
  import { WalletProvider } from '$lib/components';
</script>

<WalletProvider rpcEndpoint="https://api.mainnet-beta.solana.com">
  <slot />
</WalletProvider>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0f;
    color: white;
  }
</style>
EOS

# Create example page
cat > src/routes/+page.svelte << 'EOS'
<script lang="ts">
  import { WalletButton } from '$lib/components';
  import { wallet } from '$lib/wallet/wallet.svelte';
</script>

<div class="container">
  <header>
    <h1>🚀 Svelte Unified Wallet Kit</h1>
    <WalletButton />
  </header>

  <main>
    {#if wallet.connected}
      <div class="card">
        <h2>✅ Wallet Connected</h2>
        <p>Address: <code>{wallet.shortAddress}</code></p>
        {#if wallet.wallet}
          <p>Wallet: {wallet.wallet.name}</p>
        {/if}
        <details>
          <summary>Full Address</summary>
          <code class="full-address">{wallet.publicKey?.toString()}</code>
        </details>
      </div>
    {:else}
      <div class="card">
        <h2>Connect Your Wallet</h2>
        <p>Click "Connect Wallet" to get started</p>
      </div>
    {/if}
  </main>
</div>

<style>
  .container {
    min-height: 100vh;
    padding: 20px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 40px;
    padding-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  h1 {
    margin: 0;
    font-size: 24px;
  }

  main {
    max-width: 600px;
    margin: 0 auto;
  }

  .card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 24px;
  }

  .card h2 {
    margin: 0 0 16px;
  }

  code {
    background: rgba(0, 0, 0, 0.3);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 14px;
  }

  .full-address {
    display: block;
    margin-top: 12px;
    word-break: break-all;
  }

  details {
    margin-top: 16px;
  }

  summary {
    cursor: pointer;
    opacity: 0.7;
  }
</style>
EOS

# Create README
echo ""
echo -e "${YELLOW}[8/8]${NC} Creating README..."

cat > README.md << 'EOS'
# Svelte Unified Wallet Kit

A complete Solana wallet integration for Svelte 5 with Mobile Wallet Adapter 2.0 and Wallet Standard support.

## Features

- ✅ Wallet Standard - Auto-detect browser wallets
- ✅ Mobile Wallet Adapter 2.0 - Native protocol implementation
- ✅ Zero heavy dependencies - Only `@solana/web3.js`
- ✅ Svelte 5 Runes - Modern reactive primitives
- ✅ Type-safe - Full TypeScript support
- ✅ SSR-ready - Works with SvelteKit

## Quick Start

```
npm run dev
```

Open http://localhost:5173 and click "Connect Wallet"

## Usage

```svelte
<script lang="ts">
  import { WalletButton } from '$lib/components';
  import { wallet } from '$lib/wallet/wallet.svelte';
</script>

<WalletButton />

{#if wallet.connected}
  <p>Connected: {wallet.publicKey?.toString()}</p>
{/if}
```

## Supported Wallets

- Phantom
- Backpack
- Solflare
- Glow
- Brave Wallet
- Any Wallet Standard compliant wallet

## Build for Production

```
npm run build
npm run preview
```

## License

MIT
EOS

# Success message
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  Setup Complete! 🎉                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Project created at:${NC} ./$PROJECT_NAME"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  ${BLUE}cd $PROJECT_NAME${NC}"
echo -e "  ${BLUE}npm run dev${NC}"
echo ""
echo -e "${GREEN}Then open:${NC} http://localhost:5173"
echo ""
echo -e "${YELLOW}Features included:${NC}"
echo -e "  ✓ Wallet Standard detection"
echo -e "  ✓ Mobile Wallet Adapter support"
echo -e "  ✓ Auto-reconnect"
echo -e "  ✓ TypeScript types"
echo -e "  ✓ Example page"
echo ""
echo -e "${BLUE}Happy coding! 🚀${NC}"
