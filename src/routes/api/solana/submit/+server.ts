import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_SOLANA_RPC_URL, normalizeCommitment, submitSignedTransaction } from '$lib/server/solana';

interface SubmitRequestBody {
  transaction?: string;
  skipPreflight?: boolean;
  maxRetries?: number;
}

export const POST: RequestHandler = async ({ request, platform }) => {
  try {
    const body = (await request.json()) as SubmitRequestBody;
    const serialized = typeof body.transaction === 'string' ? body.transaction.trim() : '';

    if (!serialized) {
      return json({ error: 'Serialized transaction is required.' }, { status: 400 });
    }

    const env = platform?.env as { SOLANA_RPC_URL?: string; SOLANA_COMMITMENT?: string } | undefined;
    const rpcUrl = env?.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;
    const commitment = normalizeCommitment(env?.SOLANA_COMMITMENT);

    const signature = await submitSignedTransaction(serialized, {
      rpcUrl,
      commitment,
      skipPreflight: body.skipPreflight,
      maxRetries: body.maxRetries
    });

    if (!signature) {
      return json({ error: 'Failed to submit transaction to Solana RPC.' }, { status: 502 });
    }

    return json({ signature });
  } catch (error) {
    console.error('Failed to submit Solana transaction', error);
    return json({ error: 'Failed to submit Solana transaction.' }, { status: 500 });
  }
};
