export const DEFAULT_PUBLIC_SOLANA_RPC = 'https://jenifer-6iwpyb-fast-mainnet.helius-rpc.com';

export const PUBLIC_SOLANA_RPC_ENDPOINT =
  (import.meta.env.VITE_PUBLIC_SOLANA_RPC as string | undefined)?.trim() || DEFAULT_PUBLIC_SOLANA_RPC;
