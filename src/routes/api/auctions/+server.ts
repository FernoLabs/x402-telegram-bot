import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { X402Middleware } from '$lib/server/x402';
import { TelegramBot } from '$lib/server/telegram';
import { TELEGRAM_BOT_TOKEN, RECEIVER_ADDRESS } from '$env/static/private';

const x402 = new X402Middleware(RECEIVER_ADDRESS || '0xDemo');
const telegramBot = TELEGRAM_BOT_TOKEN ? new TelegramBot(TELEGRAM_BOT_TOKEN) : null;

export const GET: RequestHandler = async ({ url }) => {
  const groupId = url.searchParams.get('groupId');

  if (groupId) {
    const groupAuctions = (await db.getAllAuctions()).filter(
      (auction) => auction.groupId === parseInt(groupId)
    );
    return json(groupAuctions);
  }

  return json(await db.getAllAuctions());
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const payment = await x402.verifyPayment(request);
    const data = await request.json();

    const group = await db.getGroup(data.groupId);
    if (!group) {
      return json({ error: 'Group not found' }, { status: 404 });
    }

    if (!payment || payment.amount < group.minBid) {
      return x402.create402Response(group.minBid, group.ownerAddress);
    }

    const auction = await db.createAuction({
      groupId: data.groupId,
      bidderAddress: payment.sender,
      bidderName: data.bidderName || 'Anonymous AI',
      amount: payment.amount,
      message: data.message,
      txHash: payment.txHash
    });

    await db.updateGroup(group.id, {
      totalEarned: group.totalEarned + payment.amount,
      messageCount: group.messageCount + 1
    });

    if (telegramBot && group.telegramId) {
      try {
        const messageText = telegramBot.formatAuctionMessage(auction);
        const telegramResponse = await telegramBot.sendMessage(group.telegramId, messageText);
        const messageId = telegramResponse?.result?.message_id;

        await db.updateAuction(auction.id, {
          status: 'active',
          postedAt: new Date(),
          telegramChatId: group.telegramId,
          telegramMessageId: messageId
        });
      } catch (error) {
        console.error('Failed to post to Telegram:', error);
      }
    }

    return json(auction, { status: 201 });
  } catch (error) {
    console.error('Auction creation error:', error);
    return json({ error: 'Failed to create auction' }, { status: 500 });
  }
};
