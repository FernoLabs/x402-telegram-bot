import { signature as toSignature, type Signature } from '@solana/kit';
import type { createSolanaRpc } from '@solana/kit';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

export interface WaitForTransactionConfirmationConfig {
	commitment?: 'processed' | 'confirmed' | 'finalized';
	latestBlockhash: {
		blockhash: string;
		lastValidBlockHeight: bigint;
	};
	pollIntervalMs?: number;
	rpc: ReturnType<typeof createSolanaRpc>;
	signature: string | Signature;
	timeoutMs?: number;
}

const wait = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

export async function waitForTransactionConfirmation({
	commitment = 'confirmed',
	latestBlockhash,
	pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
	rpc,
	signature,
	timeoutMs = DEFAULT_TIMEOUT_MS
}: WaitForTransactionConfirmationConfig): Promise<void> {
	const desiredStatus = commitment === 'finalized' ? 'finalized' : 'confirmed';
	const normalizedSignature = typeof signature === 'string' ? toSignature(signature) : signature;
	const deadline = Date.now() + timeoutMs;

	while (true) {
		if (Date.now() > deadline) {
			throw new Error('Timed out while waiting for transaction confirmation.');
		}

		const statusResponse = await rpc
			.getSignatureStatuses([normalizedSignature], { searchTransactionHistory: false })
			.send();
		const status = statusResponse.value[0];

		if (status?.err) {
			throw new Error('The transaction failed to confirm.');
		}

		const confirmationStatus = status?.confirmationStatus ?? null;
		if (confirmationStatus === 'finalized' || confirmationStatus === desiredStatus) {
			return;
		}

		const currentBlockHeight = await rpc.getBlockHeight().send();
		if (currentBlockHeight > latestBlockhash.lastValidBlockHeight) {
			throw new Error('The transaction expired before confirmation.');
		}

		await wait(pollIntervalMs);
	}
}
