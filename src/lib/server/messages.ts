import type { MessageRequest, MessageRequestStatus, PaymentRequestRecord } from '$lib/types';
import { AuctionRepository } from './db';
import { TelegramBot } from './telegram';

function escapeHtml(value: string): string {
        return value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
}

export function formatTelegramMessage(params: {
        senderName: string | null;
        amount: number;
        message: string;
        signature: string | null;
        currency: string;
}): string {
        const lines = [
                '🤖 <b>Paid Message</b>',
                `<b>From:</b> ${escapeHtml(params.senderName ?? 'Anonymous Wallet')}`,
                `<b>Amount:</b> $${params.amount.toFixed(2)} ${escapeHtml(params.currency.toUpperCase())}`
        ];

        if (params.signature) {
                const shortHash = `${params.signature.slice(0, 10)}…${params.signature.slice(-8)}`;
                lines.push(`<b>Tx:</b> <code>${escapeHtml(shortHash)}</code>`);
        }

        lines.push('', `<b>Message</b>\n${escapeHtml(params.message)}`);

        return lines.join('\n');
}

export async function updateMessageStatus(
        repo: AuctionRepository,
        message: MessageRequest,
        status: MessageRequestStatus,
        extras: Partial<
                Pick<MessageRequest, 'lastError' | 'telegramMessageId' | 'telegramChatId' | 'sentAt'>
        > = {}
): Promise<MessageRequest | null> {
        return repo.updateMessageRequest(message.id, {
                status,
                lastError: extras.lastError ?? null,
                telegramMessageId: extras.telegramMessageId ?? null,
                telegramChatId: extras.telegramChatId ?? null,
                sentAt: extras.sentAt ?? null
        });
}

export async function deliverTelegramMessage(options: {
        repo: AuctionRepository;
        env: App.Platform['env'] | undefined;
        request: PaymentRequestRecord;
        message: MessageRequest;
        signature: string | null;
}): Promise<MessageRequest | null> {
        const { repo, env, request, message, signature } = options;

        const paidMessage = await updateMessageStatus(repo, message, 'paid', { lastError: null });
        const current = paidMessage ?? message;

        if (!env?.TELEGRAM_BOT_TOKEN) {
                return current;
        }

        if (current.status === 'sent') {
                return current;
        }

        const group = await repo.getGroup(current.groupId);
        if (!group) {
                return updateMessageStatus(repo, current, 'failed', {
                        lastError: 'Telegram group not found for this message.'
                });
        }

        try {
                const bot = new TelegramBot(String(env.TELEGRAM_BOT_TOKEN));
                const formatted = formatTelegramMessage({
                        senderName: current.senderName,
                        amount: request.amount,
                        message: current.message,
                        signature,
                        currency: request.currency
                });

                const response = await bot.sendMessage({
                        chat_id: group.telegramId,
                        text: formatted,
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                });

                if (!response.ok || !response.result) {
                        return updateMessageStatus(repo, current, 'failed', {
                                lastError: response.description ?? 'Telegram API error'
                        });
                }

                await repo.incrementGroupStats(group.id, request.amount);

                return updateMessageStatus(repo, current, 'sent', {
                        telegramMessageId: response.result.message_id,
                        telegramChatId: String(response.result.chat.id),
                        sentAt: new Date().toISOString(),
                        lastError: null
                });
        } catch (error) {
                const messageError = error instanceof Error ? error.message : 'Telegram delivery failed';
                return updateMessageStatus(repo, current, 'failed', { lastError: messageError });
        }
}
