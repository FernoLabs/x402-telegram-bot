import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuctionRepository } from '$lib/server/db';
import {
        parsePayment,
        buildPaymentRequiredResponse,
        readPaymentIdentification
} from '$lib/server/x402';
import { DEFAULT_SOLANA_RPC_URL, normalizeCommitment } from '$lib/server/solana';
import { getSolanaMintAddressForCurrency } from '$lib/stablecoins';
import { deliverTelegramMessage, updateMessageStatus } from '$lib/server/messages';
import type { MessageRequest, PaymentRequestRecord, PendingPaymentRecord } from '$lib/types';

interface CreateMessagePayload {
        groupId?: number;
        message?: string;
        senderName?: string;
        walletAddress?: string;
}

export const POST: RequestHandler = async ({ request, platform }) => {
        try {
                const env = platform?.env;
                if (!env?.DB) {
                        throw new Error('D1 database binding `DB` is not configured.');
                }

                let payload: CreateMessagePayload;
                try {
                        payload = (await request.json()) as CreateMessagePayload;
                } catch (error) {
                        return json({ error: 'Invalid JSON body' }, { status: 400 });
                }

                const groupId = typeof payload.groupId === 'number' ? payload.groupId : Number(payload.groupId);
                const message = typeof payload.message === 'string' ? payload.message.trim() : '';
                const senderName = typeof payload.senderName === 'string' ? payload.senderName.trim() : '';
                const walletAddress =
                        typeof payload.walletAddress === 'string' ? payload.walletAddress.trim() : '';

                if (!groupId || !Number.isFinite(groupId)) {
                        return json({ error: 'groupId is required' }, { status: 400 });
                }

                if (!message) {
                        return json({ error: 'message is required' }, { status: 400 });
                }

                if (!walletAddress) {
                        return json({ error: 'walletAddress is required' }, { status: 400 });
                }

                const repo = new AuctionRepository(env.DB);
                const envRecord = env as unknown as Record<string, unknown>;
                const group = await repo.getGroup(groupId);

                if (!group) {
                        return json({ error: 'Group not found' }, { status: 404 });
                }

                if (!group.active) {
                        return json(
                                { error: 'This group is not accepting paid messages right now.' },
                                { status: 403 }
                        );
                }

                const amount = group.minBid;
                const currency = env.PAYMENT_CURRENCY ?? 'USDC';
                const network = env.PAYMENT_NETWORK ?? 'solana';
                const recipient = env.RECEIVER_ADDRESS ?? group.ownerAddress;
                const solanaRpcUrl = env.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;
                const solanaMint = getSolanaMintAddressForCurrency(currency, envRecord);
                const solanaCommitment = normalizeCommitment(env.SOLANA_COMMITMENT);

                const identifiers = readPaymentIdentification(request);

                let paymentRequest: PaymentRequestRecord | null = null;
                let messageRequest: MessageRequest | null = null;

                if (identifiers.paymentId) {
                        paymentRequest = await repo.getPaymentRequestByPaymentId(identifiers.paymentId);
                        if (!paymentRequest) {
                                return json(
                                        {
                                                error:
                                                        'Payment request not found. Retry without x-payment-id to start a new payment request.'
                                        },
                                        { status: 404 }
                                );
                        }

                        messageRequest = await repo.getMessageRequestByPaymentId(identifiers.paymentId);
                        if (!messageRequest) {
                                return json(
                                        {
                                                error:
                                                        'Message request not found for this payment. Retry without x-payment-id to create a new one.'
                                        },
                                        { status: 404 }
                                );
                        }

                        if (paymentRequest.groupId && paymentRequest.groupId !== group.id) {
                                return json(
                                        {
                                                error: 'Payment request is associated with a different group.'
                                        },
                                        { status: 409 }
                                );
                        }

                        if (messageRequest.groupId !== group.id) {
                                return json(
                                        {
                                                error: 'Message request is associated with a different group.'
                                        },
                                        { status: 409 }
                                );
                        }

                        const expiresAt = Date.parse(paymentRequest.expiresAt);
                        const isExpired =
                                paymentRequest.status === 'expired' ||
                                (Number.isFinite(expiresAt) && expiresAt < Date.now());

                        if (isExpired) {
                                await repo.updatePaymentRequestStatus(paymentRequest.id, { status: 'expired' });
                                if (messageRequest.status !== 'sent') {
                                        await updateMessageStatus(repo, messageRequest, 'failed', {
                                                lastError: 'Payment request expired before confirmation.'
                                        });
                                }

                                return json(
                                        {
                                                error:
                                                        'Payment request expired. Submit the request again without payment headers to create a new one.'
                                        },
                                        { status: 410 }
                                );
                        }
                } else {
                        const created = await repo.createMessagePaymentRequest({
                                groupId: group.id,
                                walletAddress,
                                senderName: senderName || null,
                                message,
                                amount,
                                currency,
                                network,
                                recipient,
                                assetAddress: solanaMint ?? null,
                                assetType: solanaMint ? 'spl-token' : null,
                                expiresInSeconds: 15 * 60
                        });

                        paymentRequest = created.payment;
                        messageRequest = created.message;
                }

                if (!paymentRequest || !messageRequest) {
                        return json({ error: 'Unable to create payment request' }, { status: 500 });
                }

                if (messageRequest.walletAddress !== walletAddress) {
                        return json(
                                { error: 'walletAddress must match the original payment request.' },
                                { status: 409 }
                        );
                }

                if (messageRequest.message !== message) {
                        return json(
                                { error: 'message must match the original payment request.' },
                                { status: 409 }
                        );
                }

                const payment = await parsePayment(request, {
                        paymentDetails: {
                                amount,
                                currency,
                                recipient,
                                network
                        },
                        solana: {
                                rpcUrl: solanaRpcUrl,
                                tokenMintAddress: solanaMint,
                                commitment: solanaCommitment
                        }
                });

                if (!payment || payment.amount < amount || payment.amount <= 0) {
                        return buildPaymentRequiredResponse(paymentRequest, {
                                currencyCode: currency,
                                network,
                                groupName: group.name,
                                memo: message
                        });
                }

                if (payment.txHash) {
                        const existingPending = await repo.getPendingPaymentBySignature(payment.txHash);
                        if (existingPending && existingPending.requestId !== paymentRequest.id) {
                                return json(
                                        {
                                                error: 'Transaction signature already submitted for another payment'
                                        },
                                        { status: 409 }
                                );
                        }
                }

                let pendingRecord: PendingPaymentRecord | null = null;
                if (payment.txHash) {
                        const existing = await repo.getPendingPaymentBySignature(payment.txHash);
                        if (existing && existing.requestId === paymentRequest.id) {
                                pendingRecord =
                                        (await repo.updatePendingPayment(existing.id, {
                                                status: 'confirmed',
                                                error: null,
                                                signature: payment.txHash,
                                                payerAddress: payment.sender
                                        })) ?? existing;
                        } else {
                                pendingRecord = await repo.createPendingPayment({
                                        requestId: paymentRequest.id,
                                        signature: payment.txHash,
                                        payerAddress: payment.sender,
                                        status: 'confirmed'
                                });
                        }
                }

                const confirmedRequest = await repo.updatePaymentRequestStatus(paymentRequest.id, {
                        status: 'confirmed',
                        lastSignature: payment.txHash ?? paymentRequest.lastSignature ?? null,
                        lastPayerAddress: payment.sender ?? paymentRequest.lastPayerAddress ?? null
                });

                const deliveredMessage = await deliverTelegramMessage({
                        repo,
                        env,
                        request: confirmedRequest ?? paymentRequest,
                        message: messageRequest,
                        signature: payment.txHash ?? pendingRecord?.signature ?? null
                });

                return json(
                        {
                                payment: {
                                        request: confirmedRequest ?? paymentRequest,
                                        pending: pendingRecord,
                                        verification: payment
                                },
                                message: deliveredMessage ?? messageRequest,
                                group
                        },
                        { status: 201 }
                );
        } catch (error) {
                console.error('Failed to process message payment', error);
                return json({ error: 'Failed to process message payment' }, { status: 500 });
        }
};
