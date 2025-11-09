import type { PaymentDetails } from '$lib/types';
import {
        createSolanaRpc,
        getBase64Encoder,
        getTransactionDecoder,
        signature as toSignature
} from '@solana/kit';
import * as ed25519 from '@noble/ed25519';
import bs58 from 'bs58';

interface RpcTokenAmount {
	amount: string;
	decimals: number;
	uiAmount: number | null;
	uiAmountString?: string;
}

interface RpcTokenBalance {
	accountIndex: number;
	mint: string;
	owner?: string;
	uiTokenAmount: RpcTokenAmount;
}

interface RpcAccountKey {
	pubkey: string;
	signer: boolean;
	writable: boolean;
}

interface RpcInstruction {
	program: string;
	programId: string;
	accounts?: string[];
	parsed?: { type: string; info: Record<string, unknown> };
}

interface RpcTransactionMessage {
	accountKeys: RpcAccountKey[];
	instructions: RpcInstruction[];
}

interface RpcTransaction {
	message: RpcTransactionMessage;
	signatures: string[];
}

interface RpcTransactionMeta {
	err: unknown | null;
	status?: { Ok: unknown } | { Err: unknown };
	preBalances: number[];
	postBalances: number[];
	preTokenBalances?: RpcTokenBalance[];
	postTokenBalances?: RpcTokenBalance[];
}

interface RpcGetTransactionResult {
	slot: number;
	meta: RpcTransactionMeta | null;
	transaction: RpcTransaction;
	blockTime: number | null;
}

export type SolanaCommitment = 'processed' | 'confirmed' | 'finalized';

interface VerifySolanaPaymentOptions {
	signature: string;
	rpcUrl?: string;
	recipient: string;
	minAmount: number;
	expectedCurrency?: string | null;
	tokenMintAddress?: string | null;
	commitment?: SolanaCommitment;
}

interface VerifiedPaymentDetails extends PaymentDetails {
	slot: number;
	blockTime: number | null;
}

interface VerifyWireTransactionSignatureOptions {
	wireTransaction: string;
	expectedSignature?: string | null;
	expectedSigner?: string | null;
}

export interface VerifiedWireTransactionSignature {
	signers: string[];
	signature: string | null;
}

export async function verifyWireTransactionSignature(
	options: VerifyWireTransactionSignatureOptions
): Promise<VerifiedWireTransactionSignature | null> {
	try {
                const wireBytes = getBase64Encoder().encode(options.wireTransaction);
		const decoder = getTransactionDecoder();
		const decoded = decoder.decode(wireBytes);
		const messageBytes = Uint8Array.from(decoded.messageBytes);
		const signers: string[] = [];
		let matchedSignature: string | null = null;

		for (const [address, signatureBytes] of Object.entries(decoded.signatures)) {
			if (!signatureBytes) {
				continue;
			}

			const signatureBase58 = bs58.encode(signatureBytes);
			const publicKeyBytes = bs58.decode(address);
			const isValid = await ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);

			if (!isValid) {
				return null;
			}

			signers.push(address);

			if (!matchedSignature) {
				matchedSignature = signatureBase58;
			}

			if (options.expectedSignature && signatureBase58 !== options.expectedSignature) {
				continue;
			}

			matchedSignature = signatureBase58;
		}

		if (signers.length === 0) {
			return null;
		}

		if (options.expectedSigner && !signers.includes(options.expectedSigner)) {
			return null;
		}

		if (options.expectedSignature && matchedSignature !== options.expectedSignature) {
			return null;
		}

		return {
			signers,
			signature: matchedSignature
		};
	} catch (error) {
		console.warn('Failed to verify provided Solana transaction', error);
		return null;
	}
}

export const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const DEFAULT_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const LAMPORTS_PER_SOL = 1_000_000_000;
const EPSILON = 1e-7;

export function normalizeCommitment(value: string | null | undefined): SolanaCommitment {
	if (value === 'processed' || value === 'finalized') {
		return value;
	}
	return 'confirmed';
}

function parseUiTokenAmount(amount: RpcTokenAmount | undefined): number {
	if (!amount) {
		return 0;
	}

	if (typeof amount.uiAmount === 'number' && Number.isFinite(amount.uiAmount)) {
		return amount.uiAmount;
	}

	if (typeof amount.uiAmountString === 'string' && amount.uiAmountString.trim()) {
		const parsed = Number.parseFloat(amount.uiAmountString);
		if (!Number.isNaN(parsed)) {
			return parsed;
		}
	}

	const raw = Number.parseFloat(amount.amount ?? '0');
	const decimals = typeof amount.decimals === 'number' ? amount.decimals : 0;
	if (Number.isNaN(raw) || decimals < 0) {
		return 0;
	}

	return raw / Math.pow(10, decimals);
}

