import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_SOLANA_RPC_URL, fetchMintDecimals, normalizeCommitment } from '$lib/server/solana';

export const GET: RequestHandler = async ({ params, platform }) => {
  const mintAddress = params.mint?.trim();

  if (!mintAddress) {
    return json({ error: 'Mint address is required.' }, { status: 400 });
  }

  try {
    const env = platform?.env as { SOLANA_RPC_URL?: string; SOLANA_COMMITMENT?: string } | undefined;
    const rpcUrl = env?.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;
    const commitment = normalizeCommitment(env?.SOLANA_COMMITMENT);

    const decimals = await fetchMintDecimals(mintAddress, { rpcUrl, commitment });

    if (typeof decimals !== 'number') {
      return json({ error: 'Failed to fetch mint metadata from Solana RPC.' }, { status: 502 });
    }

    return json({ mint: mintAddress, decimals });
  } catch (error) {
    console.error('Failed to fetch Solana mint metadata', error);
    return json({ error: 'Failed to load mint metadata.' }, { status: 500 });
  }
};
