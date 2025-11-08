import type { PaymentDetails } from '$lib/types';

const AMOUNT_HEADERS = ['x-402-amount', 'x-payment-amount'];
const SENDER_HEADERS = ['x-402-sender', 'x-payment-sender'];
const TX_HASH_HEADERS = ['x-402-tx-hash', 'x-payment-txhash'];
const NETWORK_HEADERS = ['x-402-network', 'x-payment-network'];
const PAYMENT_PAYLOAD_HEADER = 'x-payment';
const FACILITATOR_HEADERS = ['x-payment-facilitator', 'x-402-facilitator'];
const DEFAULT_FACILITATOR_URL = 'https://facilitator.payai.network';

interface PaymentValidationOptions {
  facilitatorUrl?: string | null;
  paymentDetails?: {
    amount: number;
    currency: string;
    recipient: string;
    network: string;
  };
}

interface FacilitatorVerificationResult {
  valid: boolean;
  amount: number;
  currency: string;
  sender: string;
  network: string | null;
  txHash: string | null;
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

function normalizeFacilitatorUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function parseLegacyHeaders(request: Request): PaymentDetails | null {
  const amountHeader = readHeader(request, AMOUNT_HEADERS);
  const senderHeader = readHeader(request, SENDER_HEADERS);

  if (!amountHeader || !senderHeader) {
    return null;
  }

  const amount = Number.parseFloat(amountHeader);
  if (Number.isNaN(amount)) {
    return null;
  }

  const txHash = readHeader(request, TX_HASH_HEADERS);
  const network = readHeader(request, NETWORK_HEADERS);

  return {
    amount,
    sender: senderHeader,
    txHash: txHash ?? null,
    currency: 'USDC',
    network: network ?? 'solana'
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

function extractNetwork(payload: Record<string, unknown>, fallback: string): string {
  const candidateKeys = ['network', 'networkId'];
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
  return fallback;
}

function extractCurrency(payload: Record<string, unknown>, fallback: string): string {
  const candidateKeys = ['currency', 'currencyCode'];
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
  return fallback;
}

async function verifyWithFacilitator(
  encodedPayload: string,
  options: Required<PaymentValidationOptions>['paymentDetails'],
  facilitatorUrl: string
): Promise<FacilitatorVerificationResult | null> {
  try {
    const endpoint = `${normalizeFacilitatorUrl(facilitatorUrl)}/verify`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: encodedPayload,
        paymentDetails: {
          amount: options.amount,
          currencyCode: options.currency,
          recipient: options.recipient,
          networkId: options.network
        }
      })
    });

    if (!response.ok) {
      console.warn('Facilitator verify request failed', response.status, await response.text());
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown> | null;
    if (!payload || payload.error) {
      return null;
    }

    const isValid =
      payload.valid === true ||
      payload.status === 'confirmed' ||
      payload.status === 'settled' ||
      payload.state === 'verified' ||
      (typeof payload.valid === 'undefined' && !('invalid' in payload));

    if (!isValid) {
      return null;
    }

    const amountCandidates = [payload.amount, payload.amountReceived, payload.value, payload.paymentAmount];
    const nestedPayment = payload.payment;
    if (nestedPayment && typeof nestedPayment === 'object') {
      const nested = nestedPayment as Record<string, unknown>;
      amountCandidates.push(nested.amount, nested.value, nested.amountReceived);
    }
    let resolvedAmount = Number.NaN;
    for (const candidate of amountCandidates) {
      if (typeof candidate === 'number') {
        resolvedAmount = candidate;
        break;
      }
      if (typeof candidate === 'string' && candidate.trim()) {
        const parsed = Number.parseFloat(candidate);
        if (!Number.isNaN(parsed)) {
          resolvedAmount = parsed;
          break;
        }
      }
    }

    if (Number.isNaN(resolvedAmount)) {
      resolvedAmount = options.amount;
    }

    const sender = extractSender(payload) ?? 'unknown';
    const txHash = extractTxHash(payload);
    const network = extractNetwork(payload, options.network);
    const currency = extractCurrency(payload, options.currency);

    return {
      valid: true,
      amount: resolvedAmount,
      currency,
      sender,
      network,
      txHash: txHash ?? null
    };
  } catch (error) {
    console.error('Failed to verify payment with facilitator', error);
    return null;
  }
}

