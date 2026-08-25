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

export interface ExtractedLink {
  index: number;
  text: string;
  href: string;
}

export interface BrowserActionResult {
  action: string;
  url: string;
  title: string;
  domSummary: string;
  extractedText: string;
  links: ExtractedLink[];
  success: boolean;
  error?: string;
}

export class OmniBrowserAgent {
  private currentUrl: string = "about:blank";
  private history: string[] = [];
  private lastLinks: ExtractedLink[] = [];

  constructor() {}

  public getCurrentUrl(): string {
    return this.currentUrl;
  }

  public getHistory(): string[] {
    return this.history;
  }

  /** Ultimi link reali estratti dal parsing dell'ultima pagina visitata. */
  public getLastLinks(): ExtractedLink[] {
    return this.lastLinks;
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
      const links = this.extractLinks(html, url);
      this.lastLinks = links;

      return {
        action: "navigate",
        url: this.currentUrl,
        title: this.extractTitle(html),
        domSummary: domSummary.slice(0, 1500),
        extractedText: domSummary.slice(0, 4000),
        links: links.slice(0, 25),
        success: true
      };
    } catch (e: any) {
      return {
        action: "navigate",
        url,
        title: "Navigation Error",
        domSummary: "",
        extractedText: "",
        links: [],
        success: false,
        error: e.message
      };
    }
  }

  public async searchWeb(query: string): Promise<BrowserActionResult> {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    return this.navigate(searchUrl);
  }

  /**
   * Segue davvero un link reale trovato nell'ultima pagina analizzata
   * (niente browser headless: si riusa l'elenco `links` prodotto dal parsing
   * DOM dell'ultima navigate/searchWeb e si fa una vera richiesta HTTP al
   * suo href). Permette all'agente di "cliccare" per indice o per testo
   * (match case-insensitive parziale) senza dover riscrivere l'URL a mano.
   */
  public async followLink(target: { index?: number; textMatch?: string }): Promise<BrowserActionResult> {
    let link: ExtractedLink | undefined;
    if (typeof target.index === "number") {
      link = this.lastLinks.find(l => l.index === target.index);
    } else if (target.textMatch) {
      const needle = target.textMatch.toLowerCase();
      link = this.lastLinks.find(l => l.text.toLowerCase().includes(needle));
    }

    if (!link) {
      return {
        action: "click",
        url: this.currentUrl,
        title: "Link non trovato",
        domSummary: "",
        extractedText: "",
        links: [],
        success: false,
        error: `Nessun link reale corrispondente trovato tra i ${this.lastLinks.length} link estratti dall'ultima pagina. Naviga prima con navigate/searchWeb.`
      };
    }

    const result = await this.navigate(link.href);
    return { ...result, action: "click" };
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : "Untitled Page";
  }

  /**
   * Estrae link REALI (href + testo visibile) dal markup HTML grezzo,
   * risolvendo gli URL relativi contro la pagina corrente. Nessun link
   * inventato: solo tag <a href="..."> effettivamente presenti nel DOM.
   */
  private extractLinks(html: string, baseUrl: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    let idx = 0;
    const seen = new Set<string>();

    while ((m = re.exec(html))) {
      const rawHref = m[1].trim();
      const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:")) continue;
      if (!text) continue;

      let resolved: string;
      try {
        resolved = new URL(rawHref, baseUrl).toString();
      } catch {
        continue;
      }

      if (seen.has(resolved)) continue;
      seen.add(resolved);

      links.push({ index: idx, text: text.slice(0, 120), href: resolved });
      idx += 1;
    }

    return links;
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
