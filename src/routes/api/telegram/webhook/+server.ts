import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuctionRepository } from '$lib/server/db';
import { TelegramBot } from '$lib/server/telegram';
import type { TelegramWebhookUpdate } from '$lib/types';
import { getStablecoinMetadata } from '$lib/stablecoins';

type TelegramMessageUpdate = NonNullable<TelegramWebhookUpdate['message']>;
type TelegramMyChatMemberUpdate = NonNullable<TelegramWebhookUpdate['my_chat_member']>;

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

                const membershipUpdate = payload.my_chat_member;
                if (membershipUpdate) {
                        await handleBotMembershipChange(membershipUpdate, env, repo);
                        return json({ ok: true });
                }

                const message = payload.message;
                if (!message) {
                        return json({ ok: true });
                }

		const senderId = message.from?.id ? String(message.from.id) : null;
		if (senderId && env.TELEGRAM_BOT_ID && senderId === String(env.TELEGRAM_BOT_ID)) {
			return json({ ok: true });
		}

		const commandHandled = await handleGroupConfigCommand(message, env, repo);
		if (commandHandled) {
			return json({ ok: true });
		}

                if (message.reply_to_message && message.text) {
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

                        const messageRequest = await repo.getMessageRequestByTelegramMessage(
                                repliedMessageId,
                                chatId
                        );

                        if (messageRequest) {
                                const response = await repo.recordMessageResponse({
                                        messageRequestId: messageRequest.id,
                                        userId: String(message.from?.id ?? ''),
                                        username: message.from?.username ?? null,
                                        text: message.text
                                });

                                return json({ ok: true, messageRequestId: messageRequest.id, response });
                        }
                }

                return json({ ok: true });
        } catch (error) {
                console.error('Failed to process Telegram webhook', error);
		return json({ error: 'Failed to process webhook' }, { status: 500 });
	}
};

