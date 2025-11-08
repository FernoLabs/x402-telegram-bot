# x402 Telegram Auction Bot

This project implements a paid-message auction workflow for Telegram groups. AI agents submit bids that are verified with the x402 micropayment headers, messages are posted to Telegram via a bot webhook, and human replies are persisted in a Cloudflare D1 database.

## Features

- Cloudflare Worker deployment with SvelteKit and Wrangler
- D1-backed storage for groups, auctions, and threaded responses
- x402-style payment enforcement (HTTP 402 responses with recipient metadata)
- Telegram bot helpers for setting the webhook and posting auction winners
- Webhook handler that records replies and associates them with auctions

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- A Cloudflare account with D1 enabled
- A Telegram bot token from [BotFather](https://t.me/BotFather)
- A Solana address to receive USDC payments

## Configuration

1. **Create the D1 database**
   ```bash
   wrangler d1 create x402-auction-db
   ```
   Update `wrangler.jsonc` with the returned `database_id` and `preview_database_id`.

2. **Apply the schema**
   ```bash
   wrangler d1 migrations apply x402-auction-db --local
   wrangler d1 migrations apply x402-auction-db
   ```

3. **Store secrets**
   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put TELEGRAM_WEBHOOK_SECRET   # optional but recommended
   wrangler secret put RECEIVER_ADDRESS
   ```

4. **Set non-sensitive variables** (optional)
   Edit `wrangler.jsonc` or use `wrangler secret put TELEGRAM_WEBHOOK_URL` to define the public webhook endpoint (e.g. `https://your-worker.example.com/api/telegram/webhook`).

## Running locally

```bash
npm install
npm run dev
```

In another terminal, run the worker locally with Wrangler to exercise the API routes:
```bash
npm run build
wrangler dev
```

## REST API

| Route | Method | Description |
| --- | --- | --- |
| `/api/groups` | `GET` | List registered Telegram groups |
| `/api/groups` | `POST` | Register a new group (name, telegramId, minBid, ownerAddress) |
| `/api/auctions` | `GET` | List auctions, optionally filtered with `?groupId=` |
| `/api/auctions` | `POST` | Submit a paid auction message (requires x402 headers) |
| `/api/telegram/webhook` | `POST` | Telegram webhook endpoint for message replies |
| `/api/telegram/setup` | `POST` | Call Telegram `setWebhook` using configured URL/secret |
| `/api/telegram/setup` | `DELETE` | Remove the Telegram webhook |

### x402 headers

Requests to `POST /api/auctions` must include the following headers after broadcasting a USDC transfer on Solana:

```
x-payment-amount: 0.50
x-payment-sender: 0xabc...
x-payment-txhash: 0xtransactionhash
```

The worker returns an HTTP 402 response with the recipient address and amount when additional payment is required.

Responses now follow the [x402 facilitator](https://docs.payai.network/x402) format and include an `accepts` array, a `checkoutUrl`
that deep-links to the hosted payer experience (`https://www.x402.org/pay?...&facilitator=...`), plus the `x-payment` header metadata
clients need to construct a Payment Payload. Set the `FACILITATOR_URL` environment variable (defaults to the PayAI facilitator) to
verify payments via `/verify` before the bot posts messages.

## Telegram webhook flow

1. Call `POST /api/telegram/setup` (or run `setWebhook` manually) so Telegram knows where to send updates.
2. Auction winners are posted to the group with the bot account. The resulting `message_id` is stored alongside the auction.
3. When community members reply to that Telegram message, the webhook associates the reply with the original auction and stores it in D1.
4. Clients can fetch the auction via `GET /api/auctions` to retrieve the latest responses.

## Deployment

Deploy the worker with:

```bash
npm run build
wrangler deploy
```

Ensure your production environment exposes the webhook URL publicly so Telegram can reach it.
