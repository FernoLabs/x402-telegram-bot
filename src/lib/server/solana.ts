import type { PaymentDetails } from '$lib/types';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: unknown[];
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: JsonRpcError;
}

interface RpcTokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number | null;
  uiAmountString?: string;
}

interface RpcTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: RpcTokenAmount;
}

interface RpcAccountKey {
  pubkey: string;
  signer: boolean;
  writable: boolean;
}

interface RpcInstruction {
  program: string;
  programId: string;
  accounts?: string[];
  parsed?: { type: string; info: Record<string, unknown> };
}

interface RpcTransactionMessage {
  accountKeys: RpcAccountKey[];
  instructions: RpcInstruction[];
}

interface RpcTransaction {
  message: RpcTransactionMessage;
  signatures: string[];
}

interface RpcTransactionMeta {
  err: unknown | null;
  status?: { Ok: unknown } | { Err: unknown };
  preBalances: number[];
  postBalances: number[];
  preTokenBalances?: RpcTokenBalance[];
  postTokenBalances?: RpcTokenBalance[];
}

interface RpcGetTransactionResult {
  slot: number;
  meta: RpcTransactionMeta | null;
  transaction: RpcTransaction;
  blockTime: number | null;
}

export type SolanaCommitment = 'processed' | 'confirmed' | 'finalized';

interface VerifySolanaPaymentOptions {
  signature: string;
  rpcUrl?: string;
  recipient: string;
  minAmount: number;
  expectedCurrency?: string | null;
  tokenMintAddress?: string | null;
  commitment?: SolanaCommitment;
}

interface VerifiedPaymentDetails extends PaymentDetails {
  slot: number;
  blockTime: number | null;
}

export const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const DEFAULT_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const LAMPORTS_PER_SOL = 1_000_000_000;
const EPSILON = 1e-7;

interface RpcCallOptions {
  rpcUrl?: string;
}

interface RpcCommitmentOptions extends RpcCallOptions {
  commitment?: SolanaCommitment;
}

export function normalizeCommitment(value: string | null | undefined): SolanaCommitment {
  if (value === 'processed' || value === 'finalized') {
    return value;
  }
  return 'confirmed';
}