async function handleGroupConfigCommand(
	message: TelegramMessageUpdate,
	env: Env | undefined,
	repo: AuctionRepository
): Promise<boolean> {
	const text = message.text?.trim();
	if (!text || !text.startsWith('/')) {
		return false;
	}

	const parts = text.split(/\s+/);
	if (parts.length === 0) {
		return false;
	}

	const [commandToken, ...args] = parts;
	const [commandName, commandTarget] = commandToken.split('@');
	const normalizedCommand = commandName.toLowerCase();

	if (normalizedCommand !== '/setwallet' && normalizedCommand !== '/setprice') {
		return false;
	}

	const expectedHandle = normalizeHandle(env?.TELEGRAM_BOT_USERNAME);
	if (commandTarget) {
		const targetHandle = commandTarget.toLowerCase();
		if (expectedHandle && targetHandle !== expectedHandle) {
			return false;
		}
	}

	const chatId = String(message.chat.id);
	const alternateIdentifiers: string[] = [];

	const chatUsername = message.chat.username;
	if (chatUsername) {
		const normalizedUsername = normalizeHandle(chatUsername);
		if (normalizedUsername) {
			alternateIdentifiers.push(chatUsername, normalizedUsername, `@${normalizedUsername}`);
		}
	}

	const fromId = message.from?.id ? String(message.from.id) : null;
	if (!fromId) {
		return true;
	}

	const botToken = env?.TELEGRAM_BOT_TOKEN;
	if (!botToken) {
		console.warn('Ignoring configuration command because TELEGRAM_BOT_TOKEN is not set');
		return true;
	}

	const bot = new TelegramBot(botToken);
	const isAdmin = await bot.isGroupAdmin(chatId, fromId);

	if (!isAdmin) {
		await bot.sendMessage({
			chat_id: chatId,
			text: 'Only group admins can change the payout wallet or price.',
			reply_to_message_id: message.message_id
		});
		return true;
	}

        const configuredCurrency = (env?.PAYMENT_CURRENCY ?? 'USDC').toUpperCase();
        const stablecoinMetadata = getStablecoinMetadata(configuredCurrency);
        const currencyLabel = stablecoinMetadata?.symbol ?? configuredCurrency;
        const currencyDescription = stablecoinMetadata?.name ?? currencyLabel;

        const walletAddress = normalizedCommand === '/setwallet' ? args.join(' ').trim() : '';

	const group = await repo.getGroupByTelegramId(chatId, alternateIdentifiers);

	if (!group) {
		if (normalizedCommand === '/setwallet') {
			if (!walletAddress) {
				await bot.sendMessage({
					chat_id: chatId,
					text: 'Please include the Solana wallet address, for example: /setwallet 8Gh...xyz',
					reply_to_message_id: message.message_id
				});
				return true;
			}

			const defaultMinBid = 1;
			const groupName =
				message.chat.title?.trim() ||
				(message.chat.username ? `@${message.chat.username}` : `Chat ${chatId}`);

			await repo.createGroup({
				name: groupName,
				telegramId: chatId,
				minBid: defaultMinBid,
				ownerAddress: walletAddress
			});

                        await bot.sendMessage({
                                chat_id: chatId,
                                text: `Registered this chat for paid posts and set the payout wallet to:\n<code>${walletAddress}</code>\n\nCurrent price per message: ${defaultMinBid.toFixed(2)} ${currencyLabel}\nUse /setprice to change it.`,
                                parse_mode: 'HTML',
                                reply_to_message_id: message.message_id
                        });

			return true;
		}

		await bot.sendMessage({
			chat_id: chatId,
			text: 'This chat is not registered for paid posts yet. Use /setwallet first to register it.',
			reply_to_message_id: message.message_id
		});
		return true;
	}

	if (normalizedCommand === '/setwallet') {
		if (!walletAddress) {
			await bot.sendMessage({
				chat_id: chatId,
				text: 'Please include the Solana wallet address, for example: /setwallet 8Gh...xyz',
				reply_to_message_id: message.message_id
			});
			return true;
		}

		const updated = await repo.updateGroupConfig(group.telegramId, { ownerAddress: walletAddress });
		if (updated) {
			await bot.sendMessage({
				chat_id: chatId,
				text: `Updated payout wallet to:\n<code>${walletAddress}</code>`,
				parse_mode: 'HTML',
				reply_to_message_id: message.message_id
			});
		}

		return true;
	}

	if (normalizedCommand === '/setprice') {
		const amountArg = args[0];
		const parsedAmount = amountArg ? Number(amountArg) : NaN;

		if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                        await bot.sendMessage({
                                chat_id: chatId,
                                text: `Please include a positive number of ${currencyDescription} (for example: /setprice 0.75)`,
                                reply_to_message_id: message.message_id
                        });
			return true;
		}

		const updated = await repo.updateGroupConfig(group.telegramId, { minBid: parsedAmount });
		if (updated) {
                        await bot.sendMessage({
                                chat_id: chatId,
                                text: `Updated price per message to ${parsedAmount.toFixed(2)} ${currencyLabel}.`,
                                reply_to_message_id: message.message_id
                        });
		}

		return true;
	}

	return false;
}


async function handleBotMembershipChange(
	update: TelegramMyChatMemberUpdate,
	env: Env | undefined,
	repo: AuctionRepository
): Promise<void> {
	const botId = env?.TELEGRAM_BOT_ID ? String(env.TELEGRAM_BOT_ID) : null;
	const newMember = update.new_chat_member;
	const memberId = newMember?.user?.id ? String(newMember.user.id) : null;

	if (botId && memberId && memberId !== botId) {
		return;
	}

	const status = newMember?.status;
	if (!status) {
		return;
	}

	const chatId = String(update.chat.id);
	const alternateIdentifiers: string[] = [];
	const chatUsername = update.chat.username;

	if (chatUsername) {
		const normalizedUsername = normalizeHandle(chatUsername);
		if (normalizedUsername) {
			alternateIdentifiers.push(chatUsername, normalizedUsername, `@${normalizedUsername}`);
		}
	}

	if (status === 'member' || status === 'administrator') {
		await repo.setGroupActiveStatus(chatId, true, alternateIdentifiers);
		return;
	}

	if (status === 'left' || status === 'kicked' || status === 'restricted') {
		await repo.setGroupActiveStatus(chatId, false, alternateIdentifiers);
	}
}

function normalizeHandle(handle?: string | null): string | null {
	if (!handle) return null;
	return handle.replace(/^@/, '').toLowerCase();
}
