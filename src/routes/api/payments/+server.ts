import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuctionRepository } from '$lib/server/db';
import {
  DEFAULT_SOLANA_RPC_URL,
  normalizeCommitment,
  verifySolanaPayment,
  verifyWireTransactionSignature
} from '$lib/server/solana';

interface SubmitPaymentPayload {
  paymentId?: string;
  wireTransaction?: string;
  payer?: string | null;
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
    const tokenMintAddress = env.SOLANA_USDC_MINT_ADDRESS ?? null;
    const now = Date.now();

    const enriched = [];

    for (const record of records) {
      let verification: Awaited<ReturnType<typeof verifySolanaPayment>> | null = null;

      const expiresAt = Date.parse(record.request.expiresAt);
      if (Number.isFinite(expiresAt) && expiresAt < now && record.request.status === 'pending') {
        const expired = await repo.updatePaymentRequestStatus(record.request.id, { status: 'expired' });
        record.request = expired ?? { ...record.request, status: 'expired' };
      }

      if (
        record.pending &&
        record.pending.signature &&
        (record.pending.status === 'pending' || record.pending.status === 'submitted')
      ) {
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

    const payload = (await request.json()) as SubmitPaymentPayload;
    const paymentId = typeof payload.paymentId === 'string' ? payload.paymentId.trim() : '';
    const wireTransaction = typeof payload.wireTransaction === 'string' ? payload.wireTransaction.trim() : '';
    const payer = typeof payload.payer === 'string' ? payload.payer.trim() : null;

    if (!paymentId || !wireTransaction) {
      return json({ error: 'paymentId and wireTransaction are required' }, { status: 400 });
    }

    const repo = new AuctionRepository(env.DB);
    const requestRecord = await repo.getPaymentRequestByPaymentId(paymentId);

    if (!requestRecord) {
      return json({ error: 'Payment request not found' }, { status: 404 });
    }

    const expiresAt = Date.parse(requestRecord.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt < Date.now() && requestRecord.status === 'pending') {
      await repo.updatePaymentRequestStatus(requestRecord.id, { status: 'expired' });
      return json({ error: 'Payment request has expired' }, { status: 410 });
    }

    const verification = await verifyWireTransactionSignature({
      wireTransaction,
      expectedSigner: payer ?? undefined
    });

    if (!verification || !verification.signature) {
      return json({ error: 'Unable to verify the submitted transaction signature' }, { status: 400 });
    }

    if (payer && !verification.signers.includes(payer)) {
      return json({ error: 'Submitted transaction is not signed by the expected payer' }, { status: 400 });
    }

    const signature = verification.signature;
    const existing = signature ? await repo.getPendingPaymentBySignature(signature) : null;
    if (existing && existing.requestId !== requestRecord.id) {
      return json({ error: 'Transaction signature already submitted for another payment' }, { status: 409 });
    }

    const rpcUrl = env.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;

    const rpcResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `send-${Date.now()}`,
        method: 'sendTransaction',
        params: [wireTransaction, { encoding: 'base64', skipPreflight: false }]
      })
    });

    const rpcPayload = (await rpcResponse.json()) as {
      result?: string;
      error?: { code?: number; message?: string };
    };

    if (!rpcResponse.ok || rpcPayload.error) {
      const pendingRecord = existing
        ? await repo.updatePendingPayment(existing.id, {
            status: 'failed',
            error: rpcPayload.error?.message ?? rpcResponse.statusText,
            wireTransaction,
            payerAddress: payer ?? verification.signers[0] ?? null
          })
        : await repo.createPendingPayment({
            requestId: requestRecord.id,
            signature,
            wireTransaction,
            payerAddress: payer ?? verification.signers[0] ?? null,
            status: 'failed',
            error: rpcPayload.error?.message ?? rpcResponse.statusText
          });

      if (!pendingRecord) {
        throw new Error('Failed to persist pending payment record');
      }

      await repo.updatePaymentRequestStatus(requestRecord.id, {
        status: requestRecord.status,
        lastSignature: signature,
        lastPayerAddress: pendingRecord.payerAddress ?? null
      });

      return json(
        {
          error: 'Failed to submit transaction to Solana RPC',
          details: rpcPayload.error?.message ?? rpcResponse.statusText,
          payment: {
            request: requestRecord,
            pending: pendingRecord,
            verification: null
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
          payerAddress: payer ?? verification.signers[0] ?? null,
          signature
        })
      : await repo.createPendingPayment({
          requestId: requestRecord.id,
          signature,
          wireTransaction,
          payerAddress: payer ?? verification.signers[0] ?? null,
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

    const commitment = normalizeCommitment(env.SOLANA_COMMITMENT);
    const tokenMintAddress = env.SOLANA_USDC_MINT_ADDRESS ?? null;

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

      return json({
        payment: {
          request: confirmedRequest ?? updatedRequest ?? requestRecord,
          pending: {
            ...pendingRecord,
            status: 'confirmed',
            payerAddress: chainVerification.sender
          },
          verification: chainVerification
        }
      });
    }

    return json({
      payment: {
        request: updatedRequest ?? requestRecord,
        pending: pendingRecord,
        verification: null
      }
    });
  } catch (error) {
    console.error('Failed to submit Solana payment', error);
    return json({ error: 'Failed to submit Solana payment' }, { status: 500 });
  }
};
