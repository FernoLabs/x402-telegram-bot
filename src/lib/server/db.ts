import type { Group, Auction, AuctionResponse } from '$lib/types';

// In-memory database for demo
// Replace with PostgreSQL/Drizzle ORM for production
class Database {
  private groups: Map<number, Group> = new Map();
  private auctions: Map<number, Auction> = new Map();
  private groupCounter = 1;
  private auctionCounter = 1;

  createGroup(data: Omit<Group, 'id' | 'totalEarned' | 'messageCount' | 'createdAt'>): Group {
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

  getGroup(id: number): Group | undefined {
    return this.groups.get(id);
  }

  getAllGroups(): Group[] {
    return Array.from(this.groups.values());
  }

  updateGroup(id: number, data: Partial<Group>): Group | undefined {
    const group = this.groups.get(id);
    if (group) {
      Object.assign(group, data);
      return group;
    }
    return undefined;
  }

  createAuction(data: Omit<Auction, 'id' | 'status' | 'responses' | 'createdAt'>): Auction {
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

  getAuction(id: number): Auction | undefined {
    return this.auctions.get(id);
  }

  getAllAuctions(): Auction[] {
    return Array.from(this.auctions.values()).sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  updateAuction(id: number, data: Partial<Auction>): Auction | undefined {
    const auction = this.auctions.get(id);
    if (auction) {
      Object.assign(auction, data);
      return auction;
    }
    return undefined;
  }

  addResponse(auctionId: number, response: AuctionResponse): Auction | undefined {
    const auction = this.auctions.get(auctionId);
    if (auction) {
      auction.responses.push(response);
      return auction;
    }
    return undefined;
  }
}

export const db = new Database();

// Seed demo data
db.createGroup({
  name: 'Crypto Developers',
  category: 'Technology',
  telegramId: '-1001234567890',
  minBid: 0.50,
  ownerAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  active: true
});

db.createGroup({
  name: 'Marketing Experts',
  category: 'Business',
  telegramId: '-1001234567891',
  minBid: 0.75,
  ownerAddress: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
  active: true
});

db.createGroup({
  name: 'AI Researchers',
  category: 'Research',
  telegramId: '-1001234567892',
  minBid: 1.00,
  ownerAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  active: true
});
