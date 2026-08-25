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
* **"Click"**: segue davvero un `<a href>` reale estratto dall'ultima pagina (richiesta HTTP GET reale verso l'URL reale), non un click DOM simulato.
* **"Type" / compilazione form — NUOVO**: estrae davvero i `<form>` (action, method, campi `<input>`/`<textarea>`/`<select>`) dall'ultima pagina e può compilarli e inviarli con una vera richiesta HTTP (GET con query string, o POST `application/x-www-form-urlencoded`) verso l'`action` reale del form — lo stesso protocollo che userebbe un browser per un submit non-JS. Verificato in questo ambiente contro `https://httpbin.org/forms/post`: httpbin ha rieccheggiato esattamente i valori inviati (`custname`, `custtel`, `custemail`, `comments`, ecc.).
* **Limite onesto (a differenza del vero browser-use, che guida un vero browser Playwright/Chromium)**: nessun motore JavaScript, nessun DOM renderizzato. Un form la cui struttura o il cui invio dipendono da JavaScript lato client (SPA React/Vue con `onSubmit` in JS, contenuto caricato via `fetch()` dopo il load) non viene visto né inviato correttamente da questa implementazione. Per coprire quel caso servirebbe un vero browser headless (es. Playwright) — non è stato aggiunto in questa passata per non introdurre una dipendenza pesante non ancora verificata end-to-end; se serve, va installata e cablata per davvero, non simulata.

#### 3. 🧠 Semantic Knowledge Graph con Embedding Reali (Mem0 Style)
* Genera vettori a 384 dimensioni con un feature-hashing su parole e trigrammi (hash trick, non un modello neurale pre-addestrato), normalizzati L2, e calcola una vera cosine similarity per il recall. È un embedding lessicale reale e verificabile, non un modello semantico allenato: due frasi con sinonimi diversi ma stesso significato potrebbero non risultare simili.
* Salvataggio persistente reale su `.omniclaw_data/memory_graph.json`.

#### 3b. 🧑‍🤝‍🧑 Crew Mode — Role Delegation (CrewAI Style)
* Gap reale rispetto a CrewAI (280%+ crescita adozione dichiarata nel 2025 per l'orchestrazione basata su ruoli): il loop agentico esistente era un unico "persona" che ragiona in un ciclo flat. `src/crew_planner.ts` aggiunge una vera fase di scomposizione: una chiamata Ollama reale chiede al modello locale di dividere la richiesta in massimo 4 sotto-task con ruoli distinti (es. "Ricercatore", "Analista", "Scrittore"), restituiti come JSON reale e validato.
* Se la scomposizione fallisce onestamente (Ollama irraggiungibile, JSON non valido, o un solo sotto-task) l'endpoint `POST /api/agent/crew-run` ricade sull'agente singolo già verificato — nessun ruolo fittizio viene mai inventato.
* Se ci sono ≥2 sotto-task reali, ciascuno viene eseguito in sequenza con il loop ReAct/CodeAgent già esistente, iniettando nel prompt successivo l'output REALE (non riassunto a mano) del sotto-task precedente — lo stesso pattern di "context passing" di una crew sequenziale CrewAI. Una chiamata Ollama finale sintetizza gli output reali in una risposta unica.
* **Verificato in questo ambiente**: con `llama3.2:3b` la scomposizione ha prodotto un JSON non valido (il modello ha risposto in prosa) e il sistema è ricaduto onestamente sull'agente singolo (`crewMode: false`, `decomposition: null`), completando comunque il task originale con successo. Con `qwen2.5:7b` la scomposizione JSON è stata analizzata e — quando riesce — i sotto-task vengono eseguiti realmente in sequenza con contesto reale propagato tra loro (vedi `CHANGELOG.md` per il log completo della richiesta HTTP reale).

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
2. **🌐 Navigatore Web & DOM**: fetch HTTP reale + parsing testo del DOM (no click/scroll simulati, è estrazione di contenuto). "Click" = segue un `<a href>` reale. "Type"/form fill (NUOVO) = estrae e invia davvero i `<form>` HTML statici trovati sulla pagina (GET/POST reali verso l'action reale) — verificato contro httpbin.org/forms/post; i form la cui logica dipende da JavaScript client-side restano fuori portata senza un vero browser headless.
3. **🧠 Memoria Semantica a Grafo**: embedding reali a 384 dimensioni via feature-hashing (non un modello neurale), cosine similarity reale, persistenza reale in `.omniclaw_data/memory_graph.json`.
4. **📲 Gateway Multi-Canale**: WhatsApp (webhook reale), Telegram (bot reale via long-polling), Discord (webhook reale), WebSocket (streaming reale).
5. **🧑‍🤝‍🧑 Crew Mode (NUOVO, stile CrewAI)**: `POST /api/agent/crew-run` scompone davvero la richiesta in sotto-task con ruoli distinti tramite una vera chiamata Ollama, esegue ciascun ruolo in sequenza col loop ReAct esistente propagando l'output reale del precedente come contesto, e sintetizza un risultato finale. Se la scomposizione fallisce (JSON non valido/Ollama irraggiungibile), ricade onestamente sull'agente singolo — mai ruoli inventati. Verificato dal vivo: con `qwen2.5:7b` una richiesta di calcolo+riassunto è stata scomposta in 4 ruoli reali (Ricercatore, Programmatore, Scrittore, Verificatore) eseguiti in sequenza con contesto propagato e 3 blocchi di codice reali eseguiti.

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
