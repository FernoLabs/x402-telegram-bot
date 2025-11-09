import { browser } from '$app/environment';

import type { PaymentHistoryEntry } from '$lib/types';

export interface PaymentAcceptOption {
	scheme?: string;
	networkId?: string;
	currencyCode?: string;
	amount?: number;
	recipient?: string;
	memo?: string;
	assetAddress?: string;
	assetType?: string;
}

export interface PaymentRequestData {
	amount?: number;
	maxAmountRequired?: number;
	currency?: string;
	currencyCode?: string;
	recipient?: string;
	paymentAddress?: string;
	network?: string;
	networkId?: string;
	instructions?: string;
	description?: string;
	resource?: string;
	expiresAt?: string;
	memo?: string;
	groupName?: string;
	accepts?: PaymentAcceptOption[];
	assetAddress?: string;
	assetType?: string;
	paymentId?: string;
	nonce?: string;
	checkout?: string;
	facilitator?: string;
}

export interface PendingPaymentRequest extends PaymentRequestData {
	internalId: string;
	createdAt: number;
}

export interface StoredPendingPaymentRecord {
	request: PendingPaymentRequest;
	signature?: string;
	transaction?: string | null;
	submitted?: boolean;
}

export const PENDING_PAYMENTS_STORAGE_KEY = 'pending-payments';
const LEGACY_STORAGE_KEYS = ['x402:pending-payments'];

export const DEFAULT_FACILITATOR_URL = 'https://facilitator.payai.network/pay';

function readRawStorageValue(key: string): unknown {
	if (!browser) {
		return null;
	}

	const raw = localStorage.getItem(key);
	if (!raw) {
		return null;
	}

	try {
		return JSON.parse(raw) as unknown;
	} catch (error) {
		console.warn('Failed to parse pending payments from storage', error);
		return null;
	}
}

function writeStorageValue(key: string, value: unknown): void {
	if (!browser) {
		return;
	}

	if (value === null) {
		localStorage.removeItem(key);
		return;
	}

	localStorage.setItem(key, JSON.stringify(value));
}

function normalizeRecord(entry: unknown): StoredPendingPaymentRecord | null {
	if (!entry || typeof entry !== 'object') {
		return null;
	}

	const candidate = entry as Partial<StoredPendingPaymentRecord> & {
		request?: Partial<PendingPaymentRequest>;
	};

	if (!candidate.request || typeof candidate.request !== 'object') {
		return null;
	}

	const requestCandidate = candidate.request as Partial<PendingPaymentRequest>;
	const internalId =
		typeof requestCandidate.internalId === 'string' && requestCandidate.internalId.trim()
			? requestCandidate.internalId.trim()
			: typeof requestCandidate.paymentId === 'string' && requestCandidate.paymentId.trim()
				? requestCandidate.paymentId.trim()
				: null;

	if (!internalId) {
		return null;
	}

	const createdAtRaw = requestCandidate.createdAt;
	const createdAt =
		typeof createdAtRaw === 'number' && Number.isFinite(createdAtRaw) ? createdAtRaw : Date.now();

	const normalizedRequest: PendingPaymentRequest = {
		...requestCandidate,
		internalId,
		createdAt
	};

	return {
		request: normalizedRequest,
		signature:
			typeof candidate.signature === 'string' && candidate.signature.trim()
				? candidate.signature.trim()
				: undefined,
		transaction:
			typeof candidate.transaction === 'string' && candidate.transaction.trim()
				? candidate.transaction.trim()
				: null,
		submitted: Boolean(candidate.submitted)
	};
}

export function loadStoredPendingPayments(): StoredPendingPaymentRecord[] {
	const raw = readRawStorageValue(PENDING_PAYMENTS_STORAGE_KEY);
	let entries: unknown[] | null = Array.isArray(raw) ? raw : null;

	if (!entries || entries.length === 0) {
		for (const legacyKey of LEGACY_STORAGE_KEYS) {
			const legacy = readRawStorageValue(legacyKey);
			if (Array.isArray(legacy) && legacy.length > 0) {
				entries = legacy;
				break;
			}
		}
	}

	if (!entries) {
		return [];
	}

	return entries
		.map((entry) => normalizeRecord(entry))
		.filter((entry): entry is StoredPendingPaymentRecord => entry !== null);
}

export function persistPendingPayments(records: StoredPendingPaymentRecord[]): void {
	if (records.length === 0) {
		writeStorageValue(PENDING_PAYMENTS_STORAGE_KEY, null);
		for (const legacyKey of LEGACY_STORAGE_KEYS) {
			writeStorageValue(legacyKey, null);
		}
		return;
	}

	writeStorageValue(PENDING_PAYMENTS_STORAGE_KEY, records);
	for (const legacyKey of LEGACY_STORAGE_KEYS) {
		writeStorageValue(legacyKey, null);
	}
}

export function buildPendingPaymentFromRecord(record: PaymentHistoryEntry): PendingPaymentRequest {
	const createdAt = Date.parse(record.request.createdAt);
	const base: PendingPaymentRequest = {
		internalId: record.request.paymentId,
		createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
		amount: record.request.amount,
		currency: record.request.currency,
		currencyCode: record.request.currency,
		paymentAddress: record.request.recipient,
		paymentId: record.request.paymentId,
		recipient: record.request.recipient,
		network: record.request.network,
		networkId: record.request.network,
		memo: record.request.memo ?? undefined,
		instructions: record.request.instructions ?? undefined,
		description: record.request.description ?? undefined,
		assetAddress: record.request.assetAddress ?? undefined,
		assetType: record.request.assetType ?? undefined,
		expiresAt: record.request.expiresAt,
		resource: record.request.resource ?? undefined,
		maxAmountRequired: record.request.amount,
		nonce: record.request.nonce,
		checkout: record.request.checkoutUrl ?? undefined,
		facilitator: record.request.facilitatorUrl ?? undefined,
		accepts: record.request.instructions
			? undefined
			: [
					{
						scheme: 'onchain-transfer',
						networkId: record.request.network,
						currencyCode: record.request.currency,
						amount: record.request.amount,
						recipient: record.request.recipient,
						memo: record.request.memo ?? undefined,
						assetAddress: record.request.assetAddress ?? undefined,
						assetType: record.request.assetType ?? undefined
					}
				]
	};

	return base;
}
