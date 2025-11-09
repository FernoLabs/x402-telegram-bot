import type { PaymentDetails } from '$lib/types';
import { verifySolanaPayment, verifyWireTransactionSignature } from './solana';

const AMOUNT_HEADERS = ['x-402-amount', 'x-payment-amount'];
const SENDER_HEADERS = ['x-402-sender', 'x-payment-sender'];
const TX_HASH_HEADERS = ['x-402-tx-hash', 'x-payment-txhash'];
const NETWORK_HEADERS = ['x-402-network', 'x-payment-network'];
const PAYMENT_PAYLOAD_HEADER = 'x-payment';

interface PaymentValidationOptions {
  paymentDetails?: {
    amount: number;
    currency: string;
    recipient: string;
    network: string;
  };
  solana?: {
    rpcUrl: string;
    tokenMintAddress?: string | null;
    commitment?: 'processed' | 'confirmed' | 'finalized';
  };
}

function readHeader(request: Request, keys: string[]): string | null {
  for (const key of keys) {
    const value = request.headers.get(key);
    if (value) {
      return value;
    }
  }
  return null;
}

interface LegacyHeaderValues {
  amount: number | null;
  sender: string | null;
  txHash: string | null;
  network: string | null;
}

function parseLegacyHeaders(request: Request): LegacyHeaderValues {
  const amountHeader = readHeader(request, AMOUNT_HEADERS);
  const senderHeader = readHeader(request, SENDER_HEADERS);
  const txHashHeader = readHeader(request, TX_HASH_HEADERS);
  const networkHeader = readHeader(request, NETWORK_HEADERS);

  const amount = amountHeader ? Number.parseFloat(amountHeader) : Number.NaN;

  return {
    amount: Number.isNaN(amount) ? null : amount,
    sender: senderHeader,
    txHash: txHashHeader,
    network: networkHeader
  };
}

