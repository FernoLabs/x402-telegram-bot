import { DEFAULT_SOLANA_RPC_URL, normalizeCommitment } from '$lib/server/solana';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id: string | number | null;
	method: string;
	params?: unknown[];
}

const BLOCKHASH_CACHE_TTL_MS = 1_000;

interface BlockhashCacheEntry {
	commitment: string;
	expiresAt: number;
	result: unknown;
}

let cachedBlockhash: BlockhashCacheEntry | null = null;

function buildResponse(body: string, status = 200, contentType = 'application/json'): Response {
	return new Response(body, {
		status,
		headers: {
			'content-type': contentType
		}
	});
}

async function forwardRequest(
	rpcUrl: string,
	payload: JsonRpcRequest | JsonRpcRequest[]
): Promise<Response> {
	const upstream = await fetch(rpcUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});

	const text = await upstream.text();
	const contentType = upstream.headers.get('content-type') ?? 'application/json';
	return buildResponse(text, upstream.status, contentType);
}

function extractCommitment(params: unknown[] | undefined): string {
	if (!params || params.length === 0) {
		return 'confirmed';
	}

	const [firstParam] = params;
	if (firstParam && typeof firstParam === 'object') {
		const commitment = (firstParam as Record<string, unknown>).commitment;
		if (typeof commitment === 'string') {
			return normalizeCommitment(commitment);
		}
	}

	return 'confirmed';
}

export const POST: RequestHandler = async ({ request, platform }) => {
	let payload: JsonRpcRequest | JsonRpcRequest[];

	try {
		payload = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];
	} catch (error) {
		console.warn('Invalid Solana RPC payload', error);
		return json({ error: 'Invalid JSON-RPC payload' }, { status: 400 });
	}

	const rpcUrl = platform?.env?.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL;

	if (Array.isArray(payload)) {
		// For batch requests, forward without caching.
		return forwardRequest(rpcUrl, payload);
	}

	if (payload.method === 'getLatestBlockhash') {
		const commitment = extractCommitment(payload.params);
		const now = Date.now();

		if (
			cachedBlockhash &&
			cachedBlockhash.commitment === commitment &&
			cachedBlockhash.expiresAt > now
		) {
			return buildResponse(
				JSON.stringify({ jsonrpc: '2.0', id: payload.id ?? null, result: cachedBlockhash.result })
			);
		}

		const upstreamResponse = await forwardRequest(rpcUrl, payload);
		if (upstreamResponse.ok) {
			try {
				const parsed = (await upstreamResponse.clone().json()) as {
					result?: unknown;
					error?: unknown;
				};

				if (parsed && 'result' in parsed && !('error' in parsed && parsed.error)) {
					cachedBlockhash = {
						commitment,
						expiresAt: now + BLOCKHASH_CACHE_TTL_MS,
						result: parsed.result
					};
				}
			} catch (error) {
				console.warn('Failed to parse upstream blockhash response', error);
			}
		}

		return upstreamResponse;
	}

	return forwardRequest(rpcUrl, payload);
};
