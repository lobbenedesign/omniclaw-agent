# 🦄 OmniClaw — The Autonomous AI Agent Unicorn

[![Bun](https://img.shields.io/badge/Bun-v1.4+-black.svg?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Unicorn Stack](https://img.shields.io/badge/Stack-OpenClaw%20%2B%20Browser--Use%20%2B%20Smolagents%20%2B%20Mem0-purple.svg)](#-the-unicorn-stack)

[English 🇬🇧](#english) • [Italiano 🇮🇹](#italiano)

> **The next-generation autonomous AI agent unifying OpenClaw's multi-channel orchestration, Browser-Use's visual web automation, Smolagents' executable code reasoning ("Think in Code"), and Mem0's self-evolving semantic memory graph.**
>
> *Il super-agente autonomo di nuova generazione che unifica OpenClaw, Browser-Use, Smolagents e Mem0 in una singola piattaforma potente ed elegante.*

![OmniClaw Unicorn Dashboard](./public/screenshot.jpg)

---

<a name="english"></a>
## 🇬🇧 English Documentation

### 🏆 Why OmniClaw is a 2026 Unicorn Project

In 2026, the biggest viral breakthroughs on GitHub emerged in 4 distinct categories:
1. **OpenClaw (340k+ stars)**: Multi-channel personal agent orchestration.
2. **Browser-Use (100k+ stars)**: Visual web automation giving agents hands and eyes.
3. **Mem0 (63k+ stars)**: Universal self-evolving memory layer.
4. **Smolagents (27k+ stars)**: CodeAgents that think and execute real code directly instead of slow JSON tool calls.

**OmniClaw combines all 4 breakthroughs into one unified, ultra-fast, local-first engine.**

---

### 🌟 Core Architectural Pillars

> **Nota onesta**: la v1.0.0 dichiarava "3x faster execution" e "70% lower
> token consumption" senza alcun benchmark nel repo, l'agent loop mostrava
> un messaggio "Task processed successfully" fabbricato ogni volta che
> Ollama non era raggiungibile (senza eseguire nulla per davvero), e il
> token Telegram veniva salvato ma non era collegato a nessuna vera
> chiamata API. Tutto questo è stato corretto: nessuna metrica di
> performance non misurata, nessun fallback che finge successo, Telegram
> ora invia/riceve messaggi reali via Bot API.

#### 1. ⚡ "Think in Executable Code" Engine (Smolagents Style)
* Il loop dell'agente chiama davvero un LLM locale via Ollama; se la risposta contiene blocchi di codice TypeScript/Python/Shell, questi vengono **eseguiti realmente** in sandbox (processo reale, stdout/stderr reali) e il risultato entra nel trace mostrato in UI.
* Se Ollama non è raggiungibile, l'agente riporta un errore esplicito invece di un messaggio di successo inventato.

#### 2. 🌐 Visual & DOM Web Navigation (Browser-Use Style)
* Fetch HTTP reale della pagina/ricerca DuckDuckGo, parsing reale del titolo e del contenuto testuale del DOM. Non è un browser headless con click/scroll simulati: è un estrattore di contenuto reale via richieste HTTP dirette.

#### 3. 🧠 Semantic Knowledge Graph con Embedding Reali (Mem0 Style)
* Genera vettori a 384 dimensioni con un feature-hashing su parole e trigrammi (hash trick, non un modello neurale pre-addestrato), normalizzati L2, e calcola una vera cosine similarity per il recall. È un embedding lessicale reale e verificabile, non un modello semantico allenato: due frasi con sinonimi diversi ma stesso significato potrebbero non risultare simili.
* Salvataggio persistente reale su `.omniclaw_data/memory_graph.json`.

#### 4. 📲 Multi-Channel Remote Gateway (OpenClaw Style)
* **WhatsApp**: webhook Meta Cloud API reale, verificato e funzionante.
* **Telegram**: bot reale via long-polling su `getUpdates` (nessun webhook pubblico richiesto), verificato con una chiamata `getMe` al salvataggio del token.
* **Discord**: webhook reale in broadcast.
* **WebSocket**: streaming nativo bidirezionale per gli eventi UI.

---

### 🛠️ Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/lobbenedesign/omniclaw-agent.git
cd omniclaw-agent

# 2. Run with Bun (instant startup)
bun server.ts
```

Open your browser at **`http://localhost:3002`**.

---

<a name="italiano"></a>
## 🇮🇹 Documentazione in Italiano

### 🏆 Perché OmniClaw è un Progetto Unicorno

Nel panorama open source del 2026, i progetti più virali su GitHub si sono concentrati su 4 pilastri:
1. **OpenClaw**: orchestrazione multi-canale (Telegram, Discord, Web, CLI).
2. **Browser-Use**: automazione visiva del web con navigazione DOM autonoma.
3. **Mem0**: memoria a grafo auto-evolutiva che ricorda abitudini e regole.
4. **Smolagents**: esecuzione diretta di codice sandboxed (TypeScript/Python/Shell) invece di lente chiamate JSON.

**OmniClaw unisce questi 4 superpoteri in un'unica architettura ultra-veloce, privacy-first e locale.**

---

### 🌟 Pilastri Architetturali

1. **⚡ Motore "Think in Code"**: l'agente chiama un LLM locale reale (Ollama) e, se propone codice, lo esegue davvero in sandbox — nessuna cifra di risparmio token dichiarata senza misurazione.
2. **🌐 Navigatore Web & DOM**: fetch HTTP reale + parsing testo del DOM (no click/scroll simulati, è estrazione di contenuto).
3. **🧠 Memoria Semantica a Grafo**: embedding reali a 384 dimensioni via feature-hashing (non un modello neurale), cosine similarity reale, persistenza reale in `.omniclaw_data/memory_graph.json`.
4. **📲 Gateway Multi-Canale**: WhatsApp (webhook reale), Telegram (bot reale via long-polling), Discord (webhook reale), WebSocket (streaming reale).

---

### 🛠️ Avvio Rapido

```bash
git clone https://github.com/lobbenedesign/omniclaw-agent.git
cd omniclaw-agent
bun server.ts
```

Apri il browser all'indirizzo **`http://localhost:3002`**.

---

## 📄 License / Licenza
Released under the [MIT License](LICENSE).
