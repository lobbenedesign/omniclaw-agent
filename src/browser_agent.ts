/**
 * 🌐 Browser-Use Style Visual & DOM Web Navigation Engine
 * Empowers the AI agent with "Eyes and Hands" on the web.
 * Allows autonomous search, form-filling, clicking, scraping, and visual verification.
 */

export interface BrowserAction {
  action: "navigate" | "click" | "type" | "scroll" | "extract" | "screenshot";
  url?: string;
  selector?: string;
  text?: string;
  scrollDirection?: "up" | "down";
}

export interface BrowserActionResult {
  action: string;
  url: string;
  title: string;
  domSummary: string;
  extractedText: string;
  success: boolean;
  error?: string;
}

export class OmniBrowserAgent {
  private currentUrl: string = "about:blank";
  private history: string[] = [];

  constructor() {}

  public getCurrentUrl(): string {
    return this.currentUrl;
  }

  public async navigate(url: string): Promise<BrowserActionResult> {
    try {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }
      this.currentUrl = url;
      this.history.push(url);

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(10000)
      });

      const html = await res.text();
      const domSummary = this.parseDomContent(html);

      return {
        action: "navigate",
        url: this.currentUrl,
        title: this.extractTitle(html),
        domSummary: domSummary.slice(0, 1500),
        extractedText: domSummary.slice(0, 4000),
        success: true
      };
    } catch (e: any) {
      return {
        action: "navigate",
        url,
        title: "Navigation Error",
        domSummary: "",
        extractedText: "",
        success: false,
        error: e.message
      };
    }
  }

  public async searchWeb(query: string): Promise<BrowserActionResult> {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    return this.navigate(searchUrl);
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : "Untitled Page";
  }

  private parseDomContent(html: string): string {
    // Strip scripts and styles
    let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
    // Extract text and tags
    clean = clean.replace(/<[^>]+>/g, " ");
    // Collapse whitespace
    return clean.replace(/\s+/g, " ").trim();
  }
}
