import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuctionRepository } from '$lib/server/db';
import {
	DEFAULT_SOLANA_RPC_URL,
	normalizeCommitment,
	verifySolanaPayment,
	verifyWireTransactionSignature
} from '$lib/server/solana';
import { deliverTelegramMessage, updateMessageStatus } from '$lib/server/messages';
import { createSolanaRpc } from '@solana/kit';
import type { Base64EncodedWireTransaction } from '@solana/transactions';
import type { MessageRequest, MessageRequestStatus } from '$lib/types';
import { getSolanaMintAddressForCurrency, getStablecoinMetadata } from '$lib/stablecoins';

interface SubmitPaymentPayload {
        paymentId?: string;
        wireTransaction?: string;
        signature?: string;
        payer?: string | null;
        currency?: string;
}

export const GET: RequestHandler = async ({ url, platform }) => {
	try {
		const env = platform?.env;
		if (!env?.DB) {
			throw new Error('D1 database binding `DB` is not configured.');
		}

		const wallet = url.searchParams.get('wallet');
		if (!wallet || !wallet.trim()) {
			return json({ error: 'wallet query parameter is required' }, { status: 400 });
		}

                const repo = new AuctionRepository(env.DB);
                const records = await repo.listPaymentsForWallet(wallet.trim());

                const rpcUrl = env.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;
                const commitment = normalizeCommitment(env.SOLANA_COMMITMENT);
                const envRecord = env as unknown as Record<string, unknown>;
                const now = Date.now();

		const enriched = [];

		for (const record of records) {
			let verification: Awaited<ReturnType<typeof verifySolanaPayment>> | null = null;
			const messageRecord = record.message ?? null;

			const expiresAt = Date.parse(record.request.expiresAt);
			if (Number.isFinite(expiresAt) && expiresAt < now && record.request.status === 'pending') {
				const expired = await repo.updatePaymentRequestStatus(record.request.id, {
					status: 'expired'
				});
				record.request = expired ?? { ...record.request, status: 'expired' };

				if (messageRecord && messageRecord.status !== 'sent') {
					const failed = await updateMessageStatus(repo, messageRecord, 'failed', {
						lastError: 'Payment request expired before confirmation.'
					});
					record.message = failed ?? messageRecord;
				}
			}

                        if (
                                record.pending &&
                                record.pending.signature &&
                                (record.pending.status === 'pending' || record.pending.status === 'submitted')
                        ) {
                                const tokenMintAddress = getSolanaMintAddressForCurrency(
                                        record.request.currency,
                                        envRecord
                                );
                                verification = await verifySolanaPayment({
                                        signature: record.pending.signature,
                                        rpcUrl,
                                        recipient: record.request.recipient,
                                        minAmount: record.request.amount,
					expectedCurrency: record.request.currency,
					tokenMintAddress,
					commitment
				});

				if (verification) {
					const confirmedPending = await repo.updatePendingPayment(record.pending.id, {
						status: 'confirmed',
						error: null,
						payerAddress: verification.sender
					});
					const confirmedRequest = await repo.updatePaymentRequestStatus(record.request.id, {
						status: 'confirmed',
						lastSignature: verification.txHash,
						lastPayerAddress: verification.sender
					});
					if (confirmedPending) {
						record.pending = confirmedPending;
					} else {
						record.pending = {
							...record.pending,
							status: 'confirmed',
							error: null,
							payerAddress: verification.sender,
							updatedAt: new Date().toISOString()
						};
					}
					if (confirmedRequest) {
						record.request = confirmedRequest;
					} else {
						record.request = {
							...record.request,
							status: 'confirmed',
							lastSignature: verification.txHash,
							lastPayerAddress: verification.sender,
							updatedAt: new Date().toISOString()
						};
					}

					if (messageRecord) {
						const delivered = await deliverTelegramMessage({
							repo,
							env,
							request: record.request,
							message: record.message ?? messageRecord,
							signature: verification.txHash ?? record.pending.signature
						});
						record.message = delivered ?? messageRecord;
					}
				}
			}

			enriched.push({ ...record, verification });
		}

		return json({ payments: enriched });
	} catch (error) {
		console.error('Failed to load payment history', error);
		return json({ error: 'Failed to load payment history' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const env = platform?.env;
		if (!env?.DB) {
			throw new Error('D1 database binding `DB` is not configured.');
		}

                const envRecord = env as unknown as Record<string, unknown>;

                const payload = (await request.json()) as SubmitPaymentPayload;
                const paymentId = typeof payload.paymentId === 'string' ? payload.paymentId.trim() : '';
                const wireTransaction =
                        typeof payload.wireTransaction === 'string' ? payload.wireTransaction.trim() : '';
                const submittedSignature =
                        typeof payload.signature === 'string' ? payload.signature.trim() : '';
                const payer = typeof payload.payer === 'string' ? payload.payer.trim() : null;
                const currencyInput =
                        typeof payload.currency === 'string' ? payload.currency.trim().toUpperCase() : '';
                const currencyMetadata = currencyInput ? getStablecoinMetadata(currencyInput) : null;
                if (currencyInput && !currencyMetadata) {
                        return json({ error: 'Unsupported stablecoin selection' }, { status: 400 });
                }
                if (currencyMetadata && !currencyMetadata.defaultMint) {
                        return json({ error: 'Stablecoin is not available on Solana' }, { status: 400 });
                }
                if (!paymentId) {
                        return json({ error: 'paymentId is required' }, { status: 400 });
                }

                if (!wireTransaction && !submittedSignature) {
			return json({ error: 'paymentId and a transaction payload are required' }, { status: 400 });
		}

                const repo = new AuctionRepository(env.DB);
                let requestRecord = await repo.getPaymentRequestByPaymentId(paymentId);

                if (!requestRecord) {
                        return json({ error: 'Payment request not found' }, { status: 404 });
                }

                if (currencyMetadata) {
                        const normalizedCurrency = currencyMetadata.code;
                        const tokenMintOverride = getSolanaMintAddressForCurrency(
                                normalizedCurrency,
                                envRecord
                        );

                        if (!tokenMintOverride) {
                                return json({ error: 'Stablecoin mint not configured' }, { status: 400 });
                        }

                        if (
                                requestRecord.currency !== normalizedCurrency ||
                                requestRecord.assetAddress !== tokenMintOverride ||
                                requestRecord.assetType !== 'spl-token'
                        ) {
                                const updated = await repo.updatePaymentRequestCurrency(requestRecord.id, {
                                        currency: normalizedCurrency,
                                        assetAddress: tokenMintOverride,
                                        assetType: 'spl-token'
                                });
                                if (updated) {
                                        requestRecord = updated;
                                } else {
                                        requestRecord = {
                                                ...requestRecord,
                                                currency: normalizedCurrency,
                                                assetAddress: tokenMintOverride,
                                                assetType: 'spl-token',
                                                updatedAt: new Date().toISOString()
                                        };
                                }
                        }
                }

                const messageRecord = await repo.getMessageRequestByPaymentId(paymentId);

		const expiresAt = Date.parse(requestRecord.expiresAt);
		if (
			Number.isFinite(expiresAt) &&
			expiresAt < Date.now() &&
			requestRecord.status === 'pending'
		) {
			await repo.updatePaymentRequestStatus(requestRecord.id, { status: 'expired' });
			return json({ error: 'Payment request has expired' }, { status: 410 });
		}

		let signature = submittedSignature;
		let verification: Awaited<ReturnType<typeof verifyWireTransactionSignature>> | null = null;

		if (wireTransaction) {
			verification = await verifyWireTransactionSignature({
				wireTransaction,
				expectedSignature: submittedSignature || undefined,
				expectedSigner: payer ?? undefined
			});

			if (!verification || !verification.signature) {
				return json(
					{ error: 'Unable to verify the submitted transaction signature' },
					{ status: 400 }
				);
			}

			if (payer && !verification.signers.includes(payer)) {
				return json(
					{ error: 'Submitted transaction is not signed by the expected payer' },
					{ status: 400 }
				);
			}

			signature = verification.signature;
		} else if (!signature) {
			return json({ error: 'A transaction signature is required' }, { status: 400 });
		}

		const existing = signature ? await repo.getPendingPaymentBySignature(signature) : null;
		if (existing && existing.requestId !== requestRecord.id) {
			return json(
				{ error: 'Transaction signature already submitted for another payment' },
				{ status: 409 }
			);
		}

		const rpcUrl = env.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;

		if (!wireTransaction) {
			const pendingRecord = existing
				? await repo.updatePendingPayment(existing.id, {
						status: 'submitted',
						error: null,
						wireTransaction: null,
						signature,
						payerAddress: payer ?? existing.payerAddress ?? null
					})
				: await repo.createPendingPayment({
						requestId: requestRecord.id,
						signature,
						wireTransaction: null,
						payerAddress: payer ?? null,
						status: 'submitted'
					});

			if (!pendingRecord) {
				throw new Error('Failed to persist pending payment record');
			}

			const updatedRequest = await repo.updatePaymentRequestStatus(requestRecord.id, {
				status: 'submitted',
				lastSignature: signature,
				lastPayerAddress: pendingRecord.payerAddress ?? null
			});

			if (messageRecord) {
				await updateMessageStatus(repo, messageRecord, 'signature_saved', { lastError: null });
			}

                        const commitment = normalizeCommitment(env.SOLANA_COMMITMENT);
                        const tokenMintAddress = getSolanaMintAddressForCurrency(
                                requestRecord.currency,
                                envRecord
                        );

			const chainVerification = await verifySolanaPayment({
				signature,
				rpcUrl,
				recipient: requestRecord.recipient,
				minAmount: requestRecord.amount,
				expectedCurrency: requestRecord.currency,
				tokenMintAddress,
				commitment
			});

			if (chainVerification) {
				const confirmedPending = await repo.updatePendingPayment(pendingRecord.id, {
					status: 'confirmed',
					error: null,
					payerAddress: chainVerification.sender
				});
				const confirmedRequest = await repo.updatePaymentRequestStatus(requestRecord.id, {
					status: 'confirmed',
					lastSignature: chainVerification.txHash,
					lastPayerAddress: chainVerification.sender
				});

				let deliveredMessage = messageRecord ?? null;
				if (messageRecord) {
					deliveredMessage =
						(await deliverTelegramMessage({
							repo,
							env,
							request: confirmedRequest ?? updatedRequest ?? requestRecord,
							message: messageRecord,
							signature: chainVerification.txHash ?? signature
						})) ?? messageRecord;
				}

				return json({
					payment: {
						request: confirmedRequest ?? updatedRequest ?? requestRecord,
						pending: confirmedPending ?? pendingRecord,
						verification: chainVerification,
						message: deliveredMessage
					}
				});
			}

			return json({
				payment: {
					request: updatedRequest ?? requestRecord,
					pending: pendingRecord,
					verification: null,
					message: messageRecord
				}
			});
		}

		const rpc = createSolanaRpc(rpcUrl);

		try {
			const encodedTransaction = wireTransaction as Base64EncodedWireTransaction;
			await rpc
				.sendTransaction(encodedTransaction, { encoding: 'base64', skipPreflight: false })
				.send();
		} catch (rpcError) {
			const errorMessage =
				rpcError instanceof Error ? rpcError.message : 'Failed to submit transaction to Solana RPC';
			const pendingRecord = existing
				? await repo.updatePendingPayment(existing.id, {
						status: 'failed',
						error: errorMessage,
						wireTransaction,
						payerAddress: payer ?? verification?.signers?.[0] ?? null
					})
				: await repo.createPendingPayment({
						requestId: requestRecord.id,
						signature,
						wireTransaction,
						payerAddress: payer ?? verification?.signers?.[0] ?? null,
						status: 'failed',
						error: errorMessage
					});

			if (!pendingRecord) {
				throw new Error('Failed to persist pending payment record');
			}

			await repo.updatePaymentRequestStatus(requestRecord.id, {
				status: requestRecord.status,
				lastSignature: signature,
				lastPayerAddress: pendingRecord.payerAddress ?? null
			});

			if (messageRecord) {
				await updateMessageStatus(repo, messageRecord, 'failed', {
					lastError: errorMessage
				});
			}

			return json(
				{
					error: 'Failed to submit transaction to Solana RPC',
					details: errorMessage,
					payment: {
						request: requestRecord,
						pending: pendingRecord,
						verification: null,
						message: messageRecord
					}
				},
				{ status: 502 }
			);
		}

		const pendingRecord = existing
			? await repo.updatePendingPayment(existing.id, {
					status: 'submitted',
					error: null,
					wireTransaction,
					payerAddress: payer ?? verification?.signers[0] ?? null,
					signature
				})
			: await repo.createPendingPayment({
					requestId: requestRecord.id,
					signature,
					wireTransaction,
					payerAddress: payer ?? verification?.signers[0] ?? null,
					status: 'submitted'
				});

		if (!pendingRecord) {
			throw new Error('Failed to persist pending payment record');
		}

		const updatedRequest = await repo.updatePaymentRequestStatus(requestRecord.id, {
			status: 'submitted',
			lastSignature: signature,
			lastPayerAddress: pendingRecord.payerAddress ?? null
		});

		if (messageRecord) {
			await updateMessageStatus(repo, messageRecord, 'signature_saved', { lastError: null });
		}

                const commitment = normalizeCommitment(env.SOLANA_COMMITMENT);
                const tokenMintAddress = getSolanaMintAddressForCurrency(
                        requestRecord.currency,
                        envRecord
                );

		const chainVerification = await verifySolanaPayment({
			signature,
			rpcUrl,
			recipient: requestRecord.recipient,
			minAmount: requestRecord.amount,
			expectedCurrency: requestRecord.currency,
			tokenMintAddress,
			commitment
		});

		if (chainVerification) {
			await repo.updatePendingPayment(pendingRecord.id, {
				status: 'confirmed',
				error: null,
				payerAddress: chainVerification.sender
			});
			const confirmedRequest = await repo.updatePaymentRequestStatus(requestRecord.id, {
				status: 'confirmed',
				lastSignature: chainVerification.txHash,
				lastPayerAddress: chainVerification.sender
			});

			let deliveredMessage = messageRecord ?? null;
			if (messageRecord) {
				deliveredMessage =
					(await deliverTelegramMessage({
						repo,
						env,
						request: confirmedRequest ?? updatedRequest ?? requestRecord,
						message: messageRecord,
						signature: chainVerification.txHash ?? signature
					})) ?? messageRecord;
			}

			return json({
				payment: {
					request: confirmedRequest ?? updatedRequest ?? requestRecord,
					pending: {
						...pendingRecord,
						status: 'confirmed',
						payerAddress: chainVerification.sender
					},
					verification: chainVerification,
					message: deliveredMessage
				}
			});
		}

		return json({
			payment: {
				request: updatedRequest ?? requestRecord,
				pending: pendingRecord,
				verification: null,
				message: messageRecord
			}
		});
	} catch (error) {
		console.error('Failed to submit Solana payment', error);
		return json({ error: 'Failed to submit Solana payment' }, { status: 500 });
	}
};
