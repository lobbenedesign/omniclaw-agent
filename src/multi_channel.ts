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

  public setTelegramToken(token: string): void {
    this.telegramToken = token;
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
