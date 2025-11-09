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

export type PaymentRequestStatus = 'pending' | 'submitted' | 'confirmed' | 'expired' | 'cancelled';

export interface PaymentRequestRecord {
	id: number;
	paymentId: string;
	nonce: string;
	groupId: number | null;
	amount: number;
	currency: string;
	network: string;
	recipient: string;
	memo: string | null;
	instructions: string | null;
	resource: string | null;
	description: string | null;
	assetAddress: string | null;
	assetType: string | null;
	checkoutUrl: string | null;
	facilitatorUrl: string | null;
	status: PaymentRequestStatus;
	expiresAt: string;
	lastSignature: string | null;
	lastPayerAddress: string | null;
	createdAt: string;
	updatedAt: string;
}

export type PendingPaymentStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';

export interface PendingPaymentRecord {
	id: number;
	requestId: number;
	signature: string | null;
	wireTransaction: string | null;
	payerAddress: string | null;
	status: PendingPaymentStatus;
	error: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface PaymentHistoryEntry {
	request: PaymentRequestRecord;
	pending: PendingPaymentRecord | null;
	verification?: (PaymentDetails & { slot: number; blockTime: number | null }) | null;
}

export type MessageRequestStatus =
	| 'awaiting_payment'
	| 'signature_saved'
	| 'paid'
	| 'sent'
	| 'failed';

export interface MessageRequest {
	id: number;
	paymentRequestId: number;
	groupId: number;
	walletAddress: string;
	senderName: string | null;
	message: string;
	status: MessageRequestStatus;
	lastError: string | null;
	telegramMessageId: number | null;
	telegramChatId: string | null;
	sentAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface MessagePaymentHistoryEntry extends PaymentHistoryEntry {
	message: MessageRequest | null;
	group: Group | null;
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