async function callSolanaRpc<T>(
  method: string,
  params: unknown[],
  options?: RpcCallOptions
): Promise<T | null> {
  const rpcUrl = options?.rpcUrl ?? DEFAULT_SOLANA_RPC_URL;

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(buildRpcRequest(method, params))
    });

    if (!response.ok) {
      console.warn(`Solana RPC request failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const payload = (await response.json()) as JsonRpcResponse<T>;

    if (payload.error) {
      console.warn('Solana RPC responded with an error', payload.error);
      return null;
    }

    return payload.result ?? null;
  } catch (error) {
    console.error('Failed to call Solana RPC', error);
    return null;
  }
}

function buildRpcRequest(method: string, params: unknown[]): JsonRpcRequest {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
  return {
    jsonrpc: '2.0',
    id,
    method,
    params
  };
}

function parseUiTokenAmount(amount: RpcTokenAmount | undefined): number {
  if (!amount) {
    return 0;
  }

  if (typeof amount.uiAmount === 'number' && Number.isFinite(amount.uiAmount)) {
    return amount.uiAmount;
  }

  if (typeof amount.uiAmountString === 'string' && amount.uiAmountString.trim()) {
    const parsed = Number.parseFloat(amount.uiAmountString);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const raw = Number.parseFloat(amount.amount ?? '0');
  const decimals = typeof amount.decimals === 'number' ? amount.decimals : 0;
  if (Number.isNaN(raw) || decimals < 0) {
    return 0;
  }

  return raw / Math.pow(10, decimals);
}

function accumulateTokenDeltas(
  preBalances: RpcTokenBalance[] | undefined,
  postBalances: RpcTokenBalance[] | undefined,
  accountKeys: RpcAccountKey[]
): Map<string, number> {
  const deltas = new Map<string, number>();
  const preByIndex = new Map<number, RpcTokenBalance>();
  const postByIndex = new Map<number, RpcTokenBalance>();

  for (const balance of preBalances ?? []) {
    preByIndex.set(balance.accountIndex, balance);
  }

  for (const balance of postBalances ?? []) {
    postByIndex.set(balance.accountIndex, balance);
  }

  const indices = new Set<number>([
    ...Array.from(preByIndex.keys()),
    ...Array.from(postByIndex.keys())
  ]);

  for (const index of indices) {
    const pre = preByIndex.get(index);
    const post = postByIndex.get(index);
    const owner = post?.owner ?? pre?.owner ?? accountKeys[index]?.pubkey ?? null;
    if (!owner) {
      continue;
    }

    const preAmount = parseUiTokenAmount(pre?.uiTokenAmount);
    const postAmount = parseUiTokenAmount(post?.uiTokenAmount);
    const delta = postAmount - preAmount;

    if (Math.abs(delta) > EPSILON) {
      deltas.set(owner, (deltas.get(owner) ?? 0) + delta);
    }
  }

  return deltas;
}

function accumulateSolDeltas(meta: RpcTransactionMeta, accountKeys: RpcAccountKey[]): Map<string, number> {
  const deltas = new Map<string, number>();
  const { preBalances, postBalances } = meta;

  for (let i = 0; i < postBalances.length; i += 1) {
    const post = postBalances[i] ?? 0;
    const pre = preBalances[i] ?? 0;
    const changeLamports = post - pre;
    if (changeLamports === 0) {
      continue;
    }
    const owner = accountKeys[i]?.pubkey;
    if (!owner) {
      continue;
    }
    const deltaSol = changeLamports / LAMPORTS_PER_SOL;
    if (Math.abs(deltaSol) > EPSILON) {
      deltas.set(owner, (deltas.get(owner) ?? 0) + deltaSol);
    }
  }

  return deltas;
}

function resolveSender(
  deltas: Map<string, number>,
  recipient: string,
  fallbackSigner: string | null
): string | null {
  let sender: string | null = null;
  let minValue = 0;

  for (const [owner, delta] of deltas.entries()) {
    if (owner === recipient) {
      continue;
    }
    if (delta < minValue) {
      minValue = delta;
      sender = owner;
    }
  }

  if (sender) {
    return sender;
  }

  return fallbackSigner;
}

async function fetchTransaction(
  signature: string,
  rpcUrl: string,
  commitment: 'processed' | 'confirmed' | 'finalized'
): Promise<RpcGetTransactionResult | null> {
  const request = buildRpcRequest('getTransaction', [signature, { encoding: 'jsonParsed', commitment }]);

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    console.warn('Failed to fetch Solana transaction', response.status, await response.text());
    return null;
  }

  const payload = (await response.json()) as JsonRpcResponse<RpcGetTransactionResult>;
  if (payload.error) {
    console.warn('Solana RPC error', payload.error);
    return null;
  }

  return payload.result ?? null;
}

export async function verifySolanaPayment(options: VerifySolanaPaymentOptions): Promise<VerifiedPaymentDetails | null> {
  const rpcUrl = options.rpcUrl ?? DEFAULT_SOLANA_RPC_URL;
  const commitment = options.commitment ?? 'confirmed';
  const result = await fetchTransaction(options.signature, rpcUrl, commitment);

  if (!result?.meta || result.meta.err) {
    return null;
  }

  const { transaction, meta } = result;
  const accountKeys = transaction.message.accountKeys ?? [];
  const expectedCurrency = options.expectedCurrency ?? 'USDC';
  const normalizedCurrency = expectedCurrency.toUpperCase();
  let amountReceived = 0;
  let sender: string | null = null;
  let currency = normalizedCurrency;

  if (normalizedCurrency === 'SOL') {
    const solDeltas = accumulateSolDeltas(meta, accountKeys);
    const recipientDelta = solDeltas.get(options.recipient) ?? 0;
    if (recipientDelta + EPSILON < options.minAmount) {
      return null;
    }
    amountReceived = recipientDelta;
    sender = resolveSender(solDeltas, options.recipient, accountKeys.find((key) => key.signer)?.pubkey ?? null);
    currency = 'SOL';
  } else {
    const mint = options.tokenMintAddress ?? DEFAULT_USDC_MINT;
    const tokenDeltas = accumulateTokenDeltas(
      meta.preTokenBalances?.filter((balance) => balance.mint === mint),
      meta.postTokenBalances?.filter((balance) => balance.mint === mint),
      accountKeys
    );

    const recipientDelta = tokenDeltas.get(options.recipient) ?? 0;
    if (recipientDelta + EPSILON < options.minAmount) {
      return null;
    }

    amountReceived = recipientDelta;
    sender = resolveSender(tokenDeltas, options.recipient, accountKeys.find((key) => key.signer)?.pubkey ?? null);
    currency = normalizedCurrency;
  }

  if (!sender) {
    sender = accountKeys.find((key) => key.signer)?.pubkey ?? null;
  }

  if (!sender) {
    return null;
  }

  return {
    amount: amountReceived,
    sender,
    txHash: options.signature,
    currency,
    network: 'solana',
    slot: result.slot,
    blockTime: result.blockTime
  };
}

export interface LatestBlockhash {
  blockhash: string;
  lastValidBlockHeight: number;
}

export async function fetchLatestBlockhash(
  options?: RpcCommitmentOptions
): Promise<LatestBlockhash | null> {
  const config: Record<string, unknown> = {};

  if (options?.commitment) {
    config.commitment = options.commitment;
  }

  const response = await callSolanaRpc<{
    context: { slot: number };
    value: LatestBlockhash;
  }>('getLatestBlockhash', [config], { rpcUrl: options?.rpcUrl });

  if (!response || !response.value?.blockhash) {
    return null;
  }

  return response.value;
}

export async function fetchMintDecimals(
  mintAddress: string,
  options?: RpcCommitmentOptions
): Promise<number | null> {
  if (!mintAddress) {
    return null;
  }

  const config: Record<string, unknown> = {};

  if (options?.commitment) {
    config.commitment = options.commitment;
  }

  const response = await callSolanaRpc<{
    context: { slot: number };
    value: { amount: string; decimals: number };
  }>('getTokenSupply', [mintAddress, config], { rpcUrl: options?.rpcUrl });

  if (!response || typeof response.value?.decimals !== 'number') {
    return null;
  }

  return response.value.decimals;
}

export async function fetchAccountExists(
  address: string,
  options?: RpcCommitmentOptions
): Promise<boolean> {
  if (!address) {
    return false;
  }

  const config: Record<string, unknown> = { encoding: 'base64' };

  if (options?.commitment) {
    config.commitment = options.commitment;
  }

  const response = await callSolanaRpc<{
    context: { slot: number };
    value: unknown | null;
  }>('getAccountInfo', [address, config], { rpcUrl: options?.rpcUrl });

  return !!response?.value;
}

interface SubmitTransactionOptions extends RpcCommitmentOptions {
  skipPreflight?: boolean;
  maxRetries?: number;
}

export async function submitSignedTransaction(
  serializedTransaction: string,
  options?: SubmitTransactionOptions
): Promise<string | null> {
  if (!serializedTransaction) {
    return null;
  }

  const config: Record<string, unknown> = {
    skipPreflight: options?.skipPreflight ?? false
  };

  if (options?.commitment) {
    config.preflightCommitment = options.commitment;
  }

  if (typeof options?.maxRetries === 'number') {
    config.maxRetries = options.maxRetries;
  }

  const response = await callSolanaRpc<string>(
    'sendRawTransaction',
    [serializedTransaction, config],
    { rpcUrl: options?.rpcUrl }
  );

  if (!response || typeof response !== 'string') {
    return null;
  }

  return response;
}
