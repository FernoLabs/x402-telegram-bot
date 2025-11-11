import type {
        Auction,
        AuctionResponse,
        CreateAuctionInput,
        CreateGroupInput,
        Group,
        MessagePaymentHistoryEntry,
        MessageRating,
        MessageRequest,
        MessageRequestStatus,
        MessageResponse,
        PaymentRequestRecord,
        PaymentRequestStatus,
        PendingPaymentRecord,
        PendingPaymentStatus
} from '$lib/types';

interface GroupRow {
        id: number;
        name: string;
        category: string | null;
        description: string | null;
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

interface MessageResponseRow {
        id: number;
        message_request_id: number;
        user_id: string;
        username: string | null;
        text: string;
        created_at: string;
}

interface MessageRatingRow {
        id: number;
        message_request_id: number;
        rating: number;
        comment: string | null;
        created_at: string;
        updated_at: string;
}

interface PaymentRequestRow {
	id: number;
	payment_id: string;
	nonce: string;
	group_id: number | null;
	amount: number;
	currency: string;
	network: string;
	recipient: string;
	memo: string | null;
	instructions: string | null;
	resource: string | null;
	description: string | null;
	asset_address: string | null;
	asset_type: string | null;
	checkout_url: string | null;
	facilitator_url: string | null;
	status: string;
	expires_at: string;
	last_signature: string | null;
	last_payer_address: string | null;
	created_at: string;
	updated_at: string;
}

interface PendingPaymentRow {
	id: number;
	request_id: number;
	signature: string | null;
	wire_transaction: string | null;
	payer_address: string | null;
	status: string;
	error: string | null;
	created_at: string;
	updated_at: string;
}

interface PaymentJoinRow {
	request_id: number;
	payment_id: string;
	nonce: string;
	group_id: number | null;
	amount: number;
	currency: string;
	network: string;
	recipient: string;
	memo: string | null;
	instructions: string | null;
	resource: string | null;
	description: string | null;
	asset_address: string | null;
	asset_type: string | null;
	checkout_url: string | null;
	facilitator_url: string | null;
	request_status: string;
	expires_at: string;
	last_signature: string | null;
	last_payer_address: string | null;
	request_created_at: string;
	request_updated_at: string;
	pending_id: number | null;
	pending_signature: string | null;
	pending_wire_transaction: string | null;
	pending_payer_address: string | null;
	pending_status: string | null;
	pending_error: string | null;
	pending_created_at: string | null;
	pending_updated_at: string | null;
}

interface MessageRequestRow {
	id: number;
	payment_request_id: number;
	group_id: number;
	wallet_address: string;
	sender_name: string | null;
	message: string;
	status: string;
	last_error: string | null;
	telegram_message_id: number | null;
	telegram_chat_id: string | null;
	sent_at: string | null;
	created_at: string;
	updated_at: string;
}

interface MessageJoinRow extends PaymentJoinRow {
        message_id: number | null;
        message_group_id: number | null;
        message_status: string | null;
        message_sender_name: string | null;
        message_wallet_address: string | null;
        message_text: string | null;
        message_last_error: string | null;
        message_telegram_message_id: number | null;
        message_telegram_chat_id: string | null;
        message_sent_at: string | null;
        message_created_at: string | null;
        message_updated_at: string | null;
        group_name: string | null;
        group_category: string | null;
        group_description: string | null;
        group_telegram_id: string | null;
        group_min_bid: number | null;
        group_owner_address: string | null;
        group_active: number | null;
        group_total_earned: number | null;
        group_message_count: number | null;
        group_created_at: string | null;
        rating_id: number | null;
        rating_message_request_id: number | null;
        rating_value: number | null;
        rating_comment: string | null;
        rating_created_at: string | null;
        rating_updated_at: string | null;
}

interface CreatePaymentRequestInput {
	paymentId?: string;
	nonce?: string;
	groupId?: number | null;
	amount: number;
	currency: string;
	network: string;
	recipient: string;
	memo?: string | null;
	instructions?: string | null;
	resource?: string | null;
	description?: string | null;
	assetAddress?: string | null;
	assetType?: string | null;
	checkoutUrl?: string | null;
	facilitatorUrl?: string | null;
	expiresInSeconds?: number;
}

interface UpdatePaymentRequestStatusInput {
	status: PaymentRequestStatus;
	lastSignature?: string | null;
	lastPayerAddress?: string | null;
}

interface CreatePendingPaymentInput {
	requestId: number;
	signature?: string | null;
	wireTransaction?: string | null;
	payerAddress?: string | null;
	status?: PendingPaymentStatus;
	error?: string | null;
}

interface UpdatePendingPaymentInput {
	status?: PendingPaymentStatus;
	error?: string | null;
	signature?: string | null;
	wireTransaction?: string | null;
	payerAddress?: string | null;
}

interface CreateMessagePaymentInput {
	groupId: number;
	walletAddress: string;
	senderName?: string | null;
	message: string;
	amount: number;
	currency: string;
	network: string;
	recipient: string;
	expiresInSeconds?: number;
	assetAddress?: string | null;
	assetType?: string | null;
}

interface UpdateMessageRequestInput {
	status?: MessageRequestStatus;
	lastError?: string | null;
	telegramMessageId?: number | null;
	telegramChatId?: string | null;
	sentAt?: string | null;
}

export class AuctionRepository {
	private db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async listGroups(): Promise<Group[]> {
                const { results } = await this.db
                        .prepare(
                                `SELECT id, name, category, description, telegram_id, min_bid, owner_address, active, total_earned, message_count, created_at
         FROM groups
         ORDER BY created_at DESC`
                        )
			.all<GroupRow>();

		return (results ?? []).map(mapGroupRow);
	}

