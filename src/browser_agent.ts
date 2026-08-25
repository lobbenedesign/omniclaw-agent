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

export interface FormField {
  name: string;
  type: string; // text, hidden, submit, checkbox, radio, select, textarea, ...
  value: string;
}

export interface ExtractedForm {
  index: number;
  action: string; // fully resolved absolute URL
  method: "GET" | "POST";
  fields: FormField[];
}

export interface BrowserActionResult {
  action: string;
  url: string;
  title: string;
  domSummary: string;
  extractedText: string;
  links: ExtractedLink[];
  forms?: ExtractedForm[];
  success: boolean;
  error?: string;
}

export class OmniBrowserAgent {
  private currentUrl: string = "about:blank";
  private history: string[] = [];
  private lastLinks: ExtractedLink[] = [];
  private lastForms: ExtractedForm[] = [];

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

  /** Ultimi form reali estratti dal parsing dell'ultima pagina visitata. */
  public getLastForms(): ExtractedForm[] {
    return this.lastForms;
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
      this.lastForms = this.extractForms(html, url);

      return {
        action: "navigate",
        url: this.currentUrl,
        title: this.extractTitle(html),
        domSummary: domSummary.slice(0, 1500),
        extractedText: domSummary.slice(0, 4000),
        links: links.slice(0, 25),
        forms: this.lastForms.slice(0, 10),
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

  /**
   * Estrae i form REALI (action, method, campi) dal markup HTML grezzo
   * dell'ultima pagina navigata, risolvendo `action` relativo contro l'URL
   * corrente. Copre <input>, <textarea> e <select><option selected>.
   * Onestà: questo è parsing HTML statico via richieste HTTP dirette, non un
   * browser headless — un form la cui struttura o i cui campi vengono generati
   * o modificati da JavaScript lato client (SPA React/Vue, ecc.) non verrà
   * visto correttamente, esattamente come già dichiarato per extractLinks.
   */
  private extractForms(html: string, baseUrl: string): ExtractedForm[] {
    const forms: ExtractedForm[] = [];
    const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
    let fm: RegExpExecArray | null;
    let idx = 0;

    while ((fm = formRe.exec(html))) {
      const attrs = fm[1];
      const body = fm[2];

      const actionMatch = attrs.match(/\baction\s*=\s*["']([^"']*)["']/i);
      const methodMatch = attrs.match(/\bmethod\s*=\s*["']([^"']*)["']/i);
      const rawAction = actionMatch ? actionMatch[1].trim() : "";
      const method: "GET" | "POST" = (methodMatch?.[1] || "GET").trim().toUpperCase() === "POST" ? "POST" : "GET";

      let resolvedAction: string;
      try {
        resolvedAction = new URL(rawAction || "", baseUrl).toString();
      } catch {
        continue;
      }

      const fields: FormField[] = [];
      const inputRe = /<input\b([^>]*)\/?>/gi;
      let im: RegExpExecArray | null;
      while ((im = inputRe.exec(body))) {
        const iattrs = im[1];
        const name = iattrs.match(/\bname\s*=\s*["']([^"']*)["']/i)?.[1];
        if (!name) continue;
        const type = (iattrs.match(/\btype\s*=\s*["']([^"']*)["']/i)?.[1] || "text").toLowerCase();
        const value = iattrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1] || "";
        fields.push({ name, type, value });
      }

      const textareaRe = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi;
      let tm: RegExpExecArray | null;
      while ((tm = textareaRe.exec(body))) {
        const name = tm[1].match(/\bname\s*=\s*["']([^"']*)["']/i)?.[1];
        if (!name) continue;
        fields.push({ name, type: "textarea", value: tm[2].trim() });
      }

      const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
      let sm: RegExpExecArray | null;
      while ((sm = selectRe.exec(body))) {
        const name = sm[1].match(/\bname\s*=\s*["']([^"']*)["']/i)?.[1];
        if (!name) continue;
        const optionsBlock = sm[2];
        const selectedMatch = optionsBlock.match(/<option\b[^>]*\bselected\b[^>]*\bvalue\s*=\s*["']([^"']*)["']/i)
          || optionsBlock.match(/<option\b[^>]*\bvalue\s*=\s*["']([^"']*)["'][^>]*\bselected\b/i);
        const firstMatch = optionsBlock.match(/<option\b[^>]*\bvalue\s*=\s*["']([^"']*)["']/i);
        fields.push({ name, type: "select", value: (selectedMatch || firstMatch)?.[1] || "" });
      }

      forms.push({ index: idx, action: resolvedAction, method, fields });
      idx += 1;
    }

    return forms;
  }

  /**
   * Compila e invia DAVVERO un form estratto dall'ultima pagina navigata:
   * unisce i valori di default del markup con quelli passati dal chiamante,
   * poi esegue una vera richiesta HTTP (GET con query string, o POST
   * application/x-www-form-urlencoded) verso l'`action` reale del form —
   * lo stesso protocollo che un browser userebbe per un submit non-JS.
   * Non esegue alcun gestore onsubmit JavaScript: un form la cui logica di
   * invio è interamente in JS (es. fetch() da un handler React) non verrà
   * davvero inviato da questa funzione.
   */
  public async fillAndSubmitForm(formIndex: number, values: Record<string, string>): Promise<BrowserActionResult> {
    const form = this.lastForms.find(f => f.index === formIndex);
    if (!form) {
      return {
        action: "type",
        url: this.currentUrl,
        title: "Form non trovato",
        domSummary: "",
        extractedText: "",
        links: [],
        success: false,
        error: `Nessun form con indice ${formIndex} tra i ${this.lastForms.length} form estratti dall'ultima pagina. Naviga prima con navigate/searchWeb.`
      };
    }

    const merged: Record<string, string> = {};
    for (const f of form.fields) merged[f.name] = f.value;
    for (const [k, v] of Object.entries(values)) merged[k] = v;

    try {
      let targetUrl = form.action;
      let fetchInit: RequestInit = {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
        signal: AbortSignal.timeout(10000)
      };

      if (form.method === "GET") {
        const u = new URL(form.action);
        for (const [k, v] of Object.entries(merged)) u.searchParams.set(k, v);
        targetUrl = u.toString();
      } else {
        const body = new URLSearchParams(merged).toString();
        fetchInit = {
          ...fetchInit,
          method: "POST",
          headers: { ...(fetchInit.headers as Record<string, string>), "Content-Type": "application/x-www-form-urlencoded" },
          body
        };
      }

      this.currentUrl = targetUrl;
      this.history.push(targetUrl);

      const res = await fetch(targetUrl, fetchInit);
      const html = await res.text();
      const domSummary = this.parseDomContent(html);
      const links = this.extractLinks(html, targetUrl);
      this.lastLinks = links;
      this.lastForms = this.extractForms(html, targetUrl);

      return {
        action: "type",
        url: targetUrl,
        title: this.extractTitle(html),
        domSummary: domSummary.slice(0, 1500),
        extractedText: domSummary.slice(0, 4000),
        links: links.slice(0, 25),
        forms: this.lastForms.slice(0, 10),
        success: res.ok
      };
    } catch (e: any) {
      return {
        action: "type",
        url: form.action,
        title: "Form Submission Error",
        domSummary: "",
        extractedText: "",
        links: [],
        success: false,
        error: e.message
      };
    }
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
