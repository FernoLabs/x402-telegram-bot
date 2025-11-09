import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TelegramBot } from '$lib/server/telegram';

export const POST: RequestHandler = async ({ platform }) => {
	try {
		const env = platform?.env;
		if (!env?.TELEGRAM_BOT_TOKEN) {
			return json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' }, { status: 400 });
		}

		const webhookUrl = env.TELEGRAM_WEBHOOK_URL;
		if (!webhookUrl) {
			return json({ error: 'TELEGRAM_WEBHOOK_URL is not configured.' }, { status: 400 });
		}

		const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
		const response = await bot.setWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);
		return json(response);
	} catch (error) {
		console.error('Failed to set Telegram webhook', error);
		return json({ error: 'Failed to set Telegram webhook' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ platform }) => {
	try {
		const env = platform?.env;
		if (!env?.TELEGRAM_BOT_TOKEN) {
			return json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' }, { status: 400 });
		}

		const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
		const response = await bot.deleteWebhook();
		return json(response);
	} catch (error) {
		console.error('Failed to delete Telegram webhook', error);
		return json({ error: 'Failed to delete Telegram webhook' }, { status: 500 });
	}
};