	async getGroup(id: number): Promise<Group | null> {
		const row = await this.db
                        .prepare(
                                `SELECT id, name, category, description, telegram_id, min_bid, owner_address, active, total_earned, message_count, created_at
         FROM groups
         WHERE id = ?`
                        )
			.bind(id)
			.first<GroupRow>();

		return row ? mapGroupRow(row) : null;
	}

	async getGroupByTelegramId(
		telegramId: string,
		alternateIds: string[] = []
	): Promise<Group | null> {
		const identifiers = collectTelegramIdentifiers(telegramId, alternateIds);

		if (identifiers.length === 0) {
			return null;
		}

		const placeholders = identifiers.map(() => '?').join(', ');

		const row = await this.db
                        .prepare(
                                `SELECT id, name, category, description, telegram_id, min_bid, owner_address, active, total_earned, message_count, created_at
         FROM groups
         WHERE LOWER(REPLACE(TRIM(telegram_id), '@', '')) IN (${placeholders})
         LIMIT 1`
			)
			.bind(...identifiers)
			.first<GroupRow>();

		return row ? mapGroupRow(row) : null;
	}

	async createGroup(input: CreateGroupInput): Promise<Group> {
		const result = await this.db
                        .prepare(
                                `INSERT INTO groups (name, category, description, telegram_id, min_bid, owner_address, active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
                        )
                        .bind(
                                input.name,
                                input.category ?? null,
                                input.description ?? null,
                                input.telegramId.trim(),
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
                                `SELECT id, name, category, description, telegram_id, min_bid, owner_address, active, total_earned, message_count, created_at
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

	async updateGroupConfig(
		telegramId: string,
		updates: { minBid?: number; ownerAddress?: string }
	): Promise<Group | null> {
		const assignments: string[] = [];
		const values: Array<number | string> = [];

		if (typeof updates.minBid !== 'undefined') {
			assignments.push('min_bid = ?');
			values.push(updates.minBid);
		}

		if (typeof updates.ownerAddress !== 'undefined') {
			assignments.push('owner_address = ?');
			values.push(updates.ownerAddress);
		}

		if (assignments.length === 0) {
			return this.getGroupByTelegramId(telegramId);
		}

		const identifiers = collectTelegramIdentifiers(telegramId, []);

		if (identifiers.length === 0) {
			return this.getGroupByTelegramId(telegramId);
		}

		const placeholders = identifiers.map(() => '?').join(', ');

		await this.db
			.prepare(
				`UPDATE groups SET ${assignments.join(', ')} WHERE LOWER(REPLACE(TRIM(telegram_id), '@', '')) IN (${placeholders})`
			)
			.bind(...values, ...identifiers)
			.run();

		return this.getGroupByTelegramId(telegramId);
	}

	async setGroupActiveStatus(
		telegramId: string,
		active: boolean,
		alternateIds: string[] = []
	): Promise<boolean> {
		const identifiers = collectTelegramIdentifiers(telegramId, alternateIds);

		if (identifiers.length === 0) {
			return false;
		}

		const placeholders = identifiers.map(() => '?').join(', ');

		const result = await this.db
			.prepare(
				`UPDATE groups
         SET active = ?
         WHERE LOWER(REPLACE(TRIM(telegram_id), '@', '')) IN (${placeholders})`
			)
			.bind(active ? 1 : 0, ...identifiers)
			.run();

		return Number(result.meta.changes ?? 0) > 0;
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

		const { results } = groupId
			? await statement.bind(groupId).all<AuctionRow>()
			: await statement.all<AuctionRow>();

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
			.bind(
				input.groupId,
				input.bidderAddress,
				input.bidderName ?? null,
				input.amount,
				input.message,
				input.txHash ?? null
			)
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
			.bind(
				options.telegramMessageId,
				options.telegramChatId,
				options.postedAt ?? new Date().toISOString(),
				auctionId
			)
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

        async recordMessageResponse(input: {
                messageRequestId: number;
                userId: string;
                username: string | null;
                text: string;
        }): Promise<MessageResponse> {
                const result = await this.db
                        .prepare(
                                `INSERT INTO message_responses (message_request_id, user_id, username, text)
         VALUES (?, ?, ?, ?)`
                        )
                        .bind(input.messageRequestId, input.userId, input.username, input.text)
                        .run();

                const insertedId = Number(result.meta.last_row_id ?? 0);
                if (!Number.isFinite(insertedId) || insertedId <= 0) {
                        throw new Error('Failed to insert message response');
                }

                const row = await this.db
                        .prepare(
                                `SELECT id, message_request_id, user_id, username, text, created_at
         FROM message_responses
         WHERE id = ?`
                        )
                        .bind(insertedId)
                        .first<MessageResponseRow>();

                if (!row) {
                        throw new Error('Failed to fetch message response after insert');
                }

                return mapMessageResponseRow(row);
        }

        async listResponsesForMessageRequest(messageRequestId: number): Promise<MessageResponse[]> {
                const { results } = await this.db
                        .prepare(
                                `SELECT id, message_request_id, user_id, username, text, created_at
         FROM message_responses
         WHERE message_request_id = ?
         ORDER BY created_at ASC`
                        )
                        .bind(messageRequestId)
                        .all<MessageResponseRow>();

                return (results ?? []).map(mapMessageResponseRow);
        }

        async getMessageRating(messageRequestId: number): Promise<MessageRating | null> {
                const row = await this.db
                        .prepare(
                                `SELECT id, message_request_id, rating, comment, created_at, updated_at
         FROM message_ratings
         WHERE message_request_id = ?`
                        )
                        .bind(messageRequestId)
                        .first<MessageRatingRow>();

                return row ? mapMessageRatingRow(row) : null;
        }

        async saveMessageRating(input: {
                messageRequestId: number;
                rating: number;
                comment?: string | null;
        }): Promise<MessageRating> {
                await this.db
                        .prepare(
                                `INSERT INTO message_ratings (message_request_id, rating, comment)
         VALUES (?, ?, ?)
         ON CONFLICT(message_request_id) DO UPDATE SET
           rating = excluded.rating,
           comment = excluded.comment,
           updated_at = CURRENT_TIMESTAMP`
                        )
                        .bind(input.messageRequestId, input.rating, input.comment ?? null)
                        .run();

                const row = await this.db
                        .prepare(
                                `SELECT id, message_request_id, rating, comment, created_at, updated_at
         FROM message_ratings
         WHERE message_request_id = ?`
                        )
                        .bind(input.messageRequestId)
                        .first<MessageRatingRow>();

                if (!row) {
                        throw new Error('Failed to fetch message rating after save');
                }

                return mapMessageRatingRow(row);
        }

	private resolvePaymentIdentifier(candidate?: string | null): string {
		if (candidate && candidate.trim()) {
			return candidate.trim();
		}

		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return crypto.randomUUID();
		}

		return `payment-${Date.now()}-${Math.random()}`;
	}

	async createPaymentRequest(input: CreatePaymentRequestInput): Promise<PaymentRequestRecord> {
		const paymentId = this.resolvePaymentIdentifier(input.paymentId ?? null);
		const nonce = this.resolvePaymentIdentifier(input.nonce ?? null);
		const expiresInSeconds =
			input.expiresInSeconds && input.expiresInSeconds > 0 ? input.expiresInSeconds : 10 * 60;
		const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

		await this.db
			.prepare(
				`INSERT INTO payment_requests (
           payment_id,
           nonce,
           group_id,
           amount,
           currency,
           network,
           recipient,
           memo,
           instructions,
           resource,
           description,
           asset_address,
           asset_type,
           checkout_url,
           facilitator_url,
           status,
           expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
			)
			.bind(
				paymentId,
				nonce,
				input.groupId ?? null,
				input.amount,
				input.currency,
				input.network,
				input.recipient,
				input.memo ?? null,
				input.instructions ?? null,
				input.resource ?? null,
				input.description ?? null,
				input.assetAddress ?? null,
				input.assetType ?? null,
				input.checkoutUrl ?? null,
				input.facilitatorUrl ?? null,
				expiresAt
			)
			.run();

		const row = await this.db
			.prepare(
				`SELECT id, payment_id, nonce, group_id, amount, currency, network, recipient, memo, instructions,
                resource, description, asset_address, asset_type, checkout_url, facilitator_url, status,
                expires_at, last_signature, last_payer_address, created_at, updated_at
         FROM payment_requests
         WHERE payment_id = ?`
			)
			.bind(paymentId)
			.first<PaymentRequestRow>();

		if (!row) {
			throw new Error('Failed to fetch payment request after insert');
		}

		return mapPaymentRequestRow(row);
	}

	async createMessagePaymentRequest(
		input: CreateMessagePaymentInput
	): Promise<{ payment: PaymentRequestRecord; message: MessageRequest }> {
		const payment = await this.createPaymentRequest({
			groupId: input.groupId,
			amount: input.amount,
			currency: input.currency,
			network: input.network,
			recipient: input.recipient,
			memo: input.message,
			description: `Message payment for group ${input.groupId}`,
			expiresInSeconds: input.expiresInSeconds,
			assetAddress: input.assetAddress ?? null,
			assetType: input.assetType ?? null
		});

		await this.db
			.prepare(
				`INSERT INTO message_requests (
           payment_request_id,
           group_id,
           wallet_address,
           sender_name,
           message,
           status
         ) VALUES (?, ?, ?, ?, ?, 'awaiting_payment')`
			)
			.bind(payment.id, input.groupId, input.walletAddress, input.senderName ?? null, input.message)
			.run();

		const row = await this.db
			.prepare(
				`SELECT
           id,
           payment_request_id,
           group_id,
           wallet_address,
           sender_name,
           message,
           status,
           last_error,
           telegram_message_id,
           telegram_chat_id,
           sent_at,
           created_at,
           updated_at
         FROM message_requests
         WHERE payment_request_id = ?`
			)
			.bind(payment.id)
			.first<MessageRequestRow>();

                if (!row) {
                        throw new Error('Failed to fetch message request after insert');
                }

                const message = mapMessageRequestRow(row);
                message.responses = [];
                message.rating = null;
                return { payment, message };
        }

	async getPaymentRequestById(id: number): Promise<PaymentRequestRecord | null> {
		const row = await this.db
			.prepare(
				`SELECT id, payment_id, nonce, group_id, amount, currency, network, recipient, memo, instructions,
                resource, description, asset_address, asset_type, checkout_url, facilitator_url, status,
                expires_at, last_signature, last_payer_address, created_at, updated_at
         FROM payment_requests
         WHERE id = ?`
			)
			.bind(id)
			.first<PaymentRequestRow>();

		return row ? mapPaymentRequestRow(row) : null;
	}

        async getPaymentRequestByPaymentId(paymentId: string): Promise<PaymentRequestRecord | null> {
                const row = await this.db
                        .prepare(
                                `SELECT id, payment_id, nonce, group_id, amount, currency, network, recipient, memo, instructions,
                resource, description, asset_address, asset_type, checkout_url, facilitator_url, status,
                expires_at, last_signature, last_payer_address, created_at, updated_at
         FROM payment_requests
         WHERE payment_id = ?`
                        )
                        .bind(paymentId)
                        .first<PaymentRequestRow>();

                return row ? mapPaymentRequestRow(row) : null;
        }

        async getMessageRequestByTelegramMessage(
                messageId: number,
                chatId: string
        ): Promise<MessageRequest | null> {
                const row = await this.db
                        .prepare(
                                `SELECT
           id,
           payment_request_id,
           group_id,
           wallet_address,
           sender_name,
           message,
           status,
           last_error,
           telegram_message_id,
           telegram_chat_id,
           sent_at,
           created_at,
           updated_at
         FROM message_requests
         WHERE telegram_message_id = ? AND telegram_chat_id = ?`
                        )
                        .bind(messageId, chatId)
                        .first<MessageRequestRow>();

                if (!row) {
                        return null;
                }

                const request = mapMessageRequestRow(row);
                request.responses = await this.listResponsesForMessageRequest(request.id);
                request.rating = await this.getMessageRating(request.id);
                return request;
        }

        async getMessageRequest(id: number): Promise<MessageRequest | null> {
                const row = await this.db
                        .prepare(
                                `SELECT
           id,
           payment_request_id,
           group_id,
           wallet_address,
           sender_name,
           message,
           status,
           last_error,
           telegram_message_id,
           telegram_chat_id,
           sent_at,
           created_at,
           updated_at
         FROM message_requests
         WHERE id = ?`
                        )
                        .bind(id)
                        .first<MessageRequestRow>();

                if (!row) {
                        return null;
                }

                const request = mapMessageRequestRow(row);
                request.responses = await this.listResponsesForMessageRequest(request.id);
                request.rating = await this.getMessageRating(request.id);
                return request;
        }

        async updatePaymentRequestStatus(
                requestId: number,
                updates: UpdatePaymentRequestStatusInput
        ): Promise<PaymentRequestRecord | null> {
                const assignments: string[] = ['status = ?'];
		const values: Array<string | null> = [updates.status];

		if (Object.prototype.hasOwnProperty.call(updates, 'lastSignature')) {
			assignments.push('last_signature = ?');
			values.push(updates.lastSignature ?? null);
		}

		if (Object.prototype.hasOwnProperty.call(updates, 'lastPayerAddress')) {
			assignments.push('last_payer_address = ?');
			values.push(updates.lastPayerAddress ?? null);
		}

		assignments.push('updated_at = CURRENT_TIMESTAMP');

                await this.db
                        .prepare(`UPDATE payment_requests SET ${assignments.join(', ')} WHERE id = ?`)
                        .bind(...values, requestId)
                        .run();

                return this.getPaymentRequestById(requestId);
        }

        async updatePaymentRequestCurrency(
                requestId: number,
                updates: { currency: string; assetAddress: string | null; assetType?: string | null }
        ): Promise<PaymentRequestRecord | null> {
                await this.db
                        .prepare(
                                `UPDATE payment_requests
           SET currency = ?,
               asset_address = ?,
               asset_type = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
                        )
                        .bind(
                                updates.currency,
                                updates.assetAddress ?? null,
                                updates.assetType ?? (updates.assetAddress ? 'spl-token' : null),
                                requestId
                        )
                        .run();

                return this.getPaymentRequestById(requestId);
        }

	async createPendingPayment(input: CreatePendingPaymentInput): Promise<PendingPaymentRecord> {
		const status = input.status ?? 'pending';

		const result = await this.db
			.prepare(
				`INSERT INTO pending_payments (
           request_id,
           signature,
           wire_transaction,
           payer_address,
           status,
           error
         ) VALUES (?, ?, ?, ?, ?, ?)`
			)
			.bind(
				input.requestId,
				input.signature ?? null,
				input.wireTransaction ?? null,
				input.payerAddress ?? null,
				status,
				input.error ?? null
			)
			.run();

		const insertedId = Number(result.meta.last_row_id ?? 0);
		if (!Number.isFinite(insertedId) || insertedId <= 0) {
			throw new Error('Failed to insert pending payment');
		}

		const row = await this.db
			.prepare(
				`SELECT id, request_id, signature, wire_transaction, payer_address, status, error, created_at, updated_at
         FROM pending_payments
         WHERE id = ?`
			)
			.bind(insertedId)
			.first<PendingPaymentRow>();

		if (!row) {
			throw new Error('Failed to fetch pending payment after insert');
		}

		return mapPendingPaymentRow(row);
	}

	async updatePendingPayment(
		id: number,
		updates: UpdatePendingPaymentInput
	): Promise<PendingPaymentRecord | null> {
		const assignments: string[] = [];
		const values: Array<string | null> = [];

		if (Object.prototype.hasOwnProperty.call(updates, 'status') && updates.status) {
			assignments.push('status = ?');
			values.push(updates.status);
		}

		if (Object.prototype.hasOwnProperty.call(updates, 'error')) {
			assignments.push('error = ?');
			values.push(updates.error ?? null);
		}

		if (Object.prototype.hasOwnProperty.call(updates, 'signature')) {
			assignments.push('signature = ?');
			values.push(updates.signature ?? null);
		}

		if (Object.prototype.hasOwnProperty.call(updates, 'wireTransaction')) {
			assignments.push('wire_transaction = ?');
			values.push(updates.wireTransaction ?? null);
		}

		if (Object.prototype.hasOwnProperty.call(updates, 'payerAddress')) {
			assignments.push('payer_address = ?');
			values.push(updates.payerAddress ?? null);
		}

		if (assignments.length === 0) {
			return this.getPendingPaymentById(id);
		}

		assignments.push('updated_at = CURRENT_TIMESTAMP');

		await this.db
			.prepare(`UPDATE pending_payments SET ${assignments.join(', ')} WHERE id = ?`)
			.bind(...values, id)
			.run();

		return this.getPendingPaymentById(id);
	}

	async getPendingPaymentById(id: number): Promise<PendingPaymentRecord | null> {
		const row = await this.db
			.prepare(
				`SELECT id, request_id, signature, wire_transaction, payer_address, status, error, created_at, updated_at
         FROM pending_payments
         WHERE id = ?`
			)
			.bind(id)
			.first<PendingPaymentRow>();

		return row ? mapPendingPaymentRow(row) : null;
	}

	async getPendingPaymentBySignature(signature: string): Promise<PendingPaymentRecord | null> {
		const row = await this.db
			.prepare(
				`SELECT id, request_id, signature, wire_transaction, payer_address, status, error, created_at, updated_at
         FROM pending_payments
         WHERE signature = ?
         ORDER BY created_at DESC
         LIMIT 1`
			)
			.bind(signature)
			.first<PendingPaymentRow>();

		return row ? mapPendingPaymentRow(row) : null;
	}

        async getMessageRequestByPaymentId(paymentId: string): Promise<MessageRequest | null> {
                const row = await this.db
                        .prepare(
                                `SELECT
           mr.id,
           mr.payment_request_id,
           mr.group_id,
           mr.wallet_address,
           mr.sender_name,
           mr.message,
           mr.status,
           mr.last_error,
           mr.telegram_message_id,
           mr.telegram_chat_id,
           mr.sent_at,
           mr.created_at,
           mr.updated_at
         FROM message_requests mr
         INNER JOIN payment_requests pr ON pr.id = mr.payment_request_id
         WHERE pr.payment_id = ?`
                        )
                        .bind(paymentId)
                        .first<MessageRequestRow>();

                if (!row) {
                        return null;
                }

                const request = mapMessageRequestRow(row);
                request.responses = await this.listResponsesForMessageRequest(request.id);
                request.rating = await this.getMessageRating(request.id);
                return request;
        }

        async updateMessageRequest(
                id: number,
                input: UpdateMessageRequestInput
        ): Promise<MessageRequest | null> {
		const assignments: string[] = [];
		const values: unknown[] = [];

		if (input.status) {
			assignments.push('status = ?');
			values.push(input.status);
		}

		if (Object.prototype.hasOwnProperty.call(input, 'lastError')) {
			assignments.push('last_error = ?');
			values.push(input.lastError ?? null);
		}

		if (Object.prototype.hasOwnProperty.call(input, 'telegramMessageId')) {
			assignments.push('telegram_message_id = ?');
			values.push(input.telegramMessageId ?? null);
		}

		if (Object.prototype.hasOwnProperty.call(input, 'telegramChatId')) {
			assignments.push('telegram_chat_id = ?');
			values.push(input.telegramChatId ?? null);
		}

		if (Object.prototype.hasOwnProperty.call(input, 'sentAt')) {
			assignments.push('sent_at = ?');
			values.push(input.sentAt ?? null);
		}

		assignments.push('updated_at = CURRENT_TIMESTAMP');

		await this.db
			.prepare(`UPDATE message_requests SET ${assignments.join(', ')} WHERE id = ?`)
			.bind(...values, id)
			.run();

                const row = await this.db
                        .prepare(
                                `SELECT
           id,
           payment_request_id,
           group_id,
           wallet_address,
           sender_name,
           message,
           status,
           last_error,
           telegram_message_id,
           telegram_chat_id,
           sent_at,
           created_at,
           updated_at
         FROM message_requests
         WHERE id = ?`
                        )
                        .bind(id)
                        .first<MessageRequestRow>();

                if (!row) {
                        return null;
                }

                const request = mapMessageRequestRow(row);
                request.responses = await this.listResponsesForMessageRequest(request.id);
                request.rating = await this.getMessageRating(request.id);
                return request;
        }

	async listPaymentsForWallet(payerAddress: string): Promise<MessagePaymentHistoryEntry[]> {
		const { results } = await this.db
			.prepare(
				`SELECT
           pr.id AS request_id,
           pr.payment_id,
           pr.nonce,
           pr.group_id,
           pr.amount,
           pr.currency,
           pr.network,
           pr.recipient,
           pr.memo,
           pr.instructions,
           pr.resource,
           pr.description,
           pr.asset_address,
           pr.asset_type,
           pr.checkout_url,
           pr.facilitator_url,
           pr.status AS request_status,
           pr.expires_at,
           pr.last_signature,
           pr.last_payer_address,
           pr.created_at AS request_created_at,
           pr.updated_at AS request_updated_at,
           pp.id AS pending_id,
           pp.signature AS pending_signature,
           pp.wire_transaction AS pending_wire_transaction,
           pp.payer_address AS pending_payer_address,
           pp.status AS pending_status,
           pp.error AS pending_error,
           pp.created_at AS pending_created_at,
           pp.updated_at AS pending_updated_at,
           mr.id AS message_id,
           mr.group_id AS message_group_id,
           mr.status AS message_status,
           mr.sender_name AS message_sender_name,
           mr.wallet_address AS message_wallet_address,
           mr.message AS message_text,
           mr.last_error AS message_last_error,
           mr.telegram_message_id AS message_telegram_message_id,
           mr.telegram_chat_id AS message_telegram_chat_id,
           mr.sent_at AS message_sent_at,
           mr.created_at AS message_created_at,
           mr.updated_at AS message_updated_at,
           g.name AS group_name,
           g.category AS group_category,
           g.description AS group_description,
           g.telegram_id AS group_telegram_id,
           g.min_bid AS group_min_bid,
           g.owner_address AS group_owner_address,
           g.active AS group_active,
           g.total_earned AS group_total_earned,
           g.message_count AS group_message_count,
           g.created_at AS group_created_at,
           mrating.id AS rating_id,
           mrating.message_request_id AS rating_message_request_id,
           mrating.rating AS rating_value,
           mrating.comment AS rating_comment,
           mrating.created_at AS rating_created_at,
           mrating.updated_at AS rating_updated_at
         FROM payment_requests pr
         LEFT JOIN pending_payments pp ON pp.id = (
           SELECT id
           FROM pending_payments
           WHERE request_id = pr.id
           ORDER BY created_at DESC
           LIMIT 1
         )
         LEFT JOIN message_requests mr ON mr.payment_request_id = pr.id
         LEFT JOIN message_ratings mrating ON mrating.message_request_id = mr.id
         LEFT JOIN groups g ON g.id = COALESCE(mr.group_id, pr.group_id)
        WHERE mr.wallet_address = ? OR pr.last_payer_address = ? OR pp.payer_address = ?
        ORDER BY COALESCE(pp.created_at, pr.updated_at) DESC`
			)
			.bind(payerAddress, payerAddress, payerAddress)
			.all<MessageJoinRow>();

                const entries: MessagePaymentHistoryEntry[] = [];

                for (const row of results ?? []) {
                        const entry = mapMessageJoinRow(row);
                        if (entry.message) {
                                entry.message.responses = await this.listResponsesForMessageRequest(entry.message.id);
                        }

                        entries.push(entry);
                }

                return entries;
        }
}

function mapGroupRow(row: GroupRow): Group {
        return {
                id: Number(row.id),
                name: row.name,
                category: row.category,
                description: row.description,
                telegramId: row.telegram_id,
                minBid: Number(row.min_bid),
                ownerAddress: row.owner_address,
                active: Boolean(Number(row.active ?? 0)),
                totalEarned: Number(row.total_earned ?? 0),
                messageCount: Number(row.message_count ?? 0),
                createdAt: row.created_at
        };
}

function mapAuctionRow(row: AuctionRow): Auction {
        return {
                id: Number(row.id),
                groupId: Number(row.group_id),
                bidderAddress: row.bidder_address,
                bidderName: row.bidder_name,
                amount: Number(row.amount),
                message: row.message,
                status: row.status as Auction['status'],
                txHash: row.tx_hash,
                createdAt: row.created_at,
                postedAt: row.posted_at,
                telegramMessageId:
                        row.telegram_message_id !== null && row.telegram_message_id !== undefined
                                ? Number(row.telegram_message_id)
                                : null,
                telegramChatId: row.telegram_chat_id,
                errorReason: row.error_reason,
                responses: []
        };
}

function mapResponseRow(row: ResponseRow): AuctionResponse {
        return {
                id: Number(row.id),
                auctionId: Number(row.auction_id),
                userId: row.user_id,
                username: row.username,
                text: row.text,
                createdAt: row.created_at
        };
}

function mapMessageResponseRow(row: MessageResponseRow): MessageResponse {
        return {
                id: Number(row.id),
                messageRequestId: Number(row.message_request_id),
                userId: row.user_id,
                username: row.username,
                text: row.text,
                createdAt: row.created_at
        };
}

function mapMessageRatingRow(row: MessageRatingRow): MessageRating {
        return {
                id: Number(row.id),
                messageRequestId: Number(row.message_request_id),
                rating: Number(row.rating),
                comment: row.comment,
                createdAt: row.created_at,
                updatedAt: row.updated_at
        };
}

function mapPaymentRequestRow(row: PaymentRequestRow): PaymentRequestRecord {
        return {
                id: Number(row.id),
                paymentId: row.payment_id,
                nonce: row.nonce,
                groupId: row.group_id !== null && row.group_id !== undefined ? Number(row.group_id) : null,
                amount: Number(row.amount),
                currency: row.currency,
                network: row.network,
                recipient: row.recipient,
                memo: row.memo,
		instructions: row.instructions,
		resource: row.resource,
		description: row.description,
		assetAddress: row.asset_address,
		assetType: row.asset_type,
		checkoutUrl: row.checkout_url,
                facilitatorUrl: row.facilitator_url,
                status: row.status as PaymentRequestStatus,
                expiresAt: row.expires_at,
                lastSignature: row.last_signature,
                lastPayerAddress: row.last_payer_address,
                createdAt: row.created_at,
                updatedAt: row.updated_at
        };
}

function mapPendingPaymentRow(row: PendingPaymentRow): PendingPaymentRecord {
        return {
                id: Number(row.id),
                requestId: Number(row.request_id),
                signature: row.signature,
                wireTransaction: row.wire_transaction,
                payerAddress: row.payer_address,
                status: row.status as PendingPaymentStatus,
                error: row.error,
                createdAt: row.created_at,
                updatedAt: row.updated_at
        };
}

function mapMessageRequestRow(row: MessageRequestRow): MessageRequest {
        return {
                id: Number(row.id),
                paymentRequestId: Number(row.payment_request_id),
                groupId: Number(row.group_id),
                walletAddress: row.wallet_address,
                senderName: row.sender_name,
                message: row.message,
                status: row.status as MessageRequestStatus,
                lastError: row.last_error,
                telegramMessageId:
                        row.telegram_message_id !== null && row.telegram_message_id !== undefined
                                ? Number(row.telegram_message_id)
                                : null,
                telegramChatId: row.telegram_chat_id,
                sentAt: row.sent_at,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                responses: [],
                rating: null
        };
}

function mapMessageJoinRow(row: MessageJoinRow): MessagePaymentHistoryEntry {
        const request: PaymentRequestRecord = {
                id: Number(row.request_id),
                paymentId: row.payment_id,
                nonce: row.nonce,
                groupId: row.group_id !== null && row.group_id !== undefined ? Number(row.group_id) : null,
                amount: Number(row.amount),
                currency: row.currency,
                network: row.network,
                recipient: row.recipient,
                memo: row.memo,
		instructions: row.instructions,
		resource: row.resource,
		description: row.description,
		assetAddress: row.asset_address,
		assetType: row.asset_type,
		checkoutUrl: row.checkout_url,
                facilitatorUrl: row.facilitator_url,
                status: row.request_status as PaymentRequestStatus,
                expiresAt: row.expires_at,
                lastSignature: row.last_signature,
                lastPayerAddress: row.last_payer_address,
                createdAt: row.request_created_at,
                updatedAt: row.request_updated_at
        };

        const pending: PendingPaymentRecord | null = row.pending_id
                ? {
                                id: Number(row.pending_id),
                                requestId: Number(row.request_id),
                                signature: row.pending_signature,
                                wireTransaction: row.pending_wire_transaction,
                                payerAddress: row.pending_payer_address,
                                status: (row.pending_status as PendingPaymentStatus) ?? 'pending',
                                error: row.pending_error,
				createdAt: row.pending_created_at ?? request.updatedAt,
				updatedAt: row.pending_updated_at ?? request.updatedAt
			}
		: null;

        const message: MessageRequest | null = row.message_id
                ? {
                                id: Number(row.message_id),
                                paymentRequestId: Number(row.request_id),
                                groupId: Number(row.message_group_id ?? row.group_id ?? 0),
                                walletAddress: row.message_wallet_address ?? row.last_payer_address ?? '',
                                senderName: row.message_sender_name,
                                message: row.message_text ?? '',
                                status: (row.message_status as MessageRequestStatus) ?? 'awaiting_payment',
                                lastError: row.message_last_error ?? null,
                                telegramMessageId:
                                        row.message_telegram_message_id !== null &&
                                        row.message_telegram_message_id !== undefined
                                                ? Number(row.message_telegram_message_id)
                                                : null,
                                telegramChatId: row.message_telegram_chat_id ?? null,
                                sentAt: row.message_sent_at ?? null,
                                createdAt: row.message_created_at ?? request.createdAt,
                                updatedAt: row.message_updated_at ?? request.updatedAt,
                                responses: [],
                                rating:
                                        row.rating_id !== null && row.rating_id !== undefined
                                                ? {
                                                                id: Number(row.rating_id),
                                                                messageRequestId:
                                                                        row.rating_message_request_id !== null &&
                                                                        row.rating_message_request_id !== undefined
                                                                                ? Number(row.rating_message_request_id)
                                                                                : Number(row.message_id),
                                                                rating: Number(row.rating_value ?? 0),
                                                                comment: row.rating_comment ?? null,
                                                                createdAt:
                                                                        row.rating_created_at ??
                                                                        row.message_updated_at ??
                                                                        request.createdAt,
                                                                updatedAt:
                                                                        row.rating_updated_at ??
                                                                        row.rating_created_at ??
                                                                        row.message_updated_at ??
                                                                        request.updatedAt
                                                        }
                                                : null
                        }
                : null;

        const groupId =
                row.group_id !== null && row.group_id !== undefined
                        ? Number(row.group_id)
                        : row.message_group_id !== null && row.message_group_id !== undefined
                                ? Number(row.message_group_id)
                                : null;

        const group: Group | null = groupId
                ? {
                                id: groupId,
                                name: row.group_name ?? '',
                                category: row.group_category,
                                description: row.group_description ?? null,
                                telegramId: row.group_telegram_id ?? '',
                                minBid: Number(row.group_min_bid ?? request.amount),
                                ownerAddress: row.group_owner_address ?? request.recipient,
                                active: Boolean(Number(row.group_active ?? 0)),
                                totalEarned: Number(row.group_total_earned ?? 0),
                                messageCount: Number(row.group_message_count ?? 0),
                                createdAt: row.group_created_at ?? request.createdAt
                        }
                : null;

	return { request, pending, message, group };
}

function collectTelegramIdentifiers(primary: string, alternates: string[]): string[] {
	return Array.from(
		new Set(
			[primary, ...alternates]
				.map(normalizeTelegramIdentifier)
				.filter((value): value is string => Boolean(value))
		)
	);
}

function normalizeTelegramIdentifier(value: string | number | null | undefined): string | null {
	if (typeof value === 'number') {
		return value.toString();
	}

	if (typeof value !== 'string') {
		return null;
	}

	let normalized = value.trim();
	if (!normalized) {
		return null;
	}

	normalized = normalized.replace(/^https?:\/\/t\.me\//i, '');
	normalized = normalized.replace(/^t\.me\//i, '');

	if (normalized.startsWith('@')) {
		normalized = normalized.slice(1);
	}

	normalized = normalized.trim();
	if (!normalized) {
		return null;
	}

	if (/^-?\d+$/.test(normalized)) {
		return normalized;
	}

	return normalized.toLowerCase();
}
