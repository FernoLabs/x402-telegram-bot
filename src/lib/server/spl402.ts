import type { PaymentDetails } from '$lib/types';
import { isAddress } from '@solana/addresses';
import { verifySolanaPayment, type SolanaCommitment } from './solana';

export const SPL402_VERSION = 1;
export type Spl402PaymentScheme = 'transfer' | 'token-transfer';

export interface Spl402TransferPayload {
        from: string;
        to: string;
        amount: number;
        signature: string;
        timestamp: number;
}

export interface Spl402TokenTransferPayload extends Spl402TransferPayload {
        mint: string;
}

export interface Spl402PaymentPayload {
        spl402Version: number;
        scheme: Spl402PaymentScheme;
        network: string;
        payload: Spl402TransferPayload | Spl402TokenTransferPayload;
}

export interface Spl402PaymentRequirement {
        amount: number;
        recipient: string;
        network: string;
        scheme: Spl402PaymentScheme;
        mint?: string;
}

const PAYMENT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const AMOUNT_TOLERANCE = 1e-6;

function isRecord(value: unknown): value is Record<string, unknown> {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
        }

        if (typeof value === 'string' && value.trim()) {
                const parsed = Number.parseFloat(value.trim());
                if (Number.isFinite(parsed)) {
                        return parsed;
                }
        }

        return null;
}

function toString(value: unknown): string | null {
        if (typeof value === 'string' && value.trim()) {
                return value.trim();
        }

        return null;
}

function parseTransferPayload(value: unknown): Spl402TransferPayload | null {
        if (!isRecord(value)) {
                return null;
        }

        const from = toString(value.from);
        const to = toString(value.to);
        const signature = toString(value.signature);
        const amount = toNumber(value.amount);
        const timestamp = toNumber(value.timestamp);

        if (!from || !to || !signature || amount === null || timestamp === null) {
                return null;
        }

        return { from, to, signature, amount, timestamp };
}

function parseTokenTransferPayload(value: unknown): Spl402TokenTransferPayload | null {
        const base = parseTransferPayload(value);
        if (!base || !isRecord(value)) {
                return null;
        }

        const mint = toString(value.mint);
        if (!mint) {
                return null;
        }

        return { ...base, mint };
}

export function parseSpl402Payment(value: unknown): Spl402PaymentPayload | null {
        if (!isRecord(value)) {
                return null;
        }

        const spl402Version = toNumber(value.spl402Version);
        const scheme = toString(value.scheme) as Spl402PaymentScheme | null;
        const network = toString(value.network);
        const payloadValue = value.payload;

        if (spl402Version === null || !scheme || !network || !payloadValue) {
                return null;
        }

        if (spl402Version !== SPL402_VERSION) {
                return null;
        }

        if (scheme !== 'transfer' && scheme !== 'token-transfer') {
                return null;
        }

        const payload =
                scheme === 'token-transfer'
                        ? parseTokenTransferPayload(payloadValue)
                        : parseTransferPayload(payloadValue);

        if (!payload) {
                return null;
        }

        return {
                spl402Version,
                scheme,
                network,
                payload
        };
}

export interface VerifySpl402PaymentOptions {
        payment: Spl402PaymentPayload;
        expectedRecipient: string;
        expectedAmount: number;
        expectedCurrency: string;
        expectedNetwork: string;
        solana?: {
                rpcUrl?: string;
                tokenMintAddress?: string | null;
                commitment?: SolanaCommitment;
        };
}

function normalizeSolanaCluster(value: string | null | undefined): string | null {
        if (!value) {
                return null;
        }

        const normalized = value.trim().toLowerCase();

        if (!normalized) {
                return null;
        }

        switch (normalized) {
                case 'mainnet-beta':
                case 'solana-mainnet':
                case 'solana-mainnet-beta':
                case 'solana':
                case 'solana:mainnet':
                        return 'mainnet-beta';
                case 'devnet':
                case 'solana-devnet':
                case 'solana:devnet':
                        return 'devnet';
                case 'testnet':
                case 'solana-testnet':
                case 'solana:testnet':
                        return 'testnet';
                default:
                        return normalized;
        }
}

export function buildSpl402Requirement(
        amount: number,
        recipient: string,
        network: string,
        scheme: Spl402PaymentScheme,
        mint?: string | null
): Spl402PaymentRequirement {
        const normalizedMint = mint && mint.trim() ? mint.trim() : undefined;
        const normalizedNetwork = normalizeSolanaCluster(network) ?? network;
        return {
                amount,
                recipient,
                network: normalizedNetwork,
                scheme,
                mint: normalizedMint
        };
}

export async function verifySpl402Payment(
        options: VerifySpl402PaymentOptions
): Promise<PaymentDetails | null> {
        const { payment, expectedRecipient, expectedAmount, expectedCurrency, expectedNetwork } = options;

        const cluster = normalizeSolanaCluster(payment.network);
        const expectedCluster = normalizeSolanaCluster(expectedNetwork);

        if (!cluster || !expectedCluster || cluster !== expectedCluster) {
                return null;
        }

        const payload = payment.payload;
        const timestamp = payload.timestamp;
        if (!Number.isFinite(timestamp)) {
                return null;
        }

        const now = Date.now();
        if (Math.abs(now - timestamp) > PAYMENT_TIMESTAMP_TOLERANCE_MS) {
                return null;
        }

        if (!isAddress(payload.from) || !isAddress(payload.to)) {
                return null;
        }

        if (payload.to !== expectedRecipient) {
                return null;
        }

        let tokenMint: string | null = null;
        if (payment.scheme === 'token-transfer') {
                const tokenPayload = payload as Spl402TokenTransferPayload;
                const mintAddress = tokenPayload.mint;
                if (!isAddress(mintAddress)) {
                        return null;
                }

                const expectedMint = options.solana?.tokenMintAddress ?? null;
                if (expectedMint && expectedMint !== mintAddress) {
                        return null;
                }

                tokenMint = expectedMint ?? mintAddress;
        } else {
                if (expectedCurrency.toUpperCase() !== 'SOL') {
                        return null;
                }
        }

        const verification = await verifySolanaPayment({
                signature: payload.signature,
                rpcUrl: options.solana?.rpcUrl,
                recipient: expectedRecipient,
                minAmount: expectedAmount,
                expectedCurrency,
                tokenMintAddress: tokenMint,
                commitment: options.solana?.commitment ?? 'confirmed'
        });

        if (!verification) {
                return null;
        }

        if (verification.sender !== payload.from) {
                return null;
        }

        if (Math.abs(verification.amount - payload.amount) > AMOUNT_TOLERANCE) {
                return null;
        }

        return {
                amount: verification.amount,
                sender: verification.sender,
                txHash: verification.txHash,
                currency: verification.currency,
                network: verification.network
        };
}
