import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_SOLANA_RPC_URL, fetchLatestBlockhash, normalizeCommitment } from '$lib/server/solana';

export const GET: RequestHandler = async ({ platform }) => {
  try {
    const env = platform?.env as { SOLANA_RPC_URL?: string; SOLANA_COMMITMENT?: string } | undefined;
    const rpcUrl = env?.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;
    const commitment = normalizeCommitment(env?.SOLANA_COMMITMENT);

    const result = await fetchLatestBlockhash({ rpcUrl, commitment });

    if (!result) {
      return json({ error: 'Failed to fetch latest blockhash from Solana RPC.' }, { status: 502 });
    }

    return json(result);
  } catch (error) {
    console.error('Failed to fetch latest Solana blockhash', error);
    return json({ error: 'Failed to fetch Solana blockhash.' }, { status: 500 });
  }
};
