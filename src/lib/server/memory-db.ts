import type { Auction, AuctionResponse, Group } from '$lib/types';
import type {
  AuctionCreationData,
  Database,
  GroupCreationData
} from './database';

export class InMemoryDatabase implements Database {
  private groups: Map<number, Group> = new Map();
  private auctions: Map<number, Auction> = new Map();
  private groupCounter = 1;
  private auctionCounter = 1;

  async createGroup(data: GroupCreationData): Promise<Group> {
    const group: Group = {
      ...data,
      id: this.groupCounter++,
      totalEarned: 0,
      messageCount: 0,
      createdAt: new Date()
    };
    this.groups.set(group.id, group);
    return group;
  }

  async getGroup(id: number): Promise<Group | undefined> {
    return this.groups.get(id);
  }

  async getAllGroups(): Promise<Group[]> {
    return Array.from(this.groups.values());
  }

  async updateGroup(id: number, data: Partial<Group>): Promise<Group | undefined> {
    const group = this.groups.get(id);
    if (group) {
      Object.assign(group, data);
      return group;
    }
    return undefined;
  }

  async createAuction(data: AuctionCreationData): Promise<Auction> {
    const auction: Auction = {
      ...data,
      id: this.auctionCounter++,
      status: 'pending',
      responses: [],
      createdAt: new Date()
    };
    this.auctions.set(auction.id, auction);
    return auction;
  }

  async getAuction(id: number): Promise<Auction | undefined> {
    return this.auctions.get(id);
  }

  async getAllAuctions(): Promise<Auction[]> {
    return Array.from(this.auctions.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async updateAuction(id: number, data: Partial<Auction>): Promise<Auction | undefined> {
    const auction = this.auctions.get(id);
    if (auction) {
      Object.assign(auction, data);
      return auction;
    }
    return undefined;
  }

  async addResponse(auctionId: number, response: AuctionResponse): Promise<Auction | undefined> {
    const auction = this.auctions.get(auctionId);
    if (auction) {
      auction.responses.push(response);
      return auction;
    }
    return undefined;
  }

  async findAuctionByTelegramMessage(
    chatId: string,
    messageId: number
  ): Promise<Auction | undefined> {
    return Array.from(this.auctions.values()).find(
      (auction) => auction.telegramChatId === chatId && auction.telegramMessageId === messageId
    );
  }

  async getResponses(auctionId: number): Promise<AuctionResponse[]> {
    const auction = this.auctions.get(auctionId);
    return auction ? auction.responses : [];
  }
}

export const createInMemoryDatabase = () => new InMemoryDatabase();