function accumulateTokenDeltas(
	preBalances: RpcTokenBalance[] | undefined,
	postBalances: RpcTokenBalance[] | undefined,
	accountKeys: RpcAccountKey[]
): Map<string, number> {
	const deltas = new Map<string, number>();
	const preByIndex = new Map<number, RpcTokenBalance>();
	const postByIndex = new Map<number, RpcTokenBalance>();

	for (const balance of preBalances ?? []) {
		preByIndex.set(balance.accountIndex, balance);
	}

	for (const balance of postBalances ?? []) {
		postByIndex.set(balance.accountIndex, balance);
	}

	const indices = new Set<number>([
		...Array.from(preByIndex.keys()),
		...Array.from(postByIndex.keys())
	]);

	for (const index of indices) {
		const pre = preByIndex.get(index);
		const post = postByIndex.get(index);
		const owner = post?.owner ?? pre?.owner ?? accountKeys[index]?.pubkey ?? null;
		if (!owner) {
			continue;
		}

		const preAmount = parseUiTokenAmount(pre?.uiTokenAmount);
		const postAmount = parseUiTokenAmount(post?.uiTokenAmount);
		const delta = postAmount - preAmount;

		if (Math.abs(delta) > EPSILON) {
			deltas.set(owner, (deltas.get(owner) ?? 0) + delta);
		}
	}

	return deltas;
}

function accumulateSolDeltas(
	meta: RpcTransactionMeta,
	accountKeys: RpcAccountKey[]
): Map<string, number> {
	const deltas = new Map<string, number>();
	const { preBalances, postBalances } = meta;

	for (let i = 0; i < postBalances.length; i += 1) {
		const post = postBalances[i] ?? 0;
		const pre = preBalances[i] ?? 0;
		const changeLamports = post - pre;
		if (changeLamports === 0) {
			continue;
		}
		const owner = accountKeys[i]?.pubkey;
		if (!owner) {
			continue;
		}
		const deltaSol = changeLamports / LAMPORTS_PER_SOL;
		if (Math.abs(deltaSol) > EPSILON) {
			deltas.set(owner, (deltas.get(owner) ?? 0) + deltaSol);
		}
	}

	return deltas;
}

function resolveSender(
	deltas: Map<string, number>,
	recipient: string,
	fallbackSigner: string | null
): string | null {
	let sender: string | null = null;
	let minValue = 0;

	for (const [owner, delta] of deltas.entries()) {
		if (owner === recipient) {
			continue;
		}
		if (delta < minValue) {
			minValue = delta;
			sender = owner;
		}
	}

	if (sender) {
		return sender;
	}

	return fallbackSigner;
}

async function fetchTransaction(
	signature: string,
	rpcUrl: string,
	commitment: 'processed' | 'confirmed' | 'finalized'
): Promise<RpcGetTransactionResult | null> {
        try {
                const rpc = createSolanaRpc(rpcUrl);
                const rpcSignature = toSignature(signature);
                const result = await rpc
                        .getTransaction(rpcSignature, {
                                commitment,
                                encoding: 'jsonParsed',
                                maxSupportedTransactionVersion: 0
                        })
                        .send();

                if (!result) {
                        return null;
                }

                const blockTime =
                        result.blockTime === null
                                ? null
                                : typeof result.blockTime === 'bigint'
                                        ? Number(result.blockTime)
                                        : result.blockTime;

                return {
                        blockTime,
                        slot: typeof result.slot === 'bigint' ? Number(result.slot) : result.slot,
                        meta: result.meta as unknown as RpcTransactionMeta | null,
                        transaction: result.transaction as unknown as RpcTransaction
                } satisfies RpcGetTransactionResult;
        } catch (error) {
                console.warn('Failed to fetch Solana transaction', error);
                return null;
        }
}

export async function verifySolanaPayment(
	options: VerifySolanaPaymentOptions
): Promise<VerifiedPaymentDetails | null> {
	const rpcUrl = options.rpcUrl ?? DEFAULT_SOLANA_RPC_URL;
	const commitment = options.commitment ?? 'confirmed';
	const result = await fetchTransaction(options.signature, rpcUrl, commitment);

	if (!result?.meta || result.meta.err) {
		return null;
	}

	const { transaction, meta } = result;
	const accountKeys = transaction.message.accountKeys ?? [];
	const expectedCurrency = options.expectedCurrency ?? 'USDC';
	const normalizedCurrency = expectedCurrency.toUpperCase();
	let amountReceived = 0;
	let sender: string | null = null;
	let currency = normalizedCurrency;

	if (normalizedCurrency === 'SOL') {
		const solDeltas = accumulateSolDeltas(meta, accountKeys);
		const recipientDelta = solDeltas.get(options.recipient) ?? 0;
		if (recipientDelta + EPSILON < options.minAmount) {
			return null;
		}
		amountReceived = recipientDelta;
		sender = resolveSender(
			solDeltas,
			options.recipient,
			accountKeys.find((key) => key.signer)?.pubkey ?? null
		);
		currency = 'SOL';
	} else {
		const mint = options.tokenMintAddress ?? DEFAULT_USDC_MINT;
		const tokenDeltas = accumulateTokenDeltas(
			meta.preTokenBalances?.filter((balance) => balance.mint === mint),
			meta.postTokenBalances?.filter((balance) => balance.mint === mint),
			accountKeys
		);

		const recipientDelta = tokenDeltas.get(options.recipient) ?? 0;
		if (recipientDelta + EPSILON < options.minAmount) {
			return null;
		}

		amountReceived = recipientDelta;
		sender = resolveSender(
			tokenDeltas,
			options.recipient,
			accountKeys.find((key) => key.signer)?.pubkey ?? null
		);
		currency = normalizedCurrency;
	}

	if (!sender) {
		sender = accountKeys.find((key) => key.signer)?.pubkey ?? null;
	}

	if (!sender) {
		return null;
	}

	return {
		amount: amountReceived,
		sender,
		txHash: options.signature,
		currency,
		network: 'solana',
		slot: result.slot,
		blockTime: result.blockTime
	};
}
