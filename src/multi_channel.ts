/**
 * 📲 OpenClaw-Style Multi-Channel Gateway
 * Connects the autonomous agent across WhatsApp, Telegram, Discord, WebSockets, and Local CLI.
 */

export interface ChannelMessage {
  id: string;
  channel: "web" | "telegram" | "discord" | "whatsapp" | "cli";
  sender: string;
  text: string;
  timestamp: string;
}

export interface WhatsAppConfig {
  phoneNumberId?: string;
  accessToken?: string;
  verifyToken?: string;
  targetPhoneNumber?: string;
}

export class OmniMultiChannelGateway {
  private telegramToken?: string;
  private discordWebhook?: string;
  private whatsAppConfig: WhatsAppConfig = {};
  private messageListeners: ((msg: ChannelMessage) => void)[] = [];

  constructor(telegramToken?: string, discordWebhook?: string, whatsAppConfig?: WhatsAppConfig) {
    this.telegramToken = telegramToken;
    this.discordWebhook = discordWebhook;
    if (whatsAppConfig) this.whatsAppConfig = whatsAppConfig;
  }

  private telegramOffset = 0;
  private telegramPolling = false;

  public setTelegramToken(token: string): void {
    this.telegramToken = token;
  }

  public hasTelegram(): boolean {
    return Boolean(this.telegramToken);
  }

  /**
   * Invia davvero un messaggio via Telegram Bot API (https://core.telegram.org/bots/api#sendmessage).
   * Richiede un vero bot token ottenuto da @BotFather; nessuna simulazione.
   */
  public async sendTelegramMessage(chatId: string | number, text: string): Promise<boolean> {
    if (!this.telegramToken) {
      console.warn("Telegram bot token non configurato.");
      return false;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text })
      });
      return res.ok;
    } catch (e) {
      console.error("Invio messaggio Telegram fallito:", e);
      return false;
    }
  }

  /**
   * Avvia un vero long-polling su getUpdates (nessun webhook pubblico
   * richiesto). Ogni messaggio testuale ricevuto invoca `onText` con
   * chatId e testo reali; si interrompe con stopTelegramPolling().
   */
  public startTelegramPolling(onText: (chatId: number, text: string) => void): void {
    if (!this.telegramToken || this.telegramPolling) return;
    this.telegramPolling = true;

    const poll = async () => {
      while (this.telegramPolling) {
        try {
          const res = await fetch(
            `https://api.telegram.org/bot${this.telegramToken}/getUpdates?timeout=25&offset=${this.telegramOffset}`,
            { signal: AbortSignal.timeout(30000) }
          );
          if (!res.ok) { await new Promise(r => setTimeout(r, 3000)); continue; }
          const data: any = await res.json();
          for (const update of data.result || []) {
            this.telegramOffset = update.update_id + 1;
            const msg = update.message;
            if (msg?.text && msg.chat?.id != null) {
              onText(msg.chat.id, msg.text);
            }
          }
        } catch {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    };
    poll();
  }

  public stopTelegramPolling(): void {
    this.telegramPolling = false;
  }

  public setDiscordWebhook(url: string): void {
    this.discordWebhook = url;
  }

  public setWhatsAppConfig(config: WhatsAppConfig): void {
    this.whatsAppConfig = { ...this.whatsAppConfig, ...config };
  }

  public getWhatsAppConfig(): WhatsAppConfig {
    return this.whatsAppConfig;
  }

  public onMessage(listener: (msg: ChannelMessage) => void): void {
    this.messageListeners.push(listener);
  }

  public async sendWhatsAppMessage(recipientPhone: string, text: string): Promise<boolean> {
    if (!this.whatsAppConfig.phoneNumberId || !this.whatsAppConfig.accessToken) {
      console.warn("WhatsApp API credentials not configured (phoneNumberId / accessToken missing).");
      return false;
    }

    try {
      const url = `https://graph.facebook.com/v19.0/${this.whatsAppConfig.phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.whatsAppConfig.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipientPhone,
          type: "text",
          text: { body: `🤖 [OmniClaw]:\n${text}` }
        })
      });
      return res.ok;
    } catch (e) {
      console.error("Failed to send WhatsApp message:", e);
      return false;
    }
  }

  public async broadcast(message: string, originChannel: string = "web"): Promise<void> {
    // 1. Discord Broadcast
    if (this.discordWebhook && originChannel !== "discord") {
      try {
        await fetch(this.discordWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: `🤖 **[OmniClaw Broadcast]**\n${message}` })
        });
      } catch (e) {
        console.error("Discord broadcast error:", e);
      }
    }

    // 2. WhatsApp Target Broadcast
    if (this.whatsAppConfig.targetPhoneNumber && originChannel !== "whatsapp") {
      await this.sendWhatsAppMessage(this.whatsAppConfig.targetPhoneNumber, message);
    }
  }
}
