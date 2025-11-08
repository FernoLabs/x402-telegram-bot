import type { Auction, AuctionResponse, Group } from '$lib/types';

export type GroupCreationData = Omit<Group, 'id' | 'totalEarned' | 'messageCount' | 'createdAt'>;
export type AuctionCreationData = Omit<
  Auction,
  'id' | 'status' | 'responses' | 'createdAt' | 'postedAt'
>;

export interface Database {
  createGroup(data: GroupCreationData): Promise<Group>;
  getGroup(id: number): Promise<Group | undefined>;
  getAllGroups(): Promise<Group[]>;
  updateGroup(id: number, data: Partial<Group>): Promise<Group | undefined>;

  createAuction(data: AuctionCreationData): Promise<Auction>;
  getAuction(id: number): Promise<Auction | undefined>;
  getAllAuctions(): Promise<Auction[]>;
  updateAuction(id: number, data: Partial<Auction>): Promise<Auction | undefined>;

  addResponse(auctionId: number, response: AuctionResponse): Promise<Auction | undefined>;
  findAuctionByTelegramMessage(chatId: string, messageId: number): Promise<Auction | undefined>;
  getResponses(auctionId: number): Promise<AuctionResponse[]>;
}
