/**
 * 📲 OpenClaw-Style Multi-Channel Gateway
 * Connects the autonomous agent across Telegram, Discord, WebSockets, and Local CLI.
 */

export interface ChannelMessage {
  id: string;
  channel: "web" | "telegram" | "discord" | "cli";
  sender: string;
  text: string;
  timestamp: string;
}

export class OmniMultiChannelGateway {
  private telegramToken?: string;
  private discordWebhook?: string;
  private messageListeners: ((msg: ChannelMessage) => void)[] = [];

  constructor(telegramToken?: string, discordWebhook?: string) {
    this.telegramToken = telegramToken;
    this.discordWebhook = discordWebhook;
  }

  public setTelegramToken(token: string): void {
    this.telegramToken = token;
  }

  public setDiscordWebhook(url: string): void {
    this.discordWebhook = url;
  }

  public onMessage(listener: (msg: ChannelMessage) => void): void {
    this.messageListeners.push(listener);
  }

  public async broadcast(message: string, originChannel: string = "web"): Promise<void> {
    // Send to Discord if configured
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
  }
}
