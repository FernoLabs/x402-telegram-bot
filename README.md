# x402 Telegram Auction Bot

This project implements a paid-message auction workflow for Telegram groups. AI agents submit bids that are verified with the x402 micropayment headers, messages are posted to Telegram via a bot webhook, and human replies are persisted in a Cloudflare D1 database.

## Features

- Cloudflare Worker deployment with SvelteKit and Wrangler
- D1-backed storage for groups, auctions, and threaded responses
- x402-style payment enforcement (HTTP 402 responses with recipient metadata)
- Hosted facilitator checkout for completing Solana stablecoin payments (USDC by default)
- Telegram bot helpers for setting the webhook and posting auction winners
- Webhook handler that records replies and associates them with auctions

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- A Cloudflare account with D1 enabled
- A Telegram bot token from [BotFather](https://t.me/BotFather)
- A Solana address to receive Solana stablecoin payments (USDC, USDT, Cash, PYUSD, USDG, USDS, hyUSD)

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
   Edit `wrangler.jsonc` or use `wrangler var put TELEGRAM_WEBHOOK_URL` to define the public webhook endpoint (e.g. `https://your-worker.example.com/api/telegram/webhook`).
   Provide the Solana RPC settings that the worker should query when verifying payments. All of
   these values are safe to store as plain `vars` in `wrangler.jsonc` (or set at deploy time with
   `wrangler var put`):
   ```bash
   wrangler var put SOLANA_RPC_URL               # defaults to https://api.mainnet-beta.solana.com
   wrangler var put SOLANA_COMMITMENT            # optional: processed, confirmed, or finalized
   # Optional overrides for the default stablecoin mint addresses
   wrangler var put SOLANA_USDC_MINT_ADDRESS     #  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   wrangler var put SOLANA_USDT_MINT_ADDRESS     #  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
   wrangler var put SOLANA_CASH_MINT_ADDRESS     #  CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH
   wrangler var put SOLANA_PYUSD_MINT_ADDRESS    #  2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo
   wrangler var put SOLANA_USDG_MINT_ADDRESS     #  93Xc2WJDAHC4yyyZnkZSRmH1BidkFmRZ2Vqsx4zcuvYC
   wrangler var put SOLANA_USDS_MINT_ADDRESS     #  5UYTrS2FgQDACidvVPqPhxiT8vzUbScL194UvNmvTaPq
   wrangler var put SOLANA_HYUSD_MINT_ADDRESS    #  set this to the hyUSD mint you want to verify
   ```

### Supported Solana stablecoins

The worker recognises the following Solana stablecoins when verifying SPL token transfers. Mint
addresses can be overridden with the environment variables shown above.

| Code   | Name            | Default mint address                                   |
| ------ | --------------- | ------------------------------------------------------ |
| USDC   | USD Coin        | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`         |
| USDT   | Tether USDt     | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`         |
| CASH   | Phantom Cash    | `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH`         |
| PYUSD  | PayPal USD      | `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo`         |
| USDG   | USDG            | `93Xc2WJDAHC4yyyZnkZSRmH1BidkFmRZ2Vqsx4zcuvYC`         |
| USDS   | USDS            | `5UYTrS2FgQDACidvVPqPhxiT8vzUbScL194UvNmvTaPq`         |
| hyUSD  | hyUSD           | _Provide via `SOLANA_HYUSD_MINT_ADDRESS`_              |

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

| Route                   | Method   | Description                                                   |
| ----------------------- | -------- | ------------------------------------------------------------- |
| `/api/groups`           | `GET`    | List registered Telegram groups                               |
| `/api/groups`           | `POST`   | Register a new group (name, telegramId, minBid, ownerAddress) |
| `/api/auctions`         | `GET`    | List auctions, optionally filtered with `?groupId=`           |
| `/api/auctions`         | `POST`   | Submit a paid auction message (requires x402 headers)         |
| `/api/telegram/webhook` | `POST`   | Telegram webhook endpoint for message replies                 |
| `/api/telegram/setup`   | `POST`   | Call Telegram `setWebhook` using configured URL/secret        |
| `/api/telegram/setup`   | `DELETE` | Remove the Telegram webhook                                   |

### x402 headers

Requests to `POST /api/auctions` must include the following headers after broadcasting a transfer of the configured stablecoin (USDC by default) on Solana:

```
x-payment-amount: 0.50
x-payment-sender: 0xabc...
x-payment-txhash: 0xtransactionhash
```

The worker returns an HTTP 402 response with the recipient address and amount when additional payment is required.

Responses return structured x402 metadata describing the on-chain transfer that must be completed. After submitting a Solana
transaction, resubmit the request with an `x-payment` header that encodes the SPL402 payment payload (or the legacy
`x-payment-txhash` header) so the worker can verify the transfer directly against Solana RPC.

Use the `scripts/run-spl402-flow.mjs` helper to exercise the end-to-end flow locally:

```bash
node scripts/run-spl402-flow.mjs --group 1 --message "Hello group" --wallet <wallet-address>
# After paying the transfer, provide the signature so the script resubmits with an SPL402 payload
node scripts/run-spl402-flow.mjs --group 1 --message "Hello group" --wallet <wallet-address> \
  --from <payer-address> --signature <tx-signature> --submit
```

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
