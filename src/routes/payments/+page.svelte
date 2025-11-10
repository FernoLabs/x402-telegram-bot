<script lang="ts">
        import { onDestroy } from 'svelte';
	import { PUBLIC_SOLANA_RPC_ENDPOINT } from '$lib/config';
	import { wallet } from '$lib/wallet/wallet.svelte';
	import type { MessagePaymentHistoryEntry } from '$lib/types';
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

	interface PaymentsResponse {
		payments?: MessagePaymentHistoryEntry[];
		error?: string;
	}

	interface SubmitPaymentResponse {
		payment?: MessagePaymentHistoryEntry;
		error?: string;
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

	async function buildPaymentTransaction(entry: MessagePaymentHistoryEntry) {
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
		const currency = entry.request.currency?.toUpperCase() ?? 'USDC';

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
			const mintAddress = entry.request.assetAddress;
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
			const decimals = mintInfo?.data.decimals ?? USD_DECIMALS;
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
			const { transaction } = await buildPaymentTransaction(entry);
			const signed = await wallet.signTransaction(transaction);
			setAction(entry.request.paymentId, 'Submitting transaction…');

			await submitPayment({
				paymentId: entry.request.paymentId,
				wireTransaction: signed.wireTransaction,
				signature: signed.signature,
				payer: signed.payer
			});

			setAction(entry.request.paymentId, 'Transaction submitted. Waiting for confirmation…');
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
				payer: walletAddress ?? undefined
			});
			setAction(entry.request.paymentId, 'Verification submitted.');
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

	.card-actions button {
		background: #111827;
		color: white;
		border: none;
		border-radius: 0.75rem;
		padding: 0.65rem 1.25rem;
		font-weight: 600;
		cursor: pointer;
	}

	.card-actions button[disabled] {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.action-status {
		margin: 0;
		color: #0369a1;
	}
</style>
