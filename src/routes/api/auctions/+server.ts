import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuctionRepository } from '$lib/server/db';
import { parsePayment, buildPaymentRequiredResponse } from '$lib/server/x402';
import { normalizeCommitment } from '$lib/server/solana';
import { TelegramBot } from '$lib/server/telegram';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTelegramMessage(params: {
  bidderName: string | null;
  amount: number;
  message: string;
  txHash: string | null;
}): string {
  const lines = [
    '🤖 <b>Paid AI Message</b>',
    `<b>From:</b> ${escapeHtml(params.bidderName ?? 'Anonymous AI Agent')}`,
    `<b>Bid:</b> $${params.amount.toFixed(2)} USDC`
  ];

  if (params.txHash) {
    const shortHash = `${params.txHash.slice(0, 10)}…${params.txHash.slice(-8)}`;
    lines.push(`<b>Tx:</b> <code>${escapeHtml(shortHash)}</code>`);
  }

  lines.push('', `<b>Message</b>\n${escapeHtml(params.message)}`, '', 'Reply to this message to respond to the agent.');

  return lines.join('\n');
}

export const GET: RequestHandler = async ({ url, platform }) => {
  try {
    const env = platform?.env;
    if (!env?.DB) {
      throw new Error('D1 database binding `DB` is not configured.');
    }

    const repo = new AuctionRepository(env.DB);
    const groupIdParam = url.searchParams.get('groupId');
    const parsedGroupId = groupIdParam ? Number.parseInt(groupIdParam, 10) : Number.NaN;
    const targetGroupId = Number.isNaN(parsedGroupId) ? undefined : parsedGroupId;

    const auctions = await repo.listAuctions(targetGroupId);
    return json(auctions);
  } catch (error) {
    console.error('Failed to list auctions', error);
    return json({ error: 'Failed to list auctions' }, { status: 500 });
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
      groupId: number;
      message: string;
      bidderName: string;
    }>;

    const groupId = Number(body?.groupId);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const bidderName = typeof body?.bidderName === 'string' ? body.bidderName : undefined;

    if (!groupId || !message) {
      return json({ error: 'Missing required fields: groupId, message' }, { status: 400 });
    }

    const group = await repo.getGroup(groupId);
    if (!group) {
      return json({ error: 'Group not found' }, { status: 404 });
    }

    const receiver = env.RECEIVER_ADDRESS ?? group.ownerAddress;
    const currency = env.PAYMENT_CURRENCY ?? 'USDC';
    const network = env.PAYMENT_NETWORK ?? 'solana';
    const solanaRpcUrl = env.SOLANA_RPC_URL;
    if (!solanaRpcUrl) {
      console.error('SOLANA_RPC_URL is not configured.');
      return json({ error: 'Solana RPC URL is not configured.' }, { status: 500 });
    }
    const solanaMint = env.SOLANA_USDC_MINT_ADDRESS ?? null;
    const solanaCommitment = normalizeCommitment(env.SOLANA_COMMITMENT);

    const payment = await parsePayment(request, {
      paymentDetails: {
        amount: group.minBid,
        currency,
        recipient: receiver,
        network
      },
      solana: {
        rpcUrl: solanaRpcUrl,
        tokenMintAddress: solanaMint,
        commitment: solanaCommitment
      }
    });

    if (!payment || payment.amount < group.minBid || payment.amount <= 0) {
      return buildPaymentRequiredResponse(group.minBid, receiver, {
        currencyCode: currency,
        network,
        groupName: group.name,
        memo: message,
        resource: 'POST /api/auctions',
        description: `Send ${currency} on ${network} to publish a paid message in ${group.name}.`,
        assetAddress: solanaMint ?? undefined,
        assetType: solanaMint ? 'spl-token' : undefined
      });
    }

    const auction = await repo.createAuction({
      groupId,
      bidderAddress: payment.sender,
      bidderName,
      amount: payment.amount,
      message,
      txHash: payment.txHash
    });

    await repo.incrementGroupStats(groupId, payment.amount);

    if (env.TELEGRAM_BOT_TOKEN) {
      try {
        const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);
        const formatted = formatTelegramMessage({
          bidderName: auction.bidderName,
          amount: auction.amount,
          message: auction.message,
          txHash: auction.txHash
        });
        const response = await bot.sendMessage({
          chat_id: group.telegramId,
          text: formatted,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });

        if (response.ok && response.result) {
          await repo.markAuctionPosted(auction.id, {
            telegramMessageId: response.result.message_id,
            telegramChatId: String(response.result.chat.id)
          });
        } else {
          await repo.markAuctionFailed(auction.id, response.description ?? 'Unknown Telegram error');
        }
      } catch (telegramError) {
        console.error('Failed to send Telegram message', telegramError);
        await repo.markAuctionFailed(auction.id, telegramError instanceof Error ? telegramError.message : 'Telegram error');
      }
    }

    const updatedAuction = await repo.getAuctionById(auction.id);
    return json(updatedAuction ?? auction, { status: 201 });
  } catch (error) {
    console.error('Failed to create auction', error);
    return json({ error: 'Failed to create auction' }, { status: 500 });
  }
};
