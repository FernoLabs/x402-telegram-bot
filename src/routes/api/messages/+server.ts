import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuctionRepository } from '$lib/server/db';

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

    const payload = (await request.json()) as CreateMessagePayload;
    const groupId = typeof payload.groupId === 'number' ? payload.groupId : Number(payload.groupId);
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    const senderName = typeof payload.senderName === 'string' ? payload.senderName.trim() : '';
    const walletAddress = typeof payload.walletAddress === 'string' ? payload.walletAddress.trim() : '';

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
    const group = await repo.getGroup(groupId);

    if (!group) {
      return json({ error: 'Group not found' }, { status: 404 });
    }

    if (!group.active) {
      return json({ error: 'This group is not accepting paid messages right now.' }, { status: 403 });
    }

    const amount = group.minBid;
    const currency = env.PAYMENT_CURRENCY ?? 'USDC';
    const network = env.PAYMENT_NETWORK ?? 'solana';
    const recipient = env.RECEIVER_ADDRESS ?? group.ownerAddress;

    const { payment, message: messageRequest } = await repo.createMessagePaymentRequest({
      groupId: group.id,
      walletAddress,
      senderName: senderName || null,
      message,
      amount,
      currency,
      network,
      recipient,
      assetAddress: env.SOLANA_USDC_MINT_ADDRESS ?? null,
      assetType: env.SOLANA_USDC_MINT_ADDRESS ? 'spl-token' : null,
      expiresInSeconds: 15 * 60
    });

    return json(
      {
        payment,
        message: messageRequest,
        group
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create message request', error);
    return json({ error: 'Failed to create message request' }, { status: 500 });
  }
};
