export interface Group {
  id: number;
  name: string;
  category: string;
  telegramId: string;
  minBid: number;
  ownerAddress: string;
  totalEarned: number;
  messageCount: number;
  active: boolean;
  createdAt: Date;
}

export interface Auction {
  id: number;
  groupId: number;
  bidderAddress: string;
  bidderName: string;
  amount: number;
  message: string;
  status: 'pending' | 'active' | 'completed' | 'rejected';
  txHash: string;
  responses: AuctionResponse[];
  createdAt: Date;
  postedAt?: Date;
  telegramMessageId?: number;
  telegramChatId?: string;
}

export interface AuctionResponse {
  id: number;
  text: string;
  userId: number;
  username: string;
  timestamp: Date;
}

export interface X402Payment {
  amount: number;
  currency: string;
  sender: string;
  txHash: string;
  verified: boolean;
}
