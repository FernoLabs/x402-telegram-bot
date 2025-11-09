export const DEFAULT_PUBLIC_SOLANA_RPC = '/api/solana/rpc';

export const PUBLIC_SOLANA_RPC_ENDPOINT =
	(import.meta.env.VITE_PUBLIC_SOLANA_RPC as string | undefined)?.trim() ||
	DEFAULT_PUBLIC_SOLANA_RPC;