export async function parsePayment(
  request: Request,
  options?: PaymentValidationOptions
): Promise<PaymentDetails | null> {
  const legacy = parseLegacyHeaders(request);
  if (legacy) {
    return legacy;
  }

  const encodedPayload = request.headers.get(PAYMENT_PAYLOAD_HEADER);
  if (!encodedPayload || !options?.paymentDetails) {
    return null;
  }

  const facilitatorOverride = readHeader(request, FACILITATOR_HEADERS);
  const facilitatorUrl =
    facilitatorOverride && facilitatorOverride.trim().length > 0
      ? facilitatorOverride
      : options.facilitatorUrl ?? DEFAULT_FACILITATOR_URL;
  const result = await verifyWithFacilitator(encodedPayload, options.paymentDetails, facilitatorUrl);
  if (!result) {
    return null;
  }

  return {
    amount: result.amount,
    sender: result.sender,
    txHash: result.txHash,
    currency: typeof result.currency === 'string' ? result.currency.toUpperCase() : result.currency,
    network: result.network
  };
}

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
  facilitatorUrl?: string | null,
  extras?: PaymentResponseExtras
): Response {
  const normalizedFacilitator = facilitatorUrl ? normalizeFacilitatorUrl(facilitatorUrl) : DEFAULT_FACILITATOR_URL;
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

  const checkoutUrl = new URL('https://payai.network/pay');
  checkoutUrl.searchParams.set('amount', requiredAmount.toString());
  checkoutUrl.searchParams.set('recipient', receiverAddress);
  checkoutUrl.searchParams.set('currency', currencyCode);
  checkoutUrl.searchParams.set('network', network);
  checkoutUrl.searchParams.set('facilitator', normalizedFacilitator);
  checkoutUrl.searchParams.set('paymentId', paymentId);
  checkoutUrl.searchParams.set('nonce', nonce);

  if (extras?.groupName) {
    checkoutUrl.searchParams.set('group', extras.groupName);
  }

  if (memo) {
    checkoutUrl.searchParams.set('memo', memo);
  }

  const body: Record<string, unknown> = {
    error: 'Payment Required',
    amount: requiredAmount,
    currency: currencyCode,
    recipient: receiverAddress,
    network,
    facilitator: normalizedFacilitator,
    checkoutUrl: checkoutUrl.toString(),
    instructions:
      'Resubmit the request with the X-PAYMENT header after funding the transfer using an x402 facilitator.',
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
        assetType: assetType ?? undefined
      },
      {
        scheme: 'facilitator',
        facilitator: normalizedFacilitator,
        url: checkoutUrl.toString(),
        paymentId,
        nonce
      }
    ]
  };

  if (extras?.groupName) {
    body.groupName = extras.groupName;
  }

  if (memo) {
    body.memo = memo;
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-payment-required': 'true',
    'x-payment-amount': requiredAmount.toString(),
    'x-payment-currency': currencyCode,
    'x-payment-recipient': receiverAddress,
    'x-payment-network': network,
    'x-payment-facilitator': normalizedFacilitator,
    'x-payment-checkout': checkoutUrl.toString(),
    'x-402-required': 'true',
    'x-402-amount': requiredAmount.toString(),
    'x-402-currency': currencyCode,
    'x-402-recipient': receiverAddress,
    'x-402-network': network,
    'x-402-facilitator': normalizedFacilitator,
    'x-402-checkout': checkoutUrl.toString(),
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
