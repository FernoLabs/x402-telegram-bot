export type AuctionStatus = 'pending' | 'posted' | 'failed';

export interface Group {
  id: number;
  name: string;
  category: string | null;
  telegramId: string;
  minBid: number;
  ownerAddress: string;
  active: boolean;
  totalEarned: number;
  messageCount: number;
  createdAt: string;
}

export interface CreateGroupInput {
  name: string;
  category?: string | null;
  telegramId: string;
  minBid: number;
  ownerAddress: string;
  active?: boolean;
}

export interface Auction {
  id: number;
  groupId: number;
  bidderAddress: string;
  bidderName: string | null;
  amount: number;
  message: string;
  status: AuctionStatus;
  txHash: string | null;
  createdAt: string;
  postedAt: string | null;
  telegramMessageId: number | null;
  telegramChatId: string | null;
  errorReason: string | null;
  responses: AuctionResponse[];
}

export interface CreateAuctionInput {
  groupId: number;
  bidderAddress: string;
  bidderName?: string;
  amount: number;
  message: string;
  txHash?: string | null;
}

export interface AuctionResponse {
  id: number;
  auctionId: number;
  userId: string;
  username: string | null;
  text: string;
  createdAt: string;
}

export interface PaymentDetails {
  amount: number;
  sender: string;
  txHash: string | null;
  currency: string;
  network: string | null;
}

export interface TelegramChat {
  id: number | string;
  type?: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

export interface TelegramUser {
  id: number | string;
  username?: string;
}

export interface TelegramWebhookUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: TelegramChat;
    text?: string;
    reply_to_message?: { message_id: number };
    from?: TelegramUser;
  };
}
