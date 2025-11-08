import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async () => {
  const groups = db.getAllGroups();
  return json(groups);
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();
    
    if (!data.name || !data.category || !data.telegramId || !data.ownerAddress) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    const group = db.createGroup({
      name: data.name,
      category: data.category,
      telegramId: data.telegramId,
      minBid: parseFloat(data.minBid) || 0.10,
      ownerAddress: data.ownerAddress,
      active: true
    });

    return json(group, { status: 201 });
  } catch (error) {
    return json({ error: 'Failed to create group' }, { status: 500 });
  }
};
