<script lang="ts">
        import { browser } from '$app/environment';
        import { onDestroy } from 'svelte';
        import {
                address,
                appendTransactionMessageInstructions,
                compileTransaction,
                createNoopSigner,
                createSolanaRpc,
                createTransactionMessage,
                lamports,
                pipe,
                setTransactionMessageFeePayer,
                setTransactionMessageLifetimeUsingBlockhash,
                type Address,
                type Instruction,
                type Transaction
        } from '@solana/kit';
	import {
		findAssociatedTokenPda,
		fetchMint,
		getCreateAssociatedTokenIdempotentInstruction,
		getTransferInstruction,
		TOKEN_PROGRAM_ADDRESS
	} from '@solana-program/token';
	import { getTransferSolInstruction } from '@solana-program/system';
	import { getAddMemoInstruction } from '@solana-program/memo';
        import type { Auction, Group, PaymentHistoryEntry } from '$lib/types';
	import { wallet } from '$lib/wallet/wallet.svelte';

        import {
                buildPendingPaymentFromRecord,
                DEFAULT_FACILITATOR_URL,
                loadStoredPendingPayments,
                persistPendingPayments,
                type PaymentRequestData,
                type PendingPaymentRequest,
                type StoredPendingPaymentRecord
        } from '$lib/payments/storage';

	export let data: {
		groups: Group[];
		loadError: boolean;
		preselectedGroupId: number | null;
	};

	const currencyFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});

	const activeGroups = data.groups.filter((group) => group.active);
	let selectedGroupId = (() => {
		if (data.preselectedGroupId !== null) {
			const match = activeGroups.find((group) => group.id === data.preselectedGroupId);
			if (match) {
				return String(match.id);
			}
		}
		return activeGroups.length > 0 ? String(activeGroups[0].id) : '';
	})();

	let message = '';
	let sender = '';
	let loading = false;
	let error: string | null = null;
	let successAuction: Auction | null = null;

        let pendingPayments: PendingPaymentRequest[] = [];
        let activePaymentId: string | null = null;
        let signatureInputs: Record<string, string> = {};
        let signatureErrors: Record<string, string | undefined> = {};
        let signatureSubmitted: Record<string, boolean> = {};
        let walletProcessing = false;
	let walletStatus: string | null = null;
	let walletError: string | null = null;
	let lastActivePaymentId: string | null = null;
	let walletConnected = false;
	let walletPublicKey: Address | null = null;
	let rpc: ReturnType<typeof createSolanaRpc> | null = null;
	let currentRpcEndpoint: string | null = null;
	let walletPaymentSupported = false;
	let canUseWallet = false;
        const formatUsd = (value: number) => currencyFormatter.format(value);
        const AUTO_REFRESH_INTERVAL_MS = 1000;

        let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
        let autoRefreshActive = false;

        let transactionRecords: Record<string, string | null> = {};
        let lastSyncedWallet: string | null = null;
        let lastPaymentSync = 0;
        let syncingPayments = false;

        function persistPendingPaymentState(): void {
                const records: StoredPendingPaymentRecord[] = pendingPayments.map((payment) => ({
                        request: payment,
                        signature: signatureInputs[payment.internalId]?.trim() || undefined,
                        transaction:
                                payment.internalId in transactionRecords
                                        ? transactionRecords[payment.internalId]
                                        : null,
                        submitted: signatureSubmitted[payment.internalId] ?? false
                }));

                persistPendingPayments(records);
        }

        function applyServerPayments(records: PaymentHistoryEntry[]): void {
                if (!Array.isArray(records) || records.length === 0) {
                        return;
                }

                let nextPending = [...pendingPayments];

                for (const entry of records) {
                        const paymentId = entry.request.paymentId;
                        if (!paymentId) {
                                continue;
                        }

                        const existingIndex = nextPending.findIndex(
                                (candidate) => candidate.internalId === paymentId
                        );

                        const reconstructed = buildPendingPaymentFromRecord(entry);

                        if (existingIndex >= 0) {
                                const existing = nextPending[existingIndex];
                                nextPending = nextPending.map((item, index) =>
                                        index === existingIndex
                                                ? {
                                                          ...item,
                                                          ...reconstructed,
                                                          internalId: item.internalId,
                                                          createdAt: item.createdAt
                                                  }
                                                : item
                                );
                        } else {
                                nextPending = [...nextPending, reconstructed];
                        }

                        if (entry.pending?.wireTransaction) {
                                transactionRecords = {
                                        ...transactionRecords,
                                        [paymentId]: entry.pending.wireTransaction
                                };
                        }

                        if (entry.pending?.signature) {
                                signatureInputs = {
                                        ...signatureInputs,
                                        [paymentId]: entry.pending.signature
                                };
                                signatureSubmitted = {
                                        ...signatureSubmitted,
                                        [paymentId]: entry.pending.status !== 'failed'
                                };
                        }

                        if (entry.pending?.status === 'failed') {
                                signatureErrors = {
                                        ...signatureErrors,
                                        [paymentId]:
                                                entry.pending.error ??
                                                'The backend could not submit this transaction. Try signing and sending again.'
                                };
                        } else if (
                                entry.request.status === 'confirmed' ||
                                entry.pending?.status === 'confirmed' ||
                                Boolean(entry.verification)
                        ) {
                                const { [paymentId]: _removed, ...restErrors } = signatureErrors;
                                signatureErrors = restErrors;
                        }
                }

                pendingPayments = nextPending
                        .slice()
                        .sort((a, b) => a.createdAt - b.createdAt);
                persistPendingPaymentState();
        }

        async function syncServerPayments(address: string, force = false): Promise<void> {
                if (!address) {
                        return;
                }

                const now = Date.now();
                if (!force && lastSyncedWallet === address && now - lastPaymentSync < 5000) {
                        return;
                }

                if (syncingPayments) {
                        return;
                }

                syncingPayments = true;
                lastSyncedWallet = address;
                lastPaymentSync = now;

                try {
                        const response = await fetch(`/api/payments?wallet=${encodeURIComponent(address)}`);
                        const payload = parseJson(await response.text());

                        if (!response.ok) {
                                const message =
                                        payload &&
                                        typeof payload === 'object' &&
                                        'error' in payload &&
                                        payload.error
                                                ? String((payload as { error?: unknown }).error)
                                                : 'Failed to sync payment history.';
                                console.warn(message);
                                return;
                        }

                        const records = Array.isArray((payload as { payments?: unknown }).payments)
                                ? ((payload as { payments: PaymentHistoryEntry[] }).payments ?? [])
                                : [];

                        applyServerPayments(records);
                } catch (error) {
                        console.warn('Failed to synchronize payment history', error);
                } finally {
                        syncingPayments = false;
                }
        }

        async function pollPendingPayments(): Promise<void> {
                if (walletPublicKey) {
                        await syncServerPayments(walletPublicKey, true);
                        return;
                }

                if (!activePaymentId) {
                        return;
                }

                const pendingRequest = pendingPayments.find((item) => item.internalId === activePaymentId) ?? null;
                if (!pendingRequest) {
                        return;
                }

                const signatureValue = signatureInputs[activePaymentId]?.trim() ?? '';
                if (!signatureValue) {
                        return;
                }

                const backendPaymentId =
                        typeof pendingRequest.paymentId === 'string' ? pendingRequest.paymentId.trim() : '';
                if (!backendPaymentId) {
                        return;
                }

                const storedTransaction = transactionRecords[activePaymentId] ?? null;

                try {
                        const submission = await submitPaymentToBackend({
                                paymentId: backendPaymentId,
                                signature: signatureValue,
                                wireTransaction: storedTransaction,
                                payer: walletPublicKey
                        });

                        if (submission.payment) {
                                applyServerPayments([submission.payment]);
                        }
                } catch (error) {
                        console.warn('Failed to poll pending payment status', error);
                }
        }

        if (browser) {
                const stored = loadStoredPendingPayments();
                if (stored.length > 0) {
                        const sorted = [...stored].sort(
                                (a, b) => a.request.createdAt - b.request.createdAt
                        );

                        pendingPayments = sorted.map((record) => record.request);
                        signatureInputs = sorted.reduce<Record<string, string>>((acc, record) => {
                                acc[record.request.internalId] = record.signature ?? '';
                                return acc;
                        }, {});
                        signatureSubmitted = sorted.reduce<Record<string, boolean>>((acc, record) => {
                                if (record.submitted) {
                                        acc[record.request.internalId] = true;
                                }
                                return acc;
                        }, {});
                        transactionRecords = sorted.reduce<Record<string, string | null>>(
                                (acc, record) => {
                                        if (typeof record.transaction === 'string') {
                                                acc[record.request.internalId] = record.transaction;
                                        }
                                        return acc;
                                },
                                {}
                        );

                        if (sorted[0]) {
                                activePaymentId = sorted[0].request.internalId;
                                lastActivePaymentId = activePaymentId;
                        }
                }
        }

	const formatAmountForCurrency = (value: number, currency: string): string => {
		const normalized = currency ? currency.toUpperCase() : '';
		if (normalized === 'USDC' || normalized === 'USD') {
			return formatUsd(value);
		}

		return value.toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 6
		});
	};

        const formatExpiration = (expiresAt: string): string | null => {
                const timestamp = Date.parse(expiresAt);
                if (Number.isNaN(timestamp)) {
                        return null;
                }

                return new Date(timestamp).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                });
        };

        const stopAutoRefresh = (): void => {
                if (autoRefreshTimer) {
                        clearInterval(autoRefreshTimer);
                        autoRefreshTimer = null;
                }
                autoRefreshActive = false;
        };

	function resetStatus(): void {
		error = null;
		successAuction = null;
	}

        const parseJson = (text: string): unknown => {
                if (!text) {
                        return null;
                }

		try {
			return JSON.parse(text);
		} catch (parseError) {
			console.warn('Failed to parse response payload', parseError);
			return null;
		}
	};

        async function fetchJsonOrThrow<T>(
                input: RequestInfo,
                fallbackMessage: string,
                init?: RequestInit
        ): Promise<T> {
		const response = await fetch(input, init);
		const text = await response.text();
		const payload = parseJson(text);

		if (!response.ok) {
			const message =
				payload && typeof payload === 'object' && payload !== null && 'error' in payload
					? String((payload as { error: unknown }).error)
					: fallbackMessage;
			throw new Error(message);
		}

		if (payload === null || (typeof payload !== 'object' && typeof payload !== 'string')) {
			throw new Error(fallbackMessage);
                }

                return payload as T;
        }

        interface PaymentSubmissionResult {
                payment: PaymentHistoryEntry | null;
                error: string | null;
                status: number;
        }

        async function submitPaymentToBackend(params: {
                paymentId: string;
                signature?: string | null;
                wireTransaction?: string | null;
                payer?: string | null;
        }): Promise<PaymentSubmissionResult> {
                const body: Record<string, unknown> = { paymentId: params.paymentId };

                if (params.signature && params.signature.trim()) {
                        body.signature = params.signature.trim();
                }

                if (params.wireTransaction && params.wireTransaction.trim()) {
                        body.wireTransaction = params.wireTransaction.trim();
                }

                if (params.payer && params.payer.trim()) {
                        body.payer = params.payer.trim();
                }

                const response = await fetch('/api/payments', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify(body)
                });

                const text = await response.text();
                const payload = parseJson(text);
                const paymentEntry =
                        payload && typeof payload === 'object' && 'payment' in payload
                                ? ((payload as { payment?: PaymentHistoryEntry | null }).payment ?? null)
                                : null;

                if (!response.ok) {
                        const message =
                                payload &&
                                typeof payload === 'object' &&
                                payload !== null &&
                                'error' in payload
                                        ? String((payload as { error?: unknown }).error ?? 'Failed to submit the transaction to the backend.')
                                        : 'Failed to submit the transaction to the backend.';

                        return { payment: paymentEntry, error: message, status: response.status };
                }

                if (!paymentEntry) {
                        return {
                                payment: null,
                                error: 'Unexpected response from the payment API.',
                                status: response.status
                        };
                }

                return { payment: paymentEntry, error: null, status: response.status };
        }

        const encodePaymentMetadata = (metadata: Record<string, unknown>): string => {
                const text = JSON.stringify(metadata);
                const base64 = btoa(text);
                return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        };

	const resolveStringField = (candidates: Array<string | undefined | null>): string | null => {
		for (const value of candidates) {
			if (typeof value === 'string') {
				const trimmed = value.trim();
				if (trimmed) {
					return trimmed;
				}
			}
		}
		return null;
	};

	const resolveAmount = (request: PaymentRequestData): number | null => {
		if (typeof request.maxAmountRequired === 'number' && !Number.isNaN(request.maxAmountRequired)) {
			return request.maxAmountRequired;
		}
		if (typeof request.amount === 'number' && !Number.isNaN(request.amount)) {
			return request.amount;
		}
		if (request.accepts) {
			for (const option of request.accepts) {
				if (typeof option.amount === 'number' && !Number.isNaN(option.amount)) {
					return option.amount;
				}
			}
		}
		return null;
	};

	const LAMPORT_DECIMALS = 9;

	const expandNumberToDecimalString = (value: number): string => {
		if (!Number.isFinite(value)) {
			throw new Error('Cannot convert a non-finite number to base units.');
		}

		const sign = value < 0 ? '-' : '';
		const absolute = Math.abs(value);
		if (absolute === 0) {
			return '0';
		}

		const raw = absolute.toString();
		if (!raw.includes('e') && !raw.includes('E')) {
			return sign ? `${sign}${raw}` : raw;
		}

		const [mantissa = '0', exponentPart = '0'] = raw.split(/e/i);
		const exponent = Number.parseInt(exponentPart, 10);
		if (!Number.isFinite(exponent)) {
			throw new Error('Cannot convert amount with malformed exponent.');
		}

		const [integerPartRaw, fractionalPartRaw = ''] = mantissa.split('.');
		const digits = `${integerPartRaw}${fractionalPartRaw}`.replace(/^0+(?=\d)/, '') || '0';
		let decimalIndex = integerPartRaw.length + exponent;

		if (decimalIndex <= 0) {
			const zeros = '0'.repeat(Math.abs(decimalIndex));
			return `${sign}0.${zeros}${digits}`;
		}

		if (decimalIndex >= digits.length) {
			const zeros = '0'.repeat(decimalIndex - digits.length);
			return `${sign}${digits}${zeros}`;
		}

		return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
	};

	const decimalToBaseUnits = (value: number, decimals: number): bigint => {
		if (!Number.isFinite(value) || value < 0) {
			throw new Error('Amounts must be non-negative finite numbers.');
		}
		if (!Number.isInteger(decimals) || decimals < 0) {
			throw new Error('Token decimals must be a non-negative integer.');
		}

		if (value === 0) {
			return 0n;
		}

		const decimalString = expandNumberToDecimalString(value);
		if (decimalString.startsWith('-')) {
			throw new Error('Amounts must be non-negative.');
		}

		const [integerPartRaw, fractionalPartRaw = ''] = decimalString.split('.');
		const factor = 10n ** BigInt(decimals);
		const integerComponent = integerPartRaw.length > 0 ? BigInt(integerPartRaw) : 0n;
		let baseUnits = integerComponent * factor;

		if (decimals === 0) {
			return baseUnits;
		}

		const digits = fractionalPartRaw.replace(/[^0-9]/g, '');
		const paddedDigits = `${digits}${'0'.repeat(decimals)}`.slice(0, decimals);
		if (paddedDigits.length > 0) {
			baseUnits += BigInt(paddedDigits);
		}

		const remainderDigits = digits.slice(decimals);
		if (remainderDigits.length > 0) {
			const remainderValue = BigInt(remainderDigits);
			const threshold = 5n * 10n ** BigInt(remainderDigits.length - 1);
			if (remainderValue >= threshold) {
				baseUnits += 1n;
			}
		}

		return baseUnits;
	};

	const resolveCurrency = (request: PaymentRequestData): string | null => {
		const direct = resolveStringField([request.currencyCode, request.currency]);
		if (direct) {
			return direct;
		}
		if (request.accepts) {
			for (const option of request.accepts) {
				const found = resolveStringField([option.currencyCode]);
				if (found) {
					return found;
				}
			}
		}
		return null;
	};

	const resolveRecipient = (request: PaymentRequestData): string | null => {
		const direct = resolveStringField([request.paymentAddress, request.recipient]);
		if (direct) {
			return direct;
		}
		if (request.accepts) {
			for (const option of request.accepts) {
				const found = resolveStringField([option.recipient]);
				if (found) {
					return found;
				}
			}
		}
		return null;
	};

	const resolveNetwork = (request: PaymentRequestData): string | null => {
		const direct = resolveStringField([request.networkId, request.network]);
		if (direct) {
			return direct;
		}
		if (request.accepts) {
			for (const option of request.accepts) {
				const found = resolveStringField([option.networkId]);
				if (found) {
					return found;
				}
			}
		}
		return null;
	};

	const resolveMemo = (request: PaymentRequestData): string | null => {
		const direct = resolveStringField([request.memo]);
		if (direct) {
			return direct;
		}
		if (request.accepts) {
			for (const option of request.accepts) {
				const found = resolveStringField([option.memo]);
				if (found) {
					return found;
				}
			}
		}
		return null;
	};

	const buildHostedCheckoutUrl = (request: PaymentRequestData): string | null => {
		const amount = resolveAmount(request);
		const recipient = resolveRecipient(request);

		if (amount === null || !recipient) {
			return null;
		}

		const currency = resolveCurrency(request) ?? 'USDC';
		const network = resolveNetwork(request) ?? 'Solana';
		const memo = resolveMemo(request);
		const checkout = resolveStringField([request.checkout]);
		const facilitator = resolveStringField([request.facilitator]) ?? DEFAULT_FACILITATOR_URL;
		const params = new URLSearchParams();

		params.set('amount', amount.toString());
		params.set('recipient', recipient);
		params.set('currency', currency);
		params.set('network', network);

		if (request.groupName) {
			params.set('group', request.groupName);
		}

		if (memo) {
			params.set('memo', memo);
		}

		if (request.paymentId) {
			params.set('paymentId', request.paymentId);
		}

		if (request.nonce) {
			params.set('nonce', request.nonce);
		}

		if (request.expiresAt) {
			params.set('expiresAt', request.expiresAt);
		}

		if (checkout) {
			params.set('checkout', checkout);
		}

		if (facilitator) {
			params.set('facilitator', facilitator);
		}

		return `/pay?${params.toString()}`;
	};

	const isSupportedWalletPayment = (request: PaymentRequestData | null): boolean => {
		if (!request) {
			return false;
		}

		const network = resolveNetwork(request)?.toLowerCase();
		if (network !== 'solana') {
			return false;
		}

		const currency = resolveCurrency(request)?.toUpperCase() ?? 'USDC';
		if (currency === 'SOL') {
			return true;
		}

		if ((currency === 'USDC' || currency === 'USD') && request.assetAddress) {
			return true;
		}

		return false;
	};

	const parseSelectedGroupId = (value: string): number | null => {
		if (!value) {
			return null;
		}

		const parsed = Number.parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	};

	const findSelectedGroup = (value: string): Group | null => {
		const parsedId = parseSelectedGroupId(value);

		if (parsedId === null) {
			return null;
		}

		return activeGroups.find((group) => group.id === parsedId) ?? null;
	};

	const generateInternalId = (request: PaymentRequestData): string => {
		if (request.paymentId && request.paymentId.trim()) {
			return request.paymentId;
		}
		if (request.nonce && request.nonce.trim()) {
			return request.nonce;
		}
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}
		return `payment-${Date.now()}-${Math.random()}`;
	};

	function addOrUpdatePendingPayment(request: PaymentRequestData): PendingPaymentRequest {
		const internalId = generateInternalId(request);
		const existingIndex = pendingPayments.findIndex((item) => item.internalId === internalId);
		const createdAt = existingIndex >= 0 ? pendingPayments[existingIndex].createdAt : Date.now();
		const normalized: PendingPaymentRequest = { ...request, internalId, createdAt };

		if (existingIndex >= 0) {
			pendingPayments = pendingPayments.map((item, index) =>
				index === existingIndex ? normalized : item
			);
		} else {
			pendingPayments = [...pendingPayments, normalized];
		}

                if (!activePaymentId || !pendingPayments.some((item) => item.internalId === activePaymentId)) {
                        activePaymentId = internalId;
                }

                persistPendingPaymentState();
                return normalized;
        }

        function removePendingPayment(id: string): void {
                pendingPayments = pendingPayments.filter((item) => item.internalId !== id);
                const { [id]: _removedSignature, ...restSignatures } = signatureInputs;
                signatureInputs = restSignatures;
                const { [id]: _removedError, ...restErrors } = signatureErrors;
                signatureErrors = restErrors;
                const { [id]: _removedSubmitted, ...restSubmitted } = signatureSubmitted;
                signatureSubmitted = restSubmitted;
                const { [id]: _removedTransaction, ...restTransactions } = transactionRecords;
                transactionRecords = restTransactions;
                if (pendingPayments.length === 0) {
                        activePaymentId = null;
                } else if (
                        !activePaymentId ||
                        !pendingPayments.some((item) => item.internalId === activePaymentId)
                ) {
                        activePaymentId = pendingPayments[0].internalId;
                }

                persistPendingPaymentState();
        }

        function clearPendingPayments(): void {
                pendingPayments = [];
                activePaymentId = null;
                signatureInputs = {};
                signatureErrors = {};
                signatureSubmitted = {};
                transactionRecords = {};
                stopAutoRefresh();
                persistPendingPaymentState();
        }

        function updateSignatureForActive(
                value: string,
                extras?: { transaction?: string | null; markSubmitted?: boolean }
        ): void {
                if (!activePaymentId) {
                        return;
                }
                signatureInputs = { ...signatureInputs, [activePaymentId]: value };
                const { [activePaymentId]: _removed, ...rest } = signatureErrors;
                signatureErrors = rest;
                const markSubmitted = extras?.markSubmitted ?? false;
                signatureSubmitted = { ...signatureSubmitted, [activePaymentId]: markSubmitted };

                if (extras && 'transaction' in extras) {
                        transactionRecords = {
                                ...transactionRecords,
                                [activePaymentId]: extras.transaction ?? null
                        };
                }

                persistPendingPaymentState();
        }

        async function requestPayment(): Promise<void> {
                if (loading) {
                        return;
                }

                const selectedGroup = findSelectedGroup(selectedGroupId);

                if (!selectedGroup) {
			error = 'Select a group before sending a message.';
			return;
		}

		const trimmedMessage = message.trim();

		if (!trimmedMessage) {
			error = 'Write the announcement you want the bot to post.';
			return;
		}

                resetStatus();
                loading = true;

                const signatureTargetId = activePaymentId;
                const trimmedSignature = signatureTargetId
                        ? (signatureInputs[signatureTargetId]?.trim() ?? '')
                        : '';

                try {
                        const pendingRequest = activePayment;
                        const hasPendingSubmission = pendingRequest !== null && pendingPayments.length > 0;

                        if (hasPendingSubmission) {
                                const errorKey = pendingRequest.internalId;

                                if (!trimmedSignature) {
                                        signatureErrors = {
                                                ...signatureErrors,
                                                [errorKey]: 'Paste the transaction signature before resubmitting.'
                                        };
                                        return;
                                }

                                const backendPaymentId =
                                        typeof pendingRequest.paymentId === 'string'
                                                ? pendingRequest.paymentId.trim()
                                                : '';

                                if (!backendPaymentId) {
                                        signatureErrors = {
                                                ...signatureErrors,
                                                [errorKey]:
                                                        'The payment request is missing its backend identifier. Regenerate the payment instructions and try again.'
                                        };
                                        return;
                                }

                                const storedTransaction = signatureTargetId
                                        ? transactionRecords[signatureTargetId] ?? null
                                        : null;

                                const { [errorKey]: _previousError, ...remainingErrors } = signatureErrors;
                                signatureErrors = remainingErrors;

                                const submission = await submitPaymentToBackend({
                                        paymentId: backendPaymentId,
                                        signature: trimmedSignature,
                                        wireTransaction: storedTransaction,
                                        payer: walletPublicKey
                                });

                                if (submission.payment) {
                                        applyServerPayments([submission.payment]);
                                }

                                if (submission.error) {
                                        signatureErrors = { ...signatureErrors, [errorKey]: submission.error };
                                        return;
                                }

                                if (!submission.payment) {
                                        signatureErrors = {
                                                ...signatureErrors,
                                                [errorKey]: 'We could not store that payment signature. Try again.'
                                        };
                                        return;
                                }

                                const { payment: paymentRecord } = submission;
                                const pendingStatus = paymentRecord.pending?.status ?? paymentRecord.request.status;

                                if (pendingStatus === 'failed') {
                                        signatureErrors = {
                                                ...signatureErrors,
                                                [errorKey]:
                                                        paymentRecord.pending?.error ??
                                                        'The backend could not submit this transaction. Try signing and sending again.'
                                        };
                                        return;
                                }

                                const confirmed =
                                        paymentRecord.request.status === 'confirmed' ||
                                        paymentRecord.pending?.status === 'confirmed' ||
                                        Boolean(paymentRecord.verification);

                                if (!confirmed) {
                                        if (walletPublicKey) {
                                                await syncServerPayments(walletPublicKey, true);
                                        }
                                        return;
                                }
                        }

                        const headers: Record<string, string> = { 'content-type': 'application/json' };
                        if (trimmedSignature) {
                                headers['x-payment-txhash'] = trimmedSignature;
                        }

                        const metadata: Record<string, unknown> = {};
                        if (trimmedSignature) {
                                metadata.signature = trimmedSignature;
                        }
                        if (signatureTargetId && signatureTargetId in transactionRecords) {
                                const storedTransaction = transactionRecords[signatureTargetId];
                                if (storedTransaction) {
                                        metadata.transaction = storedTransaction;
                                }
                        }
                        if (walletPublicKey) {
                                metadata.sender = walletPublicKey;
                        }
                        if (Object.keys(metadata).length > 0) {
                                headers['x-payment'] = encodePaymentMetadata(metadata);
                        }

                        const response = await fetch('/api/auctions', {
                                method: 'POST',
                                headers,
                                body: JSON.stringify({
					groupId: selectedGroup.id,
					message: trimmedMessage,
					bidderName: sender.trim() ? sender.trim() : undefined
				})
			});

			const payload = parseJson(await response.text());

			if (response.status === 201) {
				successAuction = (payload as Auction) ?? null;
				message = '';
				sender = '';
				clearPendingPayments();
			} else if (response.status === 402) {
				const hasPaymentDetails =
					payload &&
					typeof payload === 'object' &&
					('maxAmountRequired' in payload ||
						'amount' in payload ||
						'paymentAddress' in payload ||
						'recipient' in payload);

                                if (hasPaymentDetails) {
                                        const pending = addOrUpdatePendingPayment(payload as PaymentRequestData);

                                        if (trimmedSignature && signatureTargetId) {
                                                signatureErrors = {
                                                        ...signatureErrors,
                                                        [signatureTargetId]:
                                                                'We could not confirm that signature yet. Wait for the transaction to finalize on Solana, then try again.'
                                                };
                                                signatureSubmitted = {
                                                        ...signatureSubmitted,
                                                        [signatureTargetId]: true,
                                                        [pending.internalId]: true
                                                };
                                        }

                                        if (!(pending.internalId in signatureInputs)) {
                                                signatureInputs = { ...signatureInputs, [pending.internalId]: '' };
                                        }
                                        persistPendingPaymentState();
                                } else {
                                        error = 'Payment details were not returned by the server.';
                                }
                        } else {
                                const fallbackMessage =
					typeof payload === 'object' && payload !== null && 'error' in payload
						? String((payload as { error: unknown }).error)
						: 'Failed to submit the message. Please try again.';
				error = fallbackMessage;
			}
		} catch (requestError) {
			error =
				requestError instanceof Error
					? requestError.message
                                        : 'Failed to submit the message. Please try again.';
                } finally {
                        loading = false;
                        persistPendingPaymentState();
                }
        }

	async function payWithWallet(): Promise<void> {
		const state = $wallet;
		const request = activePayment;

		if (!request) {
			walletError = 'Select a payment request to continue.';
			return;
		}

		if (!state.connected || !state.publicKey) {
			walletError = 'Connect a Solana wallet before paying.';
			return;
		}

		if (!rpc) {
			walletError = 'Solana RPC connection is still initializing. Try again in a moment.';
			return;
		}

		if (!isSupportedWalletPayment(request)) {
			walletError = 'This payment request cannot be settled with the in-browser wallet flow.';
			return;
		}

		const amount = resolveAmount(request);
		const recipientAddress = resolveRecipient(request);
		const memo = resolveMemo(request);
		const currency = (resolveCurrency(request) ?? 'USDC').toUpperCase();

		if (amount === null || amount <= 0) {
			walletError = 'The payment amount returned by the server is invalid.';
			return;
		}

		if (!recipientAddress) {
			walletError = 'The payment request is missing a recipient address.';
			return;
		}

		walletError = null;
		walletStatus = null;
		walletProcessing = true;

		try {
			const payerAddress = state.publicKey;
			const payerSigner = createNoopSigner(payerAddress);
			const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

			const instructions: Instruction[] = [];

			if (currency === 'SOL') {
				const lamportsValue = decimalToBaseUnits(amount, LAMPORT_DECIMALS);
				if (lamportsValue <= 0n) {
					throw new Error('The SOL amount is too small to send.');
				}

				const transferInstruction = getTransferSolInstruction({
					source: payerSigner,
					destination: address(recipientAddress),
					amount: lamports(lamportsValue)
				});

				instructions.push(transferInstruction);
			} else {
				const mintAddress = request.assetAddress;
				if (!mintAddress) {
					throw new Error('This payment requires a token mint address.');
				}

				const mintAddressValue = address(mintAddress);
				const recipientAddressValue = address(recipientAddress);

				const payerAta = await findAssociatedTokenPda({
					owner: payerAddress,
					mint: mintAddressValue,
					tokenProgram: TOKEN_PROGRAM_ADDRESS
				});
				const recipientAta = await findAssociatedTokenPda({
					owner: recipientAddressValue,
					mint: mintAddressValue,
					tokenProgram: TOKEN_PROGRAM_ADDRESS
				});
				const payerAtaAddress = payerAta[0];
				const recipientAtaAddress = recipientAta[0];

				const [payerAccountInfo, recipientAccountInfo] = await Promise.all([
					rpc
						.getAccountInfo(payerAtaAddress, { commitment: 'confirmed', encoding: 'base64' })
						.send(),
					rpc
						.getAccountInfo(recipientAtaAddress, { commitment: 'confirmed', encoding: 'base64' })
						.send()
				]);

				if (!payerAccountInfo.value) {
					const instruction = getCreateAssociatedTokenIdempotentInstruction({
						payer: payerSigner,
						ata: payerAtaAddress,
						owner: payerAddress,
						mint: mintAddressValue
					});
					instructions.push(instruction);
				}

				if (!recipientAccountInfo.value) {
					const instruction = getCreateAssociatedTokenIdempotentInstruction({
						payer: payerSigner,
						ata: recipientAtaAddress,
						owner: recipientAddressValue,
						mint: mintAddressValue
					});
					instructions.push(instruction);
				}

				const mintInfo = await fetchMint(rpc, mintAddressValue).catch(() => null);
				const decimals = mintInfo?.data.decimals ?? 6;
				const baseUnits = decimalToBaseUnits(amount, decimals);

				if (baseUnits <= 0n) {
					throw new Error('The token amount is too small to transfer.');
				}

				const transferInstruction = getTransferInstruction({
					source: payerAtaAddress,
					destination: recipientAtaAddress,
					authority: payerSigner,
					amount: baseUnits
				});

				instructions.push(transferInstruction);
			}

			if (memo) {
				const memoInstruction = getAddMemoInstruction({ memo });
				instructions.push(memoInstruction);
			}

			if (instructions.length === 0) {
				throw new Error('Unable to create a payment transaction without instructions.');
			}

			const transactionMessage = pipe(
				createTransactionMessage({ version: 0 }),
				(tx) => setTransactionMessageFeePayer(payerAddress, tx),
				(tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
				(tx) => appendTransactionMessageInstructions(instructions, tx)
			);

                        const transaction = compileTransaction(transactionMessage);
                        const backendPaymentId = request.paymentId ?? null;

                        if (!backendPaymentId) {
                                throw new Error(
                                        'The payment request is missing a payment identifier. Regenerate the payment instructions and try again.'
                                );
                        }

                        const signed = await wallet.signTransaction(transaction);

                        updateSignatureForActive(signed.signature, {
                                transaction: signed.wireTransaction,
                                markSubmitted: true
                        });

                        walletStatus = 'Transaction signed. Submitting to the backend…';

                        const submission = await submitPaymentToBackend({
                                paymentId: backendPaymentId,
                                wireTransaction: signed.wireTransaction,
                                signature: signed.signature,
                                payer: signed.payer
                        });

                        if (submission.payment) {
                                applyServerPayments([submission.payment]);

                                if (submission.payment.pending?.signature) {
                                        updateSignatureForActive(submission.payment.pending.signature, {
                                                transaction:
                                                        submission.payment.pending.wireTransaction ?? signed.wireTransaction,
                                                markSubmitted: submission.payment.pending.status !== 'failed'
                                        });

                                        if (
                                                submission.payment.pending.status === 'failed' &&
                                                submission.payment.pending.error
                                        ) {
                                                signatureErrors = {
                                                        ...signatureErrors,
                                                        [request.internalId]: submission.payment.pending.error
                                                };
                                        }
                                }
                        }

                        if (submission.error) {
                                walletError = submission.error;
                                walletStatus = null;

                                if (state.publicKey) {
                                        await syncServerPayments(state.publicKey, true);
                                }

                                return;
                        }

                        if (submission.payment?.pending?.status === 'failed') {
                                walletError =
                                        submission.payment.pending.error ??
                                        'The backend reported a failure while broadcasting the transaction.';
                                walletStatus = null;
                        } else if (submission.payment?.verification) {
                                walletStatus =
                                        'Payment confirmed on-chain. Resubmit the form to post your message.';
                        } else {
                                walletStatus = 'Transaction submitted to the backend. Awaiting confirmation…';
                        }

                        if (state.publicKey) {
                                await syncServerPayments(state.publicKey, true);
                        }
                } catch (walletException) {
                        console.error('Wallet payment failed', walletException);
                        walletError =
                                walletException instanceof Error
                                        ? walletException.message
					: 'Failed to process the wallet payment. Please try again.';
		} finally {
			walletProcessing = false;
		}
	}

	$: selectedGroup = findSelectedGroup(selectedGroupId);
	$: minimumBid = selectedGroup ? formatUsd(selectedGroup.minBid) : null;
	$: {
		if (pendingPayments.length === 0) {
			activePaymentId = null;
		} else if (
			!activePaymentId ||
			!pendingPayments.some((item) => item.internalId === activePaymentId)
		) {
			activePaymentId = pendingPayments[0].internalId;
		}
	}
	$: activePayment = activePaymentId
		? (pendingPayments.find((item) => item.internalId === activePaymentId) ?? null)
		: null;
	$: paymentAmount = activePayment ? resolveAmount(activePayment) : null;
	$: paymentCurrency = activePayment ? (resolveCurrency(activePayment) ?? 'USDC') : 'USDC';
	$: paymentCurrencyLabel = paymentCurrency ? paymentCurrency.toUpperCase() : 'USDC';
	$: paymentAmountDisplay =
		paymentAmount !== null ? formatAmountForCurrency(paymentAmount, paymentCurrencyLabel) : null;
	$: paymentNetwork = activePayment ? resolveNetwork(activePayment) : null;
	$: paymentNetworkDisplay = paymentNetwork ? paymentNetwork : 'the configured network';
	$: paymentRecipient = activePayment ? resolveRecipient(activePayment) : null;
	$: paymentMemo = activePayment ? resolveMemo(activePayment) : null;
	$: paymentInstructions = activePayment?.instructions ?? null;
	$: hostedCheckoutLink = activePayment ? buildHostedCheckoutUrl(activePayment) : null;
        $: paymentExpirationDisplay =
                activePayment && activePayment.expiresAt ? formatExpiration(activePayment.expiresAt) : null;
        $: submitButtonLabel =
                pendingPayments.length > 0 ? 'Submit payment confirmation' : 'Generate payment instructions';
        $: currentSignatureValue = activePaymentId ? (signatureInputs[activePaymentId] ?? '') : '';
        $: currentSignatureError = activePaymentId ? (signatureErrors[activePaymentId] ?? null) : null;
        $: activeSignatureSubmitted = activePaymentId ? Boolean(signatureSubmitted[activePaymentId]) : false;
        $: activeSignatureValue = currentSignatureValue.trim();
        $: autoRefreshEligible = Boolean(
                browser &&
                activeSignatureSubmitted &&
                activeSignatureValue &&
                pendingPayments.length > 0
        );
        $: {
                if (autoRefreshEligible) {
                        if (!autoRefreshTimer) {
                                autoRefreshTimer = setInterval(() => {
                                        if (!loading) {
                                                void pollPendingPayments();
                                        }
                                }, AUTO_REFRESH_INTERVAL_MS);
                        }
                        autoRefreshActive = true;
                } else {
                        stopAutoRefresh();
                }
        }
        $: walletConnected = $wallet.connected;
        $: walletPublicKey = $wallet.publicKey ?? null;
        $: if (walletConnected && walletPublicKey) {
                void syncServerPayments(walletPublicKey);
        }
        $: if (browser && $wallet.rpcEndpoint && $wallet.rpcEndpoint !== currentRpcEndpoint) {
                currentRpcEndpoint = $wallet.rpcEndpoint;
                console.log('Initializing Solana RPC connection to', currentRpcEndpoint);
                rpc = createSolanaRpc(currentRpcEndpoint);
        }
	$: walletPaymentSupported = isSupportedWalletPayment(activePayment);
	$: canUseWallet = Boolean(walletPaymentSupported && walletConnected && walletPublicKey && rpc);
        $: if (activePaymentId !== lastActivePaymentId) {
                walletError = null;
                walletStatus = null;
                walletProcessing = false;
                lastActivePaymentId = activePaymentId;
        }

        onDestroy(stopAutoRefresh);
</script>

<section class="page" aria-labelledby="send-title">
	<header>
		<h2 id="send-title">Send a paid message</h2>
		<p>
			Fund your post with USDC on Solana. Once the payment clears, the bot drops the message into
			the selected Telegram group and shares a receipt with members.
		</p>
	</header>

	{#if data.loadError}
		<div class="status error" role="alert">
			<strong>Unable to load groups.</strong>
			<span>Refresh the page once the API is reachable.</span>
		</div>
	{/if}

	<form class="form" aria-label="Paid message form" on:submit|preventDefault={requestPayment}>
		<label>
			<span>Group</span>
			<select bind:value={selectedGroupId} disabled={activeGroups.length === 0 || loading}>
				{#if activeGroups.length === 0}
					<option value="">No active groups available</option>
				{/if}
				{#each activeGroups as group (group.id)}
					<option value={group.id}>{group.name} — {formatUsd(group.minBid)}</option>
				{/each}
			</select>
			{#if selectedGroup}
				<small class="field-note">
					Minimum bid {minimumBid} USDC. Payout wallet: <code>{selectedGroup.ownerAddress}</code>
				</small>
			{/if}
		</label>

		<label>
			<span>Sender name</span>
			<input
				type="text"
				bind:value={sender}
				placeholder="How should this message be credited?"
				maxlength={120}
				disabled={loading}
			/>
		</label>

		<label>
			<span>Message</span>
			<textarea
				rows={5}
				bind:value={message}
				placeholder="Write the announcement you want the bot to post"
				maxlength={1000}
				disabled={loading || !selectedGroup}
			></textarea>
		</label>

		<button type="submit" disabled={loading || !selectedGroup} aria-busy={loading}>
			{#if loading}
				Submitting…
			{:else}
				{submitButtonLabel}
			{/if}
		</button>
	</form>

	{#if error}
		<div class="status error" role="alert">
			<strong>We couldn't submit that message.</strong>
			<span>{error}</span>
		</div>
	{/if}

	{#if pendingPayments.length > 0}
                <section class="payment-notice" aria-live="polite">
                        <h3>Pending payment requests</h3>
                        <p>
                                Pending payment management has moved to the
                                <a href="/payments">Payments</a> page. Open it to review instructions, submit
                                signatures, or settle with a connected wallet.
                        </p>
                </section>
        {/if}

	{#if successAuction && selectedGroup}
		<div class="status success" aria-live="polite" role="status">
			<h3>Payment confirmed</h3>
			<p>
				Your message for <strong>{selectedGroup.name}</strong> posted after receiving
				{formatUsd(successAuction.amount)} USDC. Check Telegram for the pinned receipt.
			</p>
		</div>
	{/if}

	<aside class="help" aria-live="polite">
		<h3>What happens next</h3>
		<ol>
			<li>
				Click “Generate payment instructions” to retrieve the required amount and payout address.
			</li>
			<li>
				Open the hosted facilitator link (or settle the transfer from your own wallet) to broadcast
				the payment.
			</li>
			<li>
				Paste or confirm the transaction signature and submit the form again once the transfer
				finalizes.
			</li>
		</ol>
		<p>
			Need to adjust the price? Update it from the <a href="/groups">group directory</a> before sharing
			the link.
		</p>
	</aside>
</section>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		display: grid;
		gap: clamp(1.5rem, 3vw, 2.5rem);
	}

	header {
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: clamp(1.5rem, 3vw, 2.25rem);
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: clamp(2rem, 2vw + 1.5rem, 2.4rem);
		color: #111827;
	}

	p {
		margin: 0;
		color: #475569;
		line-height: 1.6;
	}

	.form {
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: clamp(1.5rem, 3vw, 2.25rem);
		display: grid;
		gap: 1rem;
	}

	label {
		display: grid;
		gap: 0.4rem;
	}

	span {
		font-weight: 600;
		color: #111827;
	}

	input,
	select,
	textarea {
		border: 1px solid #cbd5f5;
		border-radius: 10px;
		padding: 0.55rem 0.75rem;
		font: inherit;
		color: #111827;
		background: #f8fafc;
	}

	textarea {
		resize: vertical;
	}

	button {
		justify-self: start;
		padding: 0.55rem 1.25rem;
		border: none;
		border-radius: 10px;
		background: #111827;
		color: white;
		font-weight: 600;
		cursor: pointer;
	}

	button[disabled] {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status {
		background: white;
		border-radius: 16px;
		padding: clamp(1.5rem, 3vw, 2.25rem);
		display: grid;
		gap: 0.5rem;
	}

	.status h3 {
		margin: 0;
		font-size: 1.2rem;
	}

	.status.error {
		border: 1px solid #fecaca;
		background: #fef2f2;
		color: #991b1b;
	}

	.status.success {
		border: 1px solid #bbf7d0;
		background: #f0fdf4;
		color: #14532d;
	}

        .payment-notice {
                margin-top: 1.5rem;
                border: 1px solid #cbd5f5;
                border-radius: 16px;
                background: #f8fafc;
                padding: clamp(1.2rem, 2vw, 1.75rem);
                display: grid;
                gap: 0.5rem;
        }

        .payment-notice a {
                color: #2563eb;
                font-weight: 600;
        }

        .field-note {
                color: #475569;
                font-size: 0.9rem;
        }

        .help {
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 16px;
                padding: clamp(1.5rem, 3vw, 2.25rem);
                display: grid;
                gap: 0.75rem;
        }

        .help ol {
                margin: 0;
                padding-left: 1.2rem;
                color: #475569;
                line-height: 1.6;
        }

        a {
                color: #0f172a;
        }

        select[disabled],
        textarea[disabled],
        input[disabled] {
                background: #e2e8f0;
                cursor: not-allowed;
        }

</style>
