interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number | string };
}

export interface TelegramChatMember {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  user: {
    id: number | string;
    username?: string;
  };
}

export class TelegramBot {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  async setWebhook(url: string, secretToken?: string): Promise<TelegramApiResponse<true>> {
    return this.call<true>('setWebhook', {
      url,
      secret_token: secretToken
    });
  }

  async deleteWebhook(): Promise<TelegramApiResponse<true>> {
    return this.call<true>('deleteWebhook', {});
  }

  async sendMessage(payload: {
    chat_id: string;
    text: string;
    parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
    disable_web_page_preview?: boolean;
    reply_to_message_id?: number;
  }): Promise<TelegramApiResponse<TelegramMessage>> {
    return this.call<TelegramMessage>('sendMessage', payload);
  }

  async getChatMember(
    chatId: string,
    userId: string
  ): Promise<TelegramApiResponse<TelegramChatMember>> {
    return this.call<TelegramChatMember>('getChatMember', {
      chat_id: chatId,
      user_id: userId
    });
  }

  async isGroupAdmin(chatId: string, userId: string): Promise<boolean> {
    try {
      const response = await this.getChatMember(chatId, userId);
      if (!response.ok || !response.result) {
        return false;
      }

      return response.result.status === 'creator' || response.result.status === 'administrator';
    } catch (error) {
      console.error('Failed to verify Telegram admin status', error);
      return false;
    }
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });

    return (await response.json()) as TelegramApiResponse<T>;
  }
}
