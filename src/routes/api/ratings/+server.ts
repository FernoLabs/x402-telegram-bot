import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AuctionRepository } from '$lib/server/db';

interface SaveRatingPayload {
        messageRequestId?: number | string;
        rating?: number | string;
        comment?: string | null;
        walletAddress?: string | null;
}

const MAX_COMMENT_LENGTH = 500;

export const POST: RequestHandler = async ({ request, platform }) => {
        try {
                const env = platform?.env;
                if (!env?.DB) {
                        throw new Error('D1 database binding `DB` is not configured.');
                }

                let payload: SaveRatingPayload;
                try {
                        payload = (await request.json()) as SaveRatingPayload;
                } catch (error) {
                        return json({ error: 'Invalid JSON body' }, { status: 400 });
                }

                const messageRequestId = Number(payload.messageRequestId);
                if (!Number.isFinite(messageRequestId) || messageRequestId <= 0) {
                        return json({ error: 'messageRequestId must be a positive number' }, { status: 400 });
                }

                const numericRating = Number(payload.rating);
                if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
                        return json({ error: 'rating must be between 1 and 5' }, { status: 400 });
                }

                const roundedRating = Math.round(numericRating);
                if (roundedRating !== numericRating) {
                        return json({ error: 'rating must be a whole number between 1 and 5' }, { status: 400 });
                }

                const walletAddress = typeof payload.walletAddress === 'string' ? payload.walletAddress.trim() : '';
                if (!walletAddress) {
                        return json({ error: 'walletAddress is required' }, { status: 400 });
                }

                const rawComment = typeof payload.comment === 'string' ? payload.comment.trim() : '';
                if (rawComment.length > MAX_COMMENT_LENGTH) {
                        return json(
                                { error: `comment must be ${MAX_COMMENT_LENGTH} characters or fewer` },
                                { status: 400 }
                        );
                }

                const comment = rawComment.length > 0 ? rawComment : null;

                const repo = new AuctionRepository(env.DB);
                const messageRequest = await repo.getMessageRequest(messageRequestId);

                if (!messageRequest) {
                        return json({ error: 'Message request not found' }, { status: 404 });
                }

                if (messageRequest.walletAddress !== walletAddress) {
                        return json({ error: 'You are not authorized to rate this message' }, { status: 403 });
                }

                if (messageRequest.status !== 'sent') {
                        return json({ error: 'Ratings are only allowed after the message has been delivered' }, { status: 409 });
                }

                if (!messageRequest.responses || messageRequest.responses.length === 0) {
                        return json({ error: 'Submit a rating after at least one reply has been recorded' }, { status: 409 });
                }

                const rating = await repo.saveMessageRating({
                        messageRequestId: messageRequest.id,
                        rating: roundedRating,
                        comment
                });

                return json({ rating }, { status: 200 });
        } catch (error) {
                console.error('Failed to save message rating', error);
                return json({ error: 'Failed to save message rating' }, { status: 500 });
        }
};