function extractSender(payload: Record<string, unknown>): string | null {
  const candidateKeys = ['payer', 'sender', 'payerAddress', 'owner', 'from'];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  const nested = payload.payment;
  if (nested && typeof nested === 'object') {
    for (const key of candidateKeys) {
      const value = (nested as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }
  return null;
}

function extractTxHash(payload: Record<string, unknown>): string | null {
  const candidateKeys = ['txHash', 'transactionSignature', 'signature', 'hash'];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  const nested = payload.payment;
  if (nested && typeof nested === 'object') {
    for (const key of candidateKeys) {
      const value = (nested as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }
  return null;
}

function extractWireTransaction(payload: Record<string, unknown>): string | null {
  const candidateKeys = ['transaction', 'wireTransaction', 'serializedTransaction'];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  const nested = payload.payment;
  if (nested && typeof nested === 'object') {
    for (const key of candidateKeys) {
      const value = (nested as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }

  return null;
}

export async function parsePayment(
  request: Request,
  options?: PaymentValidationOptions
): Promise<PaymentDetails | null> {
  const legacy = parseLegacyHeaders(request);

  if (!options?.paymentDetails) {
    if (legacy.amount !== null && legacy.sender) {
      return {
        amount: legacy.amount,
        sender: legacy.sender,
        txHash: legacy.txHash,
        currency: 'USDC',
        network: legacy.network ?? 'solana'
      };
    }

    return null;
  }

  const encodedPayload = request.headers.get(PAYMENT_PAYLOAD_HEADER);
  let payload: Record<string, unknown> | null = null;

  if (encodedPayload) {
    try {
      const normalized = encodedPayload.replace(/\s+/g, '');
      const restored = normalized.replace(/-/g, '+').replace(/_/g, '/');
      const padding = restored.length % 4 === 0 ? 0 : 4 - (restored.length % 4);
      const padded = restored + '='.repeat(padding);
      const decoded = atob(padded);
      payload = JSON.parse(decoded) as Record<string, unknown>;
    } catch (error) {
      console.warn('Failed to decode x-payment payload', error);
      payload = null;
    }
  }

  const txHashFromPayload = payload ? extractTxHash(payload) : null;
  const wireTransaction = payload ? extractWireTransaction(payload) : null;
  const txHash = txHashFromPayload ?? legacy.txHash;

  const expectedNetwork = options.paymentDetails.network?.toLowerCase();
  const expectedCurrency = options.paymentDetails.currency?.toUpperCase();

  if (expectedNetwork === 'solana' && txHash) {
    const senderFromPayload = payload ? extractSender(payload) : null;
    let wireSignatureVerification: Awaited<ReturnType<typeof verifyWireTransactionSignature>> | null = null;

    if (wireTransaction) {
      wireSignatureVerification = await verifyWireTransactionSignature({
        wireTransaction,
        expectedSignature: txHash,
        expectedSigner: senderFromPayload ?? legacy.sender
      });

      if (!wireSignatureVerification) {
        return null;
      }
    }

    const verification = await verifySolanaPayment({
      signature: txHash,
      rpcUrl: options.solana?.rpcUrl,
      recipient: options.paymentDetails.recipient,
      minAmount: options.paymentDetails.amount,
      expectedCurrency,
      tokenMintAddress: options.solana?.tokenMintAddress ?? null,
      commitment: options.solana?.commitment ?? 'confirmed'
    });

    if (!verification) {
      return null;
    }

    if (
      wireSignatureVerification &&
      !wireSignatureVerification.signers.includes(verification.sender)
    ) {
      return null;
    }

    const senderFromTransaction = wireSignatureVerification?.signers[0] ?? null;
    const resolvedSender =
      senderFromPayload ?? legacy.sender ?? senderFromTransaction ?? verification.sender;

    return {
      amount: verification.amount,
      sender: resolvedSender ?? verification.sender,
      txHash,
      currency: expectedCurrency ?? verification.currency,
      network: 'solana'
    };
  }

  if (legacy.amount !== null && legacy.sender && legacy.amount >= options.paymentDetails.amount) {
    return {
      amount: legacy.amount,
      sender: legacy.sender,
      txHash: legacy.txHash,
      currency: expectedCurrency ?? options.paymentDetails.currency,
      network: legacy.network ?? options.paymentDetails.network
    };
  }

  return null;
}

const DEFAULT_FACILITATOR_URL = 'https://facilitator.payai.network/pay';

interface PaymentResponseExtras {
  currencyCode?: string;
  network?: string;
  groupName?: string;
  memo?: string | null;
  assetAddress?: string | null;
  assetType?: string | null;
  resource?: string | null;
  description?: string | null;
  expiresInSeconds?: number;
  checkoutUrl?: string | null;
  facilitatorUrl?: string | null;
}

function sanitizeMemo(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return null;
  }

  return compact.slice(0, 120);
}

export function buildPaymentRequiredResponse(
  requiredAmount: number,
  receiverAddress: string,
  extras?: PaymentResponseExtras
): Response {
  const network = extras?.network ?? 'solana';
  const currencyCode = extras?.currencyCode ?? 'USDC';
  const assetAddress = extras?.assetAddress ?? null;
  const assetType = extras?.assetType ?? null;
  const memo = sanitizeMemo(extras?.memo);
  const resource = extras?.resource ?? '/api/auctions';
  const description = extras?.description ??
    `Payment required to post a message to ${extras?.groupName ?? 'the selected group'}.`;
  const paymentId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}`;
  const nonce = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const expiresInSeconds = extras?.expiresInSeconds ?? 10 * 60;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const checkoutUrl = extras?.checkoutUrl ?? null;
  const facilitatorUrl =
    extras?.facilitatorUrl === null
      ? null
      : extras?.facilitatorUrl ?? DEFAULT_FACILITATOR_URL;

  const body: Record<string, unknown> = {
    error: 'Payment Required',
    amount: requiredAmount,
    currency: currencyCode,
    recipient: receiverAddress,
    network,
    instructions:
      memo
        ? `Send ${requiredAmount} ${currencyCode} on ${network} to ${receiverAddress} with memo "${memo}". Include the transaction signature in the X-PAYMENT-TXHASH header when resubmitting.`
        : `Send ${requiredAmount} ${currencyCode} on ${network} to ${receiverAddress}. Include the transaction signature in the X-PAYMENT-TXHASH header when resubmitting.`,
    maxAmountRequired: requiredAmount,
    currencyCode,
    paymentAddress: receiverAddress,
    assetAddress: assetAddress ?? undefined,
    assetType: assetType ?? undefined,
    networkId: network,
    paymentId,
    nonce,
    expiresAt,
    resource,
    description,
    accepts: [
      {
        scheme: 'onchain-transfer',
        networkId: network,
        currencyCode,
        amount: requiredAmount,
        recipient: receiverAddress,
        assetAddress: assetAddress ?? undefined,
        assetType: assetType ?? undefined,
        memo: memo ?? undefined
      }
    ]
  };

  if (extras?.groupName) {
    body.groupName = extras.groupName;
  }

  if (checkoutUrl) {
    body.checkout = checkoutUrl;
  }

  if (facilitatorUrl) {
    body.facilitator = facilitatorUrl;
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-payment-required': 'true',
    'x-payment-amount': requiredAmount.toString(),
    'x-payment-currency': currencyCode,
    'x-payment-recipient': receiverAddress,
    'x-payment-network': network,
    'x-402-required': 'true',
    'x-402-amount': requiredAmount.toString(),
    'x-402-currency': currencyCode,
    'x-402-recipient': receiverAddress,
    'x-402-network': network,
    'x-payment-max-amount': requiredAmount.toString(),
    'x-payment-id': paymentId,
    'x-payment-nonce': nonce,
    'x-payment-expires-at': expiresAt,
    'x-402-max-amount': requiredAmount.toString(),
    'x-402-payment-id': paymentId,
    'x-402-nonce': nonce,
    'x-402-expires-at': expiresAt
  };

  if (memo) {
    body.memo = memo;
    headers['x-payment-memo'] = memo;
    headers['x-402-memo'] = memo;
  }

  if (assetAddress) {
    headers['x-payment-asset-address'] = assetAddress;
    headers['x-402-asset-address'] = assetAddress;
  }

  if (assetType) {
    headers['x-payment-asset-type'] = assetType;
    headers['x-402-asset-type'] = assetType;
  }

  return new Response(JSON.stringify(body), {
    status: 402,
    headers
  });
}
