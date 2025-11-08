import type { PaymentDetails } from '$lib/types';

const AMOUNT_HEADERS = ['x-402-amount', 'x-payment-amount'];
const SENDER_HEADERS = ['x-402-sender', 'x-payment-sender'];
const TX_HASH_HEADERS = ['x-402-tx-hash', 'x-payment-txhash'];
const NETWORK_HEADERS = ['x-402-network', 'x-payment-network'];

function readHeader(request: Request, keys: string[]): string | null {
  for (const key of keys) {
    const value = request.headers.get(key);
    if (value) {
      return value;
    }
  }
  return null;
}

export function parsePayment(request: Request): PaymentDetails | null {
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
    network
  };
}

export function buildPaymentRequiredResponse(requiredAmount: number, receiverAddress: string): Response {
  return new Response(
    JSON.stringify({
      error: 'Payment Required',
      amount: requiredAmount,
      currency: 'USDC',
      recipient: receiverAddress,
      network: 'base',
      instructions: 'Resubmit the request with x-402 headers after transferring USDC on Base.'
    }),
    {
      status: 402,
      headers: {
        'content-type': 'application/json',
        'x-payment-required': 'true',
        'x-payment-amount': requiredAmount.toString(),
        'x-payment-currency': 'USDC',
        'x-payment-recipient': receiverAddress,
        'x-payment-network': 'base'
      }
    }
  );
}
