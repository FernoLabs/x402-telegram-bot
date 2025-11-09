import { browser } from '$app/environment';
import type { StandardWallet } from './types';

type NavigatorWithWallets = Navigator & {
  wallets?: {
    get: () => StandardWallet[] | Promise<StandardWallet[]>;
  };
};

type LegacySolana = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  connect?: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toBase58: () => string } }>;
  disconnect?: () => Promise<void>;
  signTransaction?: (transaction: unknown) => Promise<unknown>;
  signAllTransactions?: (transactions: unknown[]) => Promise<unknown[]>;
};

const FALLBACK_ICON =
  'data:image/svg+xml;base64,' +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="12" fill="#111827"/><path d="M16 18h16v-2H16v2Zm0 7h16v-2H16v2Zm0 7h16v-2H16v2Z" fill="white"/></svg>`
  );

export async function getStandardWallets(): Promise<StandardWallet[]> {
  if (!browser) {
    return [];
  }

  const detected: StandardWallet[] = [];
  const nav = navigator as NavigatorWithWallets;
  const result = await nav.wallets?.get?.();

  if (Array.isArray(result)) {
    detected.push(
      ...result.filter((wallet) => wallet.name && wallet.name.toLowerCase().includes('phantom'))
    );
  }

  const legacy = (globalThis as unknown as { solana?: LegacySolana }).solana;
  if (legacy?.isPhantom && legacy.connect && legacy.disconnect) {
    const name = 'Phantom';
    const wallet: StandardWallet = {
      name,
      icon: FALLBACK_ICON,
      features: {
        'standard:connect': {
          async connect() {
            const connect = legacy.connect!;
            const response = await connect({ onlyIfTrusted: false });
            return {
              accounts: [
                {
                  publicKey: response.publicKey.toBase58(),
                  label: name,
                  chains: ['solana:mainnet']
                }
              ]
            };
          }
        },
        'standard:disconnect': {
          async disconnect() {
            await legacy.disconnect?.();
          }
        },
        'solana:signTransaction': legacy.signTransaction
          ? {
              signTransaction: async (transaction: unknown) => legacy.signTransaction?.(transaction) ?? transaction
            }
          : undefined,
        'solana:signTransactions': legacy.signAllTransactions
          ? {
              signTransactions: async (transactions: unknown[]) => legacy.signAllTransactions?.(transactions) ?? transactions
            }
          : undefined
      }
    } as unknown as StandardWallet;

    detected.push(wallet);
  }

  return detected;
}
