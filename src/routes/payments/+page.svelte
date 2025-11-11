<script lang="ts">
        import { onDestroy, onMount } from 'svelte';
        import { PUBLIC_SOLANA_RPC_ENDPOINT } from '$lib/config';
        import { wallet } from '$lib/wallet/wallet.svelte';
        import type { MessagePaymentHistoryEntry, MessageRating, MessageResponse } from '$lib/types';
        import {
                SUPPORTED_STABLECOINS,
                getStablecoinMetadata,
                type StablecoinMetadata
        } from '$lib/stablecoins';
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

        const LAMPORT_DECIMALS = 9;
        const USD_DECIMALS = 6;
        const AVAILABLE_STABLECOINS: StablecoinMetadata[] = SUPPORTED_STABLECOINS.filter(
                (coin) => Boolean(coin.defaultMint) && Boolean(coin.logoUrl)
        );
        const FALLBACK_STABLECOIN_CODE = AVAILABLE_STABLECOINS[0]?.code ?? 'USDC';

        interface PaymentsResponse {
                payments?: MessagePaymentHistoryEntry[];
                error?: string;
        }

        interface SubmitPaymentResponse {
                payment?: MessagePaymentHistoryEntry;
                error?: string;
        }

        interface SaveRatingResponse {
                rating?: MessageRating;
                error?: string;
        }

        interface RatingFormState {
                rating: number | null;
                comment: string;
                submitting: boolean;
                error: string | null;
                success: boolean;
        }

        let payments: MessagePaymentHistoryEntry[] = [];
        let loading = false;
        let loadError: string | null = null;
        let refreshing = false;
        let actionStatus: Record<string, string | null> = {};
        let actionError: Record<string, string | null> = {};
        let lastWallet: string | null = null;
        let verificationInterval: ReturnType<typeof setInterval> | null = null;
        let verificationRequestInFlight = false;
        let ratingForms: Record<number, RatingFormState> = {};
        let selectedStablecoins: Record<string, string> = {};
        let openStablecoinMenu: string | null = null;

        const responseTimeFormatter = new Intl.DateTimeFormat('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short'
        });

        function formatResponder(response: MessageResponse) {
                if (response.username && response.username.trim()) {
                        const handle = response.username.startsWith('@')
                                ? response.username
                                : `@${response.username}`;
                        return handle;
                }

                return `User ${response.userId}`;
        }

        function formatResponseTime(value: string) {
                const date = new Date(value);
                if (Number.isNaN(date.getTime())) {
                        return value;
                }

                return responseTimeFormatter.format(date);
        }

        function resolveDefaultStablecoin(
                _paymentId: string,
                entry: MessagePaymentHistoryEntry
        ): string {
                const requestCurrency = entry.request.currency?.toUpperCase() ?? null;
                if (requestCurrency) {
                        const supported = AVAILABLE_STABLECOINS.find((coin) => coin.code === requestCurrency);
                        if (supported) {
                                return supported.code;
                        }
                }

                return FALLBACK_STABLECOIN_CODE;
        }

        function getSelectedCurrency(entry: MessagePaymentHistoryEntry): string {
                const paymentId = entry.request.paymentId;
                const selected = selectedStablecoins[paymentId];
                const normalized = selected?.toUpperCase() ?? '';

                if (normalized && AVAILABLE_STABLECOINS.some((coin) => coin.code === normalized)) {
                        return normalized;
                }

                const requestCurrency = entry.request.currency?.toUpperCase() ?? null;
                if (requestCurrency && AVAILABLE_STABLECOINS.some((coin) => coin.code === requestCurrency)) {
                        return requestCurrency;
                }

                if (AVAILABLE_STABLECOINS.some((coin) => coin.code === FALLBACK_STABLECOIN_CODE)) {
                        return FALLBACK_STABLECOIN_CODE;
                }

                return requestCurrency ?? 'USDC';
        }

        function getSelectedStablecoin(entry: MessagePaymentHistoryEntry): StablecoinMetadata | null {
                const currency = getSelectedCurrency(entry);
                return getStablecoinMetadata(currency);
        }

        function toggleStablecoinMenu(paymentId: string) {
                openStablecoinMenu = openStablecoinMenu === paymentId ? null : paymentId;
        }

        function selectStablecoin(paymentId: string, code: string) {
                selectedStablecoins = { ...selectedStablecoins, [paymentId]: code };
                openStablecoinMenu = null;
        }

        $: walletState = $wallet;
        $: walletAddress = walletState.publicKey;
        $: awaitingSignatureVerification = payments.some(
                (entry) => entry.message?.status === 'signature_saved' && entry.request.status !== 'confirmed'
        );

        $: if (walletAddress && walletAddress !== lastWallet) {
                lastWallet = walletAddress;
                void loadPayments(true);
        } else if (!walletAddress && lastWallet) {
                lastWallet = null;
                payments = [];
                stopVerificationPolling();
        }

        onDestroy(() => {
                payments = [];
                stopVerificationPolling();
        });

        onMount(() => {
                const handleClick = (event: MouseEvent) => {
                        if (!openStablecoinMenu) {
                                return;
                        }

                        const target = event.target instanceof HTMLElement ? event.target : null;
                        if (!target?.closest(`[data-stablecoin-menu="${openStablecoinMenu}"]`)) {
                                openStablecoinMenu = null;
                        }
                };

                const handleKeydown = (event: KeyboardEvent) => {
                        if (event.key === 'Escape') {
                                openStablecoinMenu = null;
                        }
                };

                window.addEventListener('click', handleClick);
                window.addEventListener('keydown', handleKeydown);

                return () => {
                        window.removeEventListener('click', handleClick);
                        window.removeEventListener('keydown', handleKeydown);
                };
        });

        $: {
                const nextState: Record<number, RatingFormState> = {};

                for (const entry of payments) {
                        const message = entry.message;
                        if (!message) {
                                continue;
                        }

                        const messageId = message.id;
                        const existing = ratingForms[messageId];
                        const base: RatingFormState = existing
                                ? { ...existing }
                                : {
                                          rating: message.rating?.rating ?? null,
                                          comment: message.rating?.comment ?? '',
                                          submitting: false,
                                          error: null,
                                          success: false
                                  };

                        if (!base.submitting) {
                                base.rating = message.rating?.rating ?? null;
                                base.comment = message.rating?.comment ?? '';
                        }

                        nextState[messageId] = base;
                }

                if (!ratingStatesEqual(ratingForms, nextState)) {
                        ratingForms = nextState;
                }
        }

        $: {
                if (walletAddress && awaitingSignatureVerification) {
                        if (!verificationInterval) {
                                void pollVerificationStatus();
                                verificationInterval = setInterval(() => {
                                        void pollVerificationStatus();
                                }, 1000);
                        }
                } else {
                        stopVerificationPolling();
                }
        }

        $: {
                const nextSelections: Record<string, string> = { ...selectedStablecoins };
                const validIds = new Set(payments.map((entry) => entry.request.paymentId));
                let changed = false;

                for (const existingId of Object.keys(nextSelections)) {
                        if (!validIds.has(existingId)) {
                                delete nextSelections[existingId];
                                changed = true;
                        }
                }

                for (const entry of payments) {
                        const paymentId = entry.request.paymentId;
                        if (!nextSelections[paymentId]) {
                                nextSelections[paymentId] = resolveDefaultStablecoin(paymentId, entry);
                                changed = true;
                        }
                }

                if (changed) {
                        selectedStablecoins = nextSelections;
                }
        }

	async function loadPayments(force = false) {
		if (!walletAddress) {
			payments = [];
			return;
		}

		if (loading && !force) {
			return;
		}

		loading = true;
		loadError = null;

		try {
			const response = await fetch(`/api/payments?wallet=${encodeURIComponent(walletAddress)}`);
			const payload = (await response.json()) as PaymentsResponse;

			if (!response.ok) {
				throw new Error(
					typeof payload?.error === 'string' ? payload.error : 'Unable to load payments'
				);
			}

			payments = Array.isArray(payload?.payments) ? payload.payments : [];
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Unable to load payments.';
		} finally {
			loading = false;
		}
        }

        function setAction(paymentId: string, status: string | null, error?: string | null) {
                actionStatus = { ...actionStatus, [paymentId]: status };
                if (error !== undefined) {
                        actionError = { ...actionError, [paymentId]: error };
                }
        }

        function ratingStatesEqual(
                a: Record<number, RatingFormState>,
                b: Record<number, RatingFormState>
        ): boolean {
                const aKeys = Object.keys(a);
                const bKeys = Object.keys(b);
                if (aKeys.length !== bKeys.length) {
                        return false;
                }

                for (const key of aKeys) {
                        const id = Number(key);
                        const aState = a[id];
                        const bState = b[id];
                        if (!aState || !bState) {
                                return false;
                        }

                        if (
                                aState.rating !== bState.rating ||
                                aState.comment !== bState.comment ||
                                aState.submitting !== bState.submitting ||
                                aState.error !== bState.error ||
                                aState.success !== bState.success
                        ) {
                                return false;
                        }
                }

                return true;
        }

        function updateRatingForm(messageId: number, updates: Partial<RatingFormState>) {
                const current: RatingFormState = ratingForms[messageId] ?? {
                        rating: null,
                        comment: '',
                        submitting: false,
                        error: null,
                        success: false
                };

                ratingForms = {
                        ...ratingForms,
                        [messageId]: { ...current, ...updates }
                };
        }

        function handleRatingChange(messageId: number, value: string) {
                const parsed = Number(value);
                updateRatingForm(messageId, {
                        rating: Number.isFinite(parsed) ? parsed : null,
                        error: null,
                        success: false
                });
        }

        function handleRatingCommentChange(messageId: number, value: string) {
                updateRatingForm(messageId, {
                        comment: value,
                        error: null,
                        success: false
                });
        }

        async function submitRating(messageId: number) {
                const form = ratingForms[messageId];
                if (!form) {
                        return;
                }

                if (!walletAddress) {
                        updateRatingForm(messageId, {
                                error: 'Connect your wallet to submit a rating.'
                        });
                        return;
                }

                if (!form.rating || form.rating < 1 || form.rating > 5) {
                        updateRatingForm(messageId, {
                                error: 'Select a rating between 1 and 5 before submitting.'
                        });
                        return;
                }

                updateRatingForm(messageId, { submitting: true, error: null, success: false });

                try {
                        const response = await fetch('/api/ratings', {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({
                                        messageRequestId: messageId,
                                        rating: form.rating,
                                        comment: form.comment?.trim() || null,
                                        walletAddress
                                })
                        });

                        const payload = (await response.json()) as SaveRatingResponse;

                        if (!response.ok) {
                                const fallback =
                                        typeof payload?.error === 'string'
                                                ? payload.error
                                                : 'Unable to submit rating.';
                                updateRatingForm(messageId, { submitting: false, error: fallback });
                                return;
                        }

                        const rating = payload.rating ?? null;

                        payments = payments.map((entry) => {
                                if (entry.message?.id === messageId) {
                                        const message = entry.message;
                                        if (!message) {
                                                return entry;
                                        }

                                        return {
                                                ...entry,
                                                message: {
                                                        ...message,
                                                        rating
                                                }
                                        };
                                }

                                return entry;
                        });

                        updateRatingForm(messageId, {
                                submitting: false,
                                error: null,
                                success: true,
                                rating: rating?.rating ?? form.rating,
                                comment: rating?.comment ?? form.comment
                        });
                } catch (error) {
                        const message = error instanceof Error ? error.message : 'Unable to submit rating.';
                        updateRatingForm(messageId, { submitting: false, error: message });
                }
        }

        function stopVerificationPolling() {
                if (verificationInterval) {
                        clearInterval(verificationInterval);
                        verificationInterval = null;
                }
        }

        async function pollVerificationStatus() {
                if (verificationRequestInFlight || !walletAddress) {
                        return;
                }

                verificationRequestInFlight = true;
                try {
                        await loadPayments(true);
                } finally {
                        verificationRequestInFlight = false;
                }
        }

	function updatePaymentEntry(update: MessagePaymentHistoryEntry) {
		const paymentId = update.request.paymentId;
		const existingIndex = payments.findIndex((entry) => entry.request.paymentId === paymentId);

		if (existingIndex === -1) {
			payments = [...payments, update];
			return;
		}

		payments = payments.map((entry, index) =>
			index === existingIndex
				? {
						...entry,
						request: update.request ?? entry.request,
						pending: update.pending ?? entry.pending,
						verification: Object.prototype.hasOwnProperty.call(update, 'verification')
							? (update.verification ?? null)
							: (entry.verification ?? null),
						message: update.message ?? entry.message,
						group: update.group ?? entry.group
					}
				: entry
		);
	}

	function toBaseUnits(value: number, decimals: number): bigint {
		if (!Number.isFinite(value) || value < 0) {
			throw new Error('Payment amounts must be positive numbers.');
		}

		const factor = 10 ** decimals;
		return BigInt(Math.round(value * factor));
	}

	function resolveStatus(entry: MessagePaymentHistoryEntry) {
		const messageStatus = entry.message?.status ?? 'awaiting_payment';
		const requestStatus = entry.request.status;

		if (requestStatus === 'expired') {
			return {
				label: 'Expired',
				tone: 'danger',
				description: 'This payment request expired before it was confirmed.'
			};
		}

		switch (messageStatus) {
			case 'awaiting_payment':
				return {
					label: 'Waiting for payment',
					tone: 'warning',
					description: 'Complete the transaction to publish your message.'
				};
			case 'signature_saved':
				return {
					label: 'Signature saved',
					tone: 'info',
					description: 'We received your signature and are waiting for confirmation.'
				};
			case 'paid':
				return {
					label: 'Payment confirmed',
					tone: 'info',
					description: 'Payment was confirmed on-chain.'
				};
			case 'sent':
				return {
					label: 'Message posted',
					tone: 'success',
					description: 'The Telegram bot delivered this message.'
				};
			case 'failed':
				return {
					label: 'Delivery failed',
					tone: 'danger',
					description: entry.message?.lastError ?? 'We could not deliver this message.'
				};
			default:
				return {
					label: 'Unknown status',
					tone: 'neutral',
					description: 'Status could not be determined.'
				};
		}
	}

        function canPay(entry: MessagePaymentHistoryEntry): boolean {
                return entry.message?.status === 'awaiting_payment' && entry.request.status === 'pending';
        }

        function canVerify(entry: MessagePaymentHistoryEntry): boolean {
                const hasSignature = Boolean(entry.pending?.signature || entry.request.lastSignature);
                return hasSignature && entry.request.status !== 'confirmed';
        }

        function isAwaitingSignatureVerification(entry: MessagePaymentHistoryEntry): boolean {
                return entry.message?.status === 'signature_saved' && entry.request.status !== 'confirmed';
        }

        async function submitPayment(payload: Record<string, unknown>) {
                const response = await fetch('/api/payments', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});

		const data = (await response.json()) as SubmitPaymentResponse;

		if (!response.ok) {
			throw new Error(typeof data?.error === 'string' ? data.error : 'Payment submission failed.');
		}

		if (data?.payment) {
			updatePaymentEntry(data.payment);
		}

		return data?.payment;
	}

        async function buildPaymentTransaction(
                entry: MessagePaymentHistoryEntry,
                currencyOverride: string
        ) {
                if (!walletAddress) {
                        throw new Error('Connect your wallet to pay.');
                }

                const amount = entry.request.amount;
		if (!Number.isFinite(amount) || amount <= 0) {
			throw new Error('The payment amount is invalid.');
		}

		const recipient = entry.request.recipient;
		if (!recipient) {
			throw new Error('Payment request is missing a recipient address.');
		}

		const rpcEndpoint = PUBLIC_SOLANA_RPC_ENDPOINT;
		const rpc = createSolanaRpc(rpcEndpoint);
		const payerAddress = address(walletAddress as Address);
                const payerSigner = createNoopSigner(payerAddress);
                const { value: latestBlockhash } = await rpc
                        .getLatestBlockhash({ commitment: 'processed' })
                        .send();

                const instructions: Instruction[] = [];
                const requestCurrency = entry.request.currency?.toUpperCase() ?? null;
                const normalizedOverride = currencyOverride?.toUpperCase() ?? '';
                const currency = normalizedOverride || requestCurrency || 'USDC';

                if (currency === 'SOL') {
                        const lamportsValue = toBaseUnits(amount, LAMPORT_DECIMALS);
                        if (lamportsValue <= 0n) {
                                throw new Error('The SOL amount is too small to transfer.');
                        }

                        const transferInstruction = getTransferSolInstruction({
                                source: payerSigner,
                                destination: address(recipient),
                                amount: lamports(lamportsValue)
                        });
                        instructions.push(transferInstruction);
                } else {
                        const stablecoin = getStablecoinMetadata(currency);
                        const mintAddress =
                                currency === requestCurrency
                                        ? entry.request.assetAddress ?? stablecoin?.defaultMint ?? null
                                        : stablecoin?.defaultMint ?? null;
                        if (!mintAddress) {
                                throw new Error('Missing token mint address for this payment.');
                        }

                        const mint = address(mintAddress);
			const recipientAddress = address(recipient);
			const payerAta = await findAssociatedTokenPda({
				owner: payerAddress,
				mint,
				tokenProgram: TOKEN_PROGRAM_ADDRESS
			});
			const recipientAta = await findAssociatedTokenPda({
				owner: recipientAddress,
				mint,
				tokenProgram: TOKEN_PROGRAM_ADDRESS
			});
			const payerAtaAddress = payerAta[0];
			const recipientAtaAddress = recipientAta[0];

			const [payerAccountInfo, recipientAccountInfo] = await Promise.all([
				rpc.getAccountInfo(payerAtaAddress, { commitment: 'confirmed', encoding: 'base64' }).send(),
				rpc
					.getAccountInfo(recipientAtaAddress, { commitment: 'confirmed', encoding: 'base64' })
					.send()
			]);

			if (!payerAccountInfo.value) {
				instructions.push(
					getCreateAssociatedTokenIdempotentInstruction({
						payer: payerSigner,
						ata: payerAtaAddress,
						owner: payerAddress,
						mint
					})
				);
			}

			if (!recipientAccountInfo.value) {
				instructions.push(
					getCreateAssociatedTokenIdempotentInstruction({
						payer: payerSigner,
						ata: recipientAtaAddress,
						owner: recipientAddress,
						mint
					})
				);
			}

                        const mintInfo = await fetchMint(rpc, mint).catch(() => null);
                        const decimals =
                                mintInfo?.data.decimals ?? stablecoin?.decimals ?? USD_DECIMALS;
                        const baseUnits = toBaseUnits(amount, decimals);
                        if (baseUnits <= 0n) {
                                throw new Error('The token amount is too small to transfer.');
                        }

			instructions.push(
				getTransferInstruction({
					source: payerAtaAddress,
					destination: recipientAtaAddress,
					authority: payerSigner,
					amount: baseUnits
				})
			);
		}

		if (entry.request.memo) {
			instructions.push(getAddMemoInstruction({ memo: entry.request.memo }));
		}

		const transactionMessage = pipe(
			createTransactionMessage({ version: 0 }),
			(tx) => setTransactionMessageFeePayer(payerAddress, tx),
			(tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
			(tx) => appendTransactionMessageInstructions(instructions, tx)
		);

		const transaction = compileTransaction(transactionMessage);
		return { transaction };
	}

        async function payWithWallet(entry: MessagePaymentHistoryEntry) {
                if (!walletAddress) {
                        setAction(entry.request.paymentId, null, 'Connect your wallet first.');
                        return;
                }

                if (!canPay(entry)) {
                        setAction(entry.request.paymentId, null, 'This payment cannot be paid right now.');
                        return;
                }

                try {
                        setAction(entry.request.paymentId, 'Awaiting wallet signature…', null);
                        const currency = getSelectedCurrency(entry);
                        const { transaction } = await buildPaymentTransaction(entry, currency);
                        const signed = await wallet.signTransaction(transaction);
                        setAction(entry.request.paymentId, 'Submitting transaction…');

                        await submitPayment({
                                paymentId: entry.request.paymentId,
                                wireTransaction: signed.wireTransaction,
                                signature: signed.signature,
                                payer: signed.payer,
                                currency
                        });

                        setAction(entry.request.paymentId, 'Transaction submitted. Waiting for confirmation…');
                        openStablecoinMenu = null;
                        await loadPayments(true);
                } catch (error) {
                        const message = error instanceof Error ? error.message : 'Wallet payment failed.';
                        setAction(entry.request.paymentId, null, message);
                }
	}

        async function verifySignature(entry: MessagePaymentHistoryEntry) {
                const signature = entry.pending?.signature ?? entry.request.lastSignature;
                if (!signature) {
                        setAction(entry.request.paymentId, null, 'No signature available to verify.');
                        return;
		}

                try {
                        setAction(entry.request.paymentId, 'Verifying payment…');
                        await submitPayment({
                                paymentId: entry.request.paymentId,
                                signature,
                                payer: walletAddress ?? undefined,
                                currency: getSelectedCurrency(entry)
                        });
                        setAction(entry.request.paymentId, 'Verification submitted.');
                        openStablecoinMenu = null;
                        await loadPayments(true);
                } catch (error) {
                        const message = error instanceof Error ? error.message : 'Verification failed.';
                        setAction(entry.request.paymentId, null, message);
                }
	}

        function actionBusy(entry: MessagePaymentHistoryEntry): boolean {
                return Boolean(actionStatus[entry.request.paymentId]);
        }

	async function refreshAll() {
		if (!walletAddress) {
			return;
		}
		refreshing = true;
		await loadPayments(true);
		refreshing = false;
	}
</script>

<svelte:head>
	<title>Payments</title>
</svelte:head>

<article class="payments-page">
	<header>
		<h2>Payment requests</h2>
                <p>Track your pending messages and complete payments.</p>
		<div class="actions">
			<button type="button" on:click={refreshAll} disabled={refreshing || !walletAddress}>
				{#if refreshing}
					Refreshing…
				{:else}
					Refresh
				{/if}
			</button>
		</div>
	</header>

	{#if !walletAddress}
		<p class="info">
			Connect your Solana wallet with the button in the top right to see your payments.
		</p>
	{:else if loading && payments.length === 0}
		<p class="info">Loading your payments…</p>
	{:else if loadError}
		<p class="error">{loadError}</p>
	{:else if payments.length === 0}
		<p class="info">No payment requests found for this wallet yet.</p>
	{:else}
		<ul class="payment-list">
			{#each payments as entry (entry.request.paymentId)}
				{@const status = resolveStatus(entry)}
				<li class="payment-card">
					<div class={`status-badge status-${status.tone}`}>{status.label}</div>
					<div class="card-header">
						<h3>{entry.group?.name ?? 'Telegram group'}</h3>
						<span class="amount"
							>{entry.request.amount.toFixed(2)}
							{entry.request.currency?.toUpperCase() ?? 'USDC'}</span
						>
					</div>
                                        <p class="status-description">{status.description}</p>
                                        {#if isAwaitingSignatureVerification(entry) && verificationRequestInFlight}
                                                <div class="auto-refresh" aria-live="polite">
                                                        <span class="spinner" role="status" aria-label="Checking status"></span>
                                                        <span>Checking status…</span>
                                                </div>
                                        {/if}
                                        <section class="details">
                                                <h4>Message</h4>
                                                <p class="message-text">
                                                        {entry.message?.message ?? entry.request.memo ?? 'Message details unavailable.'}
                                                </p>
                                        </section>
                                        {#if entry.message && entry.message.responses.length > 0}
                                                <section class="details responses" aria-live="polite">
                                                        <h4>Replies from the group</h4>
                                                        <ul class="responses-list">
                                                                {#each entry.message.responses as response (response.id)}
                                                                        <li class="response-item">
                                                                                <header>
                                                                                        <span class="responder">{formatResponder(response)}</span>
                                                                                        <time datetime={response.createdAt}>
                                                                                                {formatResponseTime(response.createdAt)}
                                                                                        </time>
                                                                                </header>
                                                                                <p class="response-text">{response.text}</p>
                                                                        </li>
                                                                {/each}
                                                        </ul>
                                                </section>
                                                <section class="details rating" aria-live="polite">
                                                        <h4>Rate the replies</h4>
                                                        {#if ratingForms[entry.message!.id]}
                                                                <div class="rating-form">
                                                                        <label>
                                                                                <span>Rating</span>
                                                                                <select
                                                                                        value={
                                                                                                ratingForms[entry.message!.id].rating
                                                                                                        ? String(
                                                                                                                  ratingForms[
                                                                                                                          entry.message!.id
                                                                                                                  ].rating
                                                                                                          )
                                                                                                        : ''
                                                                                        }
                                                                                        on:change={(event) =>
                                                                                                handleRatingChange(
                                                                                                        entry.message!.id,
                                                                                                        event.currentTarget.value
                                                                                                )
                                                                                        }
                                                                                >
                                                                                        <option value="" disabled>
                                                                                                Select a rating
                                                                                        </option>
                                                                                        <option value="5">5 — Excellent</option>
                                                                                        <option value="4">4 — Good</option>
                                                                                        <option value="3">3 — Neutral</option>
                                                                                        <option value="2">2 — Needs work</option>
                                                                                        <option value="1">1 — Not helpful</option>
                                                                                </select>
                                                                        </label>
                                                                        <label>
                                                                                <span>Comment (optional)</span>
                                                                                <textarea
                                                                                        rows={3}
                                                                                        maxlength={500}
                                                                                        value={ratingForms[entry.message!.id].comment}
                                                                                        on:input={(event) =>
                                                                                                handleRatingCommentChange(
                                                                                                        entry.message!.id,
                                                                                                        event.currentTarget.value
                                                                                                )
                                                                                        }
                                                                                        placeholder="Share why the reply was or wasn't helpful."
                                                                                ></textarea>
                                                                        </label>
                                                                        {#if ratingForms[entry.message!.id].error}
                                                                                <p class="error">{ratingForms[entry.message!.id].error}</p>
                                                                        {/if}
                                                                        {#if ratingForms[entry.message!.id].success}
                                                                                <p class="success">Thanks for the feedback!</p>
                                                                        {/if}
                                                                        <button
                                                                                type="button"
                                                                                on:click={() => submitRating(entry.message!.id)}
                                                                                disabled={ratingForms[entry.message!.id].submitting}
                                                                        >
                                                                                {#if ratingForms[entry.message!.id].submitting}
                                                                                        Saving…
                                                                                {:else if entry.message.rating}
                                                                                        Update rating
                                                                                {:else}
                                                                                        Submit rating
                                                                                {/if}
                                                                        </button>
                                                                </div>
                                                        {/if}
                                                </section>
                                        {/if}
                                        <section class="details">
                                                <h4>Payment details</h4>
                                                <dl>
                                                        <div>
                                                                <dt>Recipient</dt>
								<dd><code>{entry.request.recipient}</code></dd>
							</div>
							<div>
								<dt>Payment ID</dt>
								<dd><code>{entry.request.paymentId}</code></dd>
							</div>
							{#if entry.pending?.signature}
								<div>
									<dt>Pending signature</dt>
									<dd><code>{entry.pending.signature}</code></dd>
								</div>
							{/if}
							{#if entry.request.lastSignature && (!entry.pending || entry.pending.signature !== entry.request.lastSignature)}
								<div>
									<dt>Last signature</dt>
									<dd><code>{entry.request.lastSignature}</code></dd>
								</div>
							{/if}
							{#if entry.message?.telegramMessageId}
								<div>
									<dt>Telegram message</dt>
									<dd>#{entry.message.telegramMessageId}</dd>
								</div>
							{/if}
						</dl>
                                        </section>
                                        <div class="card-actions">
                                                {#if canPay(entry)}
                                                        {@const selectedCurrency = getSelectedCurrency(entry)}
                                                        {@const selectedCoin = getSelectedStablecoin(entry)}
                                                        {#if AVAILABLE_STABLECOINS.length > 0}
                                                                <div
                                                                        class="stablecoin-picker"
                                                                        data-stablecoin-menu={entry.request.paymentId}
                                                                >
                                                                        <button
                                                                                type="button"
                                                                                class="stablecoin-trigger"
                                                                                aria-haspopup="listbox"
                                                                                aria-expanded={openStablecoinMenu ===
                                                                                        entry.request.paymentId}
                                                                                on:click|stopPropagation={() =>
                                                                                        toggleStablecoinMenu(
                                                                                                entry.request.paymentId
                                                                                        )
                                                                                }
                                                                        >
                                                                                {#if selectedCoin?.logoUrl}
                                                                                        <img
                                                                                                class="stablecoin-icon"
                                                                                                src={selectedCoin.logoUrl}
                                                                                                alt={`${selectedCoin.symbol} logo`}
                                                                                        />
                                                                                {:else}
                                                                                        <span class="stablecoin-placeholder"
                                                                                                >{selectedCurrency.slice(0, 1)}</span
                                                                                        >
                                                                                {/if}
                                                                                <span class="stablecoin-text">
                                                                                        {selectedCoin
                                                                                                ? `${selectedCoin.symbol}`
                                                                                                : selectedCurrency}
                                                                                </span>
                                                                                <span
                                                                                        class="stablecoin-chevron"
                                                                                        aria-hidden="true"
                                                                                >
                                                                                        ▾
                                                                                </span>
                                                                        </button>
                                                                        {#if openStablecoinMenu === entry.request.paymentId}
                                                                                <ul
                                                                                        class="stablecoin-menu"
                                                                                        role="listbox"
                                                                                        aria-label="Choose stablecoin"
                                                                                >
                                                                                        {#each AVAILABLE_STABLECOINS as coin}
                                                                                                <li>
                                                                                                        <button
                                                                                                                type="button"
                                                                                                                class:active={selectedCurrency ===
                                                                                                                        coin.code}
                                                                                                                role="option"
                                                                                                                aria-selected={selectedCurrency ===
                                                                                                                        coin.code}
                                                                                                                on:click|stopPropagation={() =>
                                                                                                                        selectStablecoin(
                                                                                                                                entry.request
                                                                                                                                        .paymentId,
                                                                                                                                coin.code
                                                                                                                        )
                                                                                                                }
                                                                                                        >
                                                                                                                {#if coin.logoUrl}
                                                                                                                        <img
                                                                                                                                class="stablecoin-icon"
                                                                                                                                src={coin.logoUrl}
                                                                                                                                alt={`${coin.symbol} logo`}
                                                                                                                        />
                                                                                                                {/if}
                                                                                                                <span class="stablecoin-option-text">
                                                                                                                        <strong>{coin.symbol}</strong>
                                                                                                                        <small>{coin.name}</small>
                                                                                                                </span>
                                                                                                        </button>
                                                                                                </li>
                                                                                        {/each}
                                                                                </ul>
                                                                        {/if}
                                                                </div>
                                                        {/if}
                                                        <button
                                                                type="button"
                                                                on:click={() => payWithWallet(entry)}
                                                                disabled={actionBusy(entry)}
                                                        >
                                                                Pay with wallet
                                                        </button>
                                                {/if}
                                                {#if canVerify(entry)}
                                                        <button
                                                                type="button"
                                                                on:click={() => verifySignature(entry)}
								disabled={actionBusy(entry)}
							>
								Check status
							</button>
						{/if}
                                        </div>
					{#if actionStatus[entry.request.paymentId]}
						<p class="action-status">{actionStatus[entry.request.paymentId]}</p>
					{/if}
					{#if actionError[entry.request.paymentId]}
						<p class="error">{actionError[entry.request.paymentId]}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</article>

<style>
	.payments-page {
		display: grid;
		gap: 1.5rem;
	}

	header {
		display: grid;
		gap: 0.75rem;
	}

	header h2 {
		margin: 0;
		font-size: clamp(1.75rem, 3vw, 2.4rem);
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions button {
		border: 1px solid rgba(17, 24, 39, 0.15);
		border-radius: 0.75rem;
		padding: 0.6rem 1.25rem;
		background: white;
		font-weight: 600;
		cursor: pointer;
	}

	.actions button[disabled] {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.info {
		background: rgba(37, 99, 235, 0.1);
		color: #1d4ed8;
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
	}

	.error {
		background: rgba(239, 68, 68, 0.1);
		color: #b91c1c;
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		margin: 0;
	}

	.payment-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 1.5rem;
	}

	.payment-card {
		background: white;
		border-radius: 1rem;
		padding: clamp(1.5rem, 3vw, 2.5rem);
		box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
		border: 1px solid rgba(15, 23, 42, 0.08);
		display: grid;
		gap: 1rem;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
	}

	.card-header h3 {
		margin: 0;
		font-size: clamp(1.25rem, 2vw, 1.75rem);
	}

	.amount {
		font-weight: 700;
		color: #111827;
	}

	.status-badge {
		align-self: flex-start;
		font-size: 0.85rem;
		font-weight: 700;
		padding: 0.35rem 0.75rem;
		border-radius: 999px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.status-success {
		background: rgba(16, 185, 129, 0.15);
		color: #047857;
	}

	.status-info {
		background: rgba(37, 99, 235, 0.15);
		color: #1d4ed8;
	}

	.status-warning {
		background: rgba(251, 191, 36, 0.2);
		color: #b45309;
	}

	.status-danger {
		background: rgba(248, 113, 113, 0.2);
		color: #b91c1c;
	}

	.status-neutral {
		background: rgba(148, 163, 184, 0.2);
		color: #475569;
	}

        .status-description {
                margin: 0;
                color: #4b5563;
        }

        .auto-refresh {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                margin-top: 0.75rem;
                color: #0369a1;
                font-weight: 500;
        }

        .spinner {
                width: 1.5rem;
                height: 1.5rem;
                border-radius: 50%;
                border: 3px solid rgba(37, 99, 235, 0.2);
                border-top-color: #2563eb;
                animation: spin 0.75s linear infinite;
        }

        @keyframes spin {
                to {
                        transform: rotate(360deg);
                }
        }

        .details h4 {
                margin: 0 0 0.5rem;
                font-size: 1rem;
                color: #111827;
        }

        .responses {
                display: grid;
                gap: 0.75rem;
        }

        .rating {
                display: grid;
                gap: 0.75rem;
        }

        .responses-list {
                list-style: none;
                margin: 0;
                padding: 0;
                display: grid;
                gap: 0.75rem;
        }

        .response-item {
                background: rgba(241, 245, 249, 0.6);
                border-radius: 0.75rem;
                padding: 0.75rem 1rem;
                display: grid;
                gap: 0.35rem;
        }

        .response-item header {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: 0.75rem;
                font-size: 0.9rem;
                color: #475569;
        }

        .responder {
                font-weight: 600;
                color: #1f2937;
        }

        .response-item time {
                font-size: 0.85rem;
                color: #64748b;
        }

        .response-text {
                margin: 0;
                white-space: pre-wrap;
                color: #1f2937;
        }

        .rating-form {
                display: grid;
                gap: 0.75rem;
        }

        .rating-form label {
                display: grid;
                gap: 0.4rem;
        }

        .rating-form select,
        .rating-form textarea {
                font: inherit;
                padding: 0.6rem 0.75rem;
                border: 1px solid #d1d5db;
                border-radius: 0.65rem;
                background: #f9fafb;
        }

        .rating-form textarea {
                resize: vertical;
                min-height: 4.5rem;
        }

        .rating-form button {
                align-self: start;
                padding: 0.55rem 1.2rem;
                border-radius: 0.75rem;
                border: none;
                font-weight: 600;
                background: #111827;
                color: white;
                cursor: pointer;
        }

        .rating-form button[disabled] {
                opacity: 0.6;
                cursor: default;
        }

        .rating .success {
                margin: 0;
                color: #0f766e;
                font-weight: 600;
        }

        .details dl {
                display: grid;
                gap: 0.5rem;
                margin: 0;
	}

	.details dt {
		font-weight: 600;
		color: #4b5563;
	}

	.details dd {
		margin: 0;
		font-family:
			'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
			'Courier New', monospace;
	}

	.message-text {
		background: rgba(241, 245, 249, 0.6);
		padding: 0.75rem 1rem;
		border-radius: 0.75rem;
		white-space: pre-wrap;
		margin: 0;
	}

	.card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

        .card-actions > button {
                background: #111827;
                color: white;
                border: none;
                border-radius: 0.75rem;
                padding: 0.65rem 1.25rem;
                font-weight: 600;
                cursor: pointer;
        }

        .card-actions > button[disabled] {
                opacity: 0.6;
                cursor: not-allowed;
        }

        .stablecoin-picker {
                position: relative;
        }

        .stablecoin-trigger {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.55rem 0.9rem;
                border-radius: 0.75rem;
                border: 1px solid rgba(15, 23, 42, 0.15);
                background: white;
                color: #111827;
                font-weight: 600;
                cursor: pointer;
                min-width: 0;
        }

        .stablecoin-trigger:focus-visible {
                outline: 2px solid #2563eb;
                outline-offset: 2px;
        }

        .stablecoin-icon {
                width: 1.75rem;
                height: 1.75rem;
                border-radius: 999px;
                object-fit: cover;
        }

        .stablecoin-placeholder {
                display: grid;
                place-items: center;
                width: 1.75rem;
                height: 1.75rem;
                border-radius: 999px;
                background: #e0f2fe;
                color: #0284c7;
                font-weight: 700;
                font-size: 0.95rem;
        }

        .stablecoin-text {
                font-size: 0.95rem;
        }

        .stablecoin-chevron {
                font-size: 0.9rem;
                color: #475569;
        }

        .stablecoin-menu {
                position: absolute;
                z-index: 10;
                top: calc(100% + 0.4rem);
                left: 0;
                list-style: none;
                margin: 0;
                padding: 0.35rem;
                background: white;
                border-radius: 0.75rem;
                border: 1px solid rgba(15, 23, 42, 0.15);
                box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
                min-width: 13rem;
        }

        .stablecoin-menu li {
                margin: 0;
        }

        .stablecoin-menu button {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 0.6rem;
                border: none;
                background: transparent;
                color: #0f172a;
                padding: 0.5rem 0.6rem;
                border-radius: 0.6rem;
                cursor: pointer;
                text-align: left;
        }

        .stablecoin-menu button.active,
        .stablecoin-menu button:hover {
                background: rgba(59, 130, 246, 0.12);
        }

        .stablecoin-menu button:focus-visible {
                outline: 2px solid #2563eb;
                outline-offset: 2px;
        }

        .stablecoin-option-text {
                display: flex;
                flex-direction: column;
                gap: 0.1rem;
        }

        .stablecoin-option-text strong {
                font-size: 0.95rem;
        }

        .stablecoin-option-text small {
                font-size: 0.75rem;
                color: #475569;
        }

	.action-status {
		margin: 0;
		color: #0369a1;
	}
</style>
