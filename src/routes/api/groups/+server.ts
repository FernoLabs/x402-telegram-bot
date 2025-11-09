import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuctionRepository } from '$lib/server/db';

export const GET: RequestHandler = async ({ platform }) => {
	try {
		const env = platform?.env;
		if (!env?.DB) {
			throw new Error('D1 database binding `DB` is not configured.');
		}
		const repo = new AuctionRepository(env.DB);
		const groups = await repo.listGroups();
		return json(groups);
	} catch (error) {
		console.error('Failed to list groups', error);
		return json({ error: 'Failed to list groups' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const env = platform?.env;
		if (!env?.DB) {
			throw new Error('D1 database binding `DB` is not configured.');
		}
		const repo = new AuctionRepository(env.DB);
		const body = (await request.json()) as Partial<{
			name: string;
			category: string | null;
			telegramId: string;
			minBid: number;
			ownerAddress: string;
		}>;

		const { name, category = null, telegramId, minBid, ownerAddress } = body;

		if (!name || !telegramId || !ownerAddress || typeof minBid === 'undefined') {
			return json(
				{
					error: 'Missing required fields: name, telegramId, minBid, ownerAddress'
				},
				{ status: 400 }
			);
		}

		const parsedMinBid = Number(minBid);
		if (!Number.isFinite(parsedMinBid) || parsedMinBid <= 0) {
			return json({ error: 'minBid must be a positive number' }, { status: 400 });
		}

		const group = await repo.createGroup({
			name,
			category,
			telegramId,
			minBid: parsedMinBid,
			ownerAddress
		});

		return json(group, { status: 201 });
	} catch (error) {
		console.error('Failed to create group', error);
		return json({ error: 'Failed to create group' }, { status: 500 });
	}
};
