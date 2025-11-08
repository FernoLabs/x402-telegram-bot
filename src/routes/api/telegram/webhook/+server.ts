import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { TelegramBot, type TelegramUpdate } from '$lib/server/telegram';
import type { AuctionResponse } from '$lib/types';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } from '$env/static/private';

const bot = TELEGRAM_BOT_TOKEN ? new TelegramBot(TELEGRAM_BOT_TOKEN) : null;

export const POST: RequestHandler = async ({ request }) => {
  if (!bot) {
    return json({ error: 'Telegram integration not configured' }, { status: 501 });
  }

  if (TELEGRAM_WEBHOOK_SECRET) {
    const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
    if (secretToken !== TELEGRAM_WEBHOOK_SECRET) {
      return json({ error: 'Invalid secret token' }, { status: 401 });
    }
  }

  const update = (await request.json()) as TelegramUpdate;
  const metadata = bot.extractReplyMetadata(update);

  if (!metadata) {
    return json({ ok: true });
  }

  if (!metadata.text?.trim()) {
    return json({ ok: true });
  }

  const auction = await db.findAuctionByTelegramMessage(metadata.chatId, metadata.replyToMessageId);

  if (!auction) {
    return json({ ok: true });
  }

  const response: AuctionResponse = {
    id: Date.now(),
    text: metadata.text,
    userId: metadata.user.id ?? 0,
    username: metadata.user.username || metadata.user.displayName || 'anonymous',
    timestamp: new Date()
  };

  await db.addResponse(auction.id, response);

  return json({ ok: true });
};
