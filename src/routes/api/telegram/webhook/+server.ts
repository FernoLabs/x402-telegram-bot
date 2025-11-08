import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuctionRepository } from '$lib/server/db';
import type { TelegramWebhookUpdate } from '$lib/types';

export const POST: RequestHandler = async ({ request, platform }) => {
  try {
    const env = platform?.env;
    if (!env?.DB) {
      throw new Error('D1 database binding `DB` is not configured.');
    }

    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const token = request.headers.get('x-telegram-bot-api-secret-token');
      if (token !== env.TELEGRAM_WEBHOOK_SECRET) {
        return json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = (await request.json()) as TelegramWebhookUpdate;
    const repo = new AuctionRepository(env.DB);

    const message = payload.message;
    if (message?.reply_to_message && message.text) {
      const chatId = String(message.chat.id);
      const repliedMessageId = message.reply_to_message.message_id;
      const auction = await repo.getAuctionByTelegramMessage(repliedMessageId, chatId);

      if (auction) {
        const response = await repo.recordResponse({
          auctionId: auction.id,
          userId: String(message.from?.id ?? ''),
          username: message.from?.username ?? null,
          text: message.text
        });

        return json({ ok: true, auctionId: auction.id, response });
      }
    }

    return json({ ok: true });
  } catch (error) {
    console.error('Failed to process Telegram webhook', error);
    return json({ error: 'Failed to process webhook' }, { status: 500 });
  }
};
