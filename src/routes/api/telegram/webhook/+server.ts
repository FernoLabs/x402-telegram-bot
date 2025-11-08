import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const update = await request.json();

    // Handle replies to auction messages
    if (update.message?.reply_to_message && update.message.text) {
      const replyText = update.message.text;
      const username = update.message.from.username || 'Anonymous';
      const userId = update.message.from.id;
      
      // Extract auction ID from message (implement proper tracking in production)
      // For now, log the response
      console.log(`Response from @${username} (${userId}): ${replyText}`);
      
      // In production: 
      // 1. Extract auction ID from reply_to_message
      // 2. Add response to auction
      // 3. Notify AI agent via webhook/API
    }

    return json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return json({ error: 'Webhook processing failed' }, { status: 500 });
  }
};
