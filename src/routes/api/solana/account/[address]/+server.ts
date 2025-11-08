import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_SOLANA_RPC_URL, fetchAccountExists, normalizeCommitment } from '$lib/server/solana';

export const GET: RequestHandler = async ({ params, platform }) => {
  const address = params.address?.trim();

  if (!address) {
    return json({ error: 'Account address is required.' }, { status: 400 });
  }

  try {
    const env = platform?.env as { SOLANA_RPC_URL?: string; SOLANA_COMMITMENT?: string } | undefined;
    const rpcUrl = env?.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;
    const commitment = normalizeCommitment(env?.SOLANA_COMMITMENT);

    const exists = await fetchAccountExists(address, { rpcUrl, commitment });

    return json({ address, exists });
  } catch (error) {
    console.error('Failed to fetch Solana account info', error);
    return json({ error: 'Failed to fetch account info.' }, { status: 500 });
  }
};
