import type { Auction, AuctionResponse, Group } from '$lib/types';
import type {
  AuctionCreationData,
  Database,
  GroupCreationData
} from './database';

interface CloudflareKVConfig {
  accountId: string;
  namespaceId: string;
  apiToken: string;
  baseUrl?: string;
}

interface StoredGroup extends Omit<Group, 'createdAt'> {
  createdAt: string;
}

interface StoredAuctionResponse extends Omit<AuctionResponse, 'timestamp'> {
  timestamp: string;
}

interface StoredAuction
  extends Omit<Auction, 'createdAt' | 'postedAt' | 'responses'> {
  createdAt: string;
  postedAt?: string;
  responses: StoredAuctionResponse[];
}

const GROUP_PREFIX = 'group:';
const AUCTION_PREFIX = 'auction:';
const COUNTER_PREFIX = 'counter:';

export class CloudflareKVDatabase implements Database {
  private readonly headers: Record<string, string>;
  private readonly authHeader: string;
  private readonly baseUrl: string;

  constructor(config: CloudflareKVConfig) {
    this.baseUrl =
      config.baseUrl ??
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}`;
    this.authHeader = `Bearer ${config.apiToken}`;
    this.headers = {
      Authorization: this.authHeader,
      'Content-Type': 'application/json'
    };
  }

  async createGroup(data: GroupCreationData): Promise<Group> {
    const id = await this.nextId('group');
    const group: Group = {
      ...data,
      id,
      totalEarned: 0,
      messageCount: 0,
      createdAt: new Date()
    };

    await this.putValue(`${GROUP_PREFIX}${group.id}`, this.serializeGroup(group));
    return group;
  }

  async getGroup(id: number): Promise<Group | undefined> {
    const stored = await this.getValue<StoredGroup>(`${GROUP_PREFIX}${id}`);
    return stored ? this.deserializeGroup(stored) : undefined;
  }

  async getAllGroups(): Promise<Group[]> {
    const keys = await this.listKeys(GROUP_PREFIX);
    const groups = await Promise.all(
      keys.map((key) => this.getValue<StoredGroup>(key).then((value) => value && this.deserializeGroup(value)))
    );
    return groups.filter((group): group is Group => Boolean(group));
  }

  async updateGroup(id: number, data: Partial<Group>): Promise<Group | undefined> {
    const existing = await this.getGroup(id);
    if (!existing) {
      return undefined;
    }

    const updated: Group = {
      ...existing,
      ...data,
      createdAt: data.createdAt ?? existing.createdAt
    };
    await this.putValue(`${GROUP_PREFIX}${id}`, this.serializeGroup(updated));
    return updated;
  }

  async createAuction(data: AuctionCreationData): Promise<Auction> {
    const id = await this.nextId('auction');
    const auction: Auction = {
      ...data,
      id,
      status: 'pending',
      responses: [],
      createdAt: new Date()
    };
    await this.putValue(`${AUCTION_PREFIX}${auction.id}`, this.serializeAuction(auction));
    return auction;
  }

  async getAuction(id: number): Promise<Auction | undefined> {
    const stored = await this.getValue<StoredAuction>(`${AUCTION_PREFIX}${id}`);
    return stored ? this.deserializeAuction(stored) : undefined;
  }

  async getAllAuctions(): Promise<Auction[]> {
    const keys = await this.listKeys(AUCTION_PREFIX);
    const auctions = await Promise.all(
      keys.map((key) =>
        this.getValue<StoredAuction>(key).then((value) => value && this.deserializeAuction(value))
      )
    );
    return auctions
      .filter((auction): auction is Auction => Boolean(auction))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateAuction(id: number, data: Partial<Auction>): Promise<Auction | undefined> {
    const existing = await this.getAuction(id);
    if (!existing) {
      return undefined;
    }

    const updated: Auction = {
      ...existing,
      ...data,
      createdAt: data.createdAt ?? existing.createdAt,
      postedAt: data.postedAt ?? existing.postedAt,
      responses: data.responses ?? existing.responses
    };
    await this.putValue(`${AUCTION_PREFIX}${id}`, this.serializeAuction(updated));
    return updated;
  }

  async addResponse(auctionId: number, response: AuctionResponse): Promise<Auction | undefined> {
    const auction = await this.getAuction(auctionId);
    if (!auction) {
      return undefined;
    }

    const updated: Auction = {
      ...auction,
      responses: [...auction.responses, response]
    };
    await this.putValue(`${AUCTION_PREFIX}${auctionId}`, this.serializeAuction(updated));
    return updated;
  }

  async findAuctionByTelegramMessage(
    chatId: string,
    messageId: number
  ): Promise<Auction | undefined> {
    const auctions = await this.getAllAuctions();
    return auctions.find(
      (auction) => auction.telegramChatId === chatId && auction.telegramMessageId === messageId
    );
  }

  async getResponses(auctionId: number): Promise<AuctionResponse[]> {
    const auction = await this.getAuction(auctionId);
    return auction ? auction.responses : [];
  }

  private async nextId(namespace: 'group' | 'auction'): Promise<number> {
    const counterKey = `${COUNTER_PREFIX}${namespace}`;
    const current = await this.getValue<number>(counterKey);
    const next = (current ?? 0) + 1;
    await this.putValue(counterKey, next);
    return next;
  }

  private async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;

    do {
      const url = new URL(`${this.baseUrl}/keys`);
      url.searchParams.set('prefix', prefix);
      url.searchParams.set('limit', '1000');
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to list KV keys for prefix ${prefix}: ${response.statusText}`);
      }

      const payload = await response.json();
      if (!payload.success) {
        throw new Error(`Cloudflare KV keys error: ${JSON.stringify(payload.errors)}`);
      }

      keys.push(
        ...payload.result
          .filter((item: { name: string }) => typeof item.name === 'string')
          .map((item: { name: string }) => item.name)
      );
      cursor = payload.result_info?.cursor;
    } while (cursor);

    return keys;
  }

  private async getValue<T>(key: string): Promise<T | undefined> {
    const response = await fetch(`${this.baseUrl}/values/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: {
        Authorization: this.authHeader
      }
    });

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      throw new Error(`Failed to read KV value for ${key}: ${response.statusText}`);
    }

    const text = await response.text();
    if (!text) {
      return undefined;
    }

    return JSON.parse(text) as T;
  }

  private async putValue(key: string, value: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}/values/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(value)
    });

    if (!response.ok) {
      throw new Error(`Failed to write KV value for ${key}: ${response.statusText}`);
    }
  }

  private serializeGroup(group: Group): StoredGroup {
    return {
      ...group,
      createdAt: group.createdAt.toISOString()
    };
  }

  private deserializeGroup(group: StoredGroup): Group {
    return {
      ...group,
      createdAt: new Date(group.createdAt)
    };
  }

  private serializeAuction(auction: Auction): StoredAuction {
    return {
      ...auction,
      createdAt: auction.createdAt.toISOString(),
      postedAt: auction.postedAt ? auction.postedAt.toISOString() : undefined,
      responses: auction.responses.map((response) => ({
        ...response,
        timestamp: response.timestamp.toISOString()
      }))
    };
  }

  private deserializeAuction(auction: StoredAuction): Auction {
    return {
      ...auction,
      createdAt: new Date(auction.createdAt),
      postedAt: auction.postedAt ? new Date(auction.postedAt) : undefined,
      responses: auction.responses.map((response) => ({
        ...response,
        timestamp: new Date(response.timestamp)
      }))
    };
  }
}
