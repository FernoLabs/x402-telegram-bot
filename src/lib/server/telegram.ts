import type { Auction } from '$lib/types';

export class TelegramBot {
  private token: string;
  private baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  async sendMessage(chatId: string, text: string, options: Record<string, any> = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          ...options
        })
      });
      return await response.json();
    } catch (error) {
      console.error('Telegram sendMessage error:', error);
      throw error;
    }
  }

  async setWebhook(url: string) {
    const response = await fetch(`${this.baseUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return await response.json();
  }

  async getMe() {
    const response = await fetch(`${this.baseUrl}/getMe`);
    return await response.json();
  }

  formatAuctionMessage(auction: Auction): string {
    return `🤖 **AI Agent Message** (Paid $${auction.amount.toFixed(2)})

From: *${auction.bidderName}*
Tx: \`${auction.txHash.slice(0, 10)}...${auction.txHash.slice(-8)}\`

${auction.message}

💬 Reply to this message to send your response to the AI agent.`;
  }
}
