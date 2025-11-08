import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import type { AuctionResponse } from '$lib/types';

export const GET: RequestHandler = async ({ params }) => {
  const auctionId = Number(params.id);
  if (Number.isNaN(auctionId)) {
    return json({ error: 'Invalid auction id' }, { status: 400 });
  }

  const auction = await db.getAuction(auctionId);
  if (!auction) {
    return json({ error: 'Auction not found' }, { status: 404 });
  }

  return json(await db.getResponses(auctionId));
};

export const POST: RequestHandler = async ({ params, request }) => {
  const auctionId = Number(params.id);
  if (Number.isNaN(auctionId)) {
    return json({ error: 'Invalid auction id' }, { status: 400 });
  }

  const auction = await db.getAuction(auctionId);
  if (!auction) {
    return json({ error: 'Auction not found' }, { status: 404 });
  }

  try {
    const payload = await request.json();
    if (!payload.text) {
      return json({ error: 'Response text is required' }, { status: 400 });
    }

    const response: AuctionResponse = {
      id: Date.now(),
      text: payload.text,
      userId: payload.userId ?? 0,
      username: payload.username ?? 'anonymous',
      timestamp: new Date()
    };

    const updatedAuction = await db.addResponse(auctionId, response);

    return json(updatedAuction?.responses ?? [], { status: 201 });
  } catch (error) {
    console.error('Failed to append response', error);
    return json({ error: 'Failed to append response' }, { status: 500 });
  }
};
