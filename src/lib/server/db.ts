import type {
  Auction,
  AuctionResponse,
  CreateAuctionInput,
  CreateGroupInput,
  Group
} from '$lib/types';

interface GroupRow {
  id: number;
  name: string;
  category: string | null;
  telegram_id: string;
  min_bid: number;
  owner_address: string;
  active: number;
  total_earned: number;
  message_count: number;
  created_at: string;
}

interface AuctionRow {
  id: number;
  group_id: number;
  bidder_address: string;
  bidder_name: string | null;
  amount: number;
  message: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
  posted_at: string | null;
  telegram_message_id: number | null;
  telegram_chat_id: string | null;
  error_reason: string | null;
}

interface ResponseRow {
  id: number;
  auction_id: number;
  user_id: string;
  username: string | null;
  text: string;
  created_at: string;
}

export class AuctionRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async listGroups(): Promise<Group[]> {
    const { results } = await this.db
      .prepare(
        `SELECT id, name, category, telegram_id, min_bid, owner_address, active, total_earned, message_count, created_at
         FROM groups
         ORDER BY created_at DESC`
      )
      .all<GroupRow>();

    return (results ?? []).map(mapGroupRow);
  }

  async getGroup(id: number): Promise<Group | null> {
    const row = await this.db
      .prepare(
        `SELECT id, name, category, telegram_id, min_bid, owner_address, active, total_earned, message_count, created_at
         FROM groups
         WHERE id = ?`
      )
      .bind(id)
      .first<GroupRow>();

    return row ? mapGroupRow(row) : null;
  }

  async createGroup(input: CreateGroupInput): Promise<Group> {
    const result = await this.db
      .prepare(
        `INSERT INTO groups (name, category, telegram_id, min_bid, owner_address, active)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.name,
        input.category ?? null,
        input.telegramId,
        input.minBid,
        input.ownerAddress,
        (input.active ?? true) ? 1 : 0
      )
      .run();

    const insertedId = Number(result.meta.last_row_id ?? 0);
    if (!Number.isFinite(insertedId) || insertedId <= 0) {
      throw new Error('Failed to insert group');
    }

    const row = await this.db
      .prepare(
        `SELECT id, name, category, telegram_id, min_bid, owner_address, active, total_earned, message_count, created_at
         FROM groups
         WHERE id = ?`
      )
      .bind(insertedId)
      .first<GroupRow>();

    if (!row) {
      throw new Error('Failed to fetch group after insert');
    }

    return mapGroupRow(row);
  }

  async incrementGroupStats(groupId: number, amount: number): Promise<void> {
    await this.db
      .prepare(
        `UPDATE groups
         SET total_earned = total_earned + ?,
             message_count = message_count + 1
         WHERE id = ?`
      )
      .bind(amount, groupId)
      .run();
  }

  async listAuctions(groupId?: number): Promise<Auction[]> {
    const statement = groupId
      ? this.db.prepare(
          `SELECT id, group_id, bidder_address, bidder_name, amount, message, status, tx_hash, created_at, posted_at,
                  telegram_message_id, telegram_chat_id, error_reason
           FROM auctions
           WHERE group_id = ?
           ORDER BY created_at DESC`
        )
      : this.db.prepare(
          `SELECT id, group_id, bidder_address, bidder_name, amount, message, status, tx_hash, created_at, posted_at,
                  telegram_message_id, telegram_chat_id, error_reason
           FROM auctions
           ORDER BY created_at DESC`
        );

    const { results } = groupId ? await statement.bind(groupId).all<AuctionRow>() : await statement.all<AuctionRow>();

    const auctions = (results ?? []).map(mapAuctionRow);

    for (const auction of auctions) {
      auction.responses = await this.listResponsesForAuction(auction.id);
    }

    return auctions;
  }

  async createAuction(input: CreateAuctionInput): Promise<Auction> {
    const result = await this.db
      .prepare(
        `INSERT INTO auctions (group_id, bidder_address, bidder_name, amount, message, status, tx_hash)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`
      )
      .bind(input.groupId, input.bidderAddress, input.bidderName ?? null, input.amount, input.message, input.txHash ?? null)
      .run();

    const insertedId = Number(result.meta.last_row_id ?? 0);
    if (!Number.isFinite(insertedId) || insertedId <= 0) {
      throw new Error('Failed to insert auction');
    }

    const auction = await this.getAuctionById(insertedId);
    if (!auction) {
      throw new Error('Failed to fetch auction after insert');
    }

    return auction;
  }

  async getAuctionById(id: number): Promise<Auction | null> {
    const row = await this.db
      .prepare(
        `SELECT id, group_id, bidder_address, bidder_name, amount, message, status, tx_hash, created_at, posted_at,
                telegram_message_id, telegram_chat_id, error_reason
         FROM auctions
         WHERE id = ?`
      )
      .bind(id)
      .first<AuctionRow>();

    if (!row) return null;

    const auction = mapAuctionRow(row);
    auction.responses = await this.listResponsesForAuction(auction.id);
    return auction;
  }

  async getAuctionByTelegramMessage(messageId: number, chatId: string): Promise<Auction | null> {
    const row = await this.db
      .prepare(
        `SELECT id, group_id, bidder_address, bidder_name, amount, message, status, tx_hash, created_at, posted_at,
                telegram_message_id, telegram_chat_id, error_reason
         FROM auctions
         WHERE telegram_message_id = ? AND telegram_chat_id = ?`
      )
      .bind(messageId, chatId)
      .first<AuctionRow>();

    if (!row) return null;

    const auction = mapAuctionRow(row);
    auction.responses = await this.listResponsesForAuction(auction.id);
    return auction;
  }

  async markAuctionPosted(
    auctionId: number,
    options: { telegramMessageId: number; telegramChatId: string; postedAt?: string }
  ): Promise<void> {
    await this.db
      .prepare(
        `UPDATE auctions
         SET status = 'posted', telegram_message_id = ?, telegram_chat_id = ?, posted_at = ?, error_reason = NULL
         WHERE id = ?`
      )
      .bind(options.telegramMessageId, options.telegramChatId, options.postedAt ?? new Date().toISOString(), auctionId)
      .run();
  }

  async markAuctionFailed(auctionId: number, reason: string): Promise<void> {
    await this.db
      .prepare(
        `UPDATE auctions
         SET status = 'failed', error_reason = ?
         WHERE id = ?`
      )
      .bind(reason, auctionId)
      .run();
  }

  async recordResponse(input: {
    auctionId: number;
    userId: string;
    username: string | null;
    text: string;
  }): Promise<AuctionResponse> {
    const result = await this.db
      .prepare(
        `INSERT INTO responses (auction_id, user_id, username, text)
         VALUES (?, ?, ?, ?)`
      )
      .bind(input.auctionId, input.userId, input.username, input.text)
      .run();

    const insertedId = Number(result.meta.last_row_id ?? 0);
    if (!Number.isFinite(insertedId) || insertedId <= 0) {
      throw new Error('Failed to insert response');
    }

    const row = await this.db
      .prepare(
        `SELECT id, auction_id, user_id, username, text, created_at
         FROM responses
         WHERE id = ?`
      )
      .bind(insertedId)
      .first<ResponseRow>();

    if (!row) {
      throw new Error('Failed to fetch response after insert');
    }

    return mapResponseRow(row);
  }

  async listResponsesForAuction(auctionId: number): Promise<AuctionResponse[]> {
    const { results } = await this.db
      .prepare(
        `SELECT id, auction_id, user_id, username, text, created_at
         FROM responses
         WHERE auction_id = ?
         ORDER BY created_at ASC`
      )
      .bind(auctionId)
      .all<ResponseRow>();

    return (results ?? []).map(mapResponseRow);
  }
}

function mapGroupRow(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    telegramId: row.telegram_id,
    minBid: Number(row.min_bid),
    ownerAddress: row.owner_address,
    active: row.active === 1,
    totalEarned: Number(row.total_earned ?? 0),
    messageCount: Number(row.message_count ?? 0),
    createdAt: row.created_at
  };
}

function mapAuctionRow(row: AuctionRow): Auction {
  return {
    id: row.id,
    groupId: row.group_id,
    bidderAddress: row.bidder_address,
    bidderName: row.bidder_name,
    amount: Number(row.amount),
    message: row.message,
    status: row.status as Auction['status'],
    txHash: row.tx_hash,
    createdAt: row.created_at,
    postedAt: row.posted_at,
    telegramMessageId: row.telegram_message_id,
    telegramChatId: row.telegram_chat_id,
    errorReason: row.error_reason,
    responses: []
  };
}

function mapResponseRow(row: ResponseRow): AuctionResponse {
  return {
    id: row.id,
    auctionId: row.auction_id,
    userId: row.user_id,
    username: row.username,
    text: row.text,
    createdAt: row.created_at
  };
}
