#!/usr/bin/env bun
/**
 * 🦄 OMNICLAW AGENT SERVER (v1.0.0)
 * Unifying OpenClaw, Browser-Use, Smolagents Code Execution, and Mem0 Graph Memory.
 */

import { OmniMemoryStore } from "./src/memory";
import { OmniCodeEngine } from "./src/code_engine";
import { OmniBrowserAgent } from "./src/browser_agent";
import { OmniMultiChannelGateway } from "./src/multi_channel";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

const PORT = Number(process.env.PORT) || 3002;
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

const memoryStore = new OmniMemoryStore("./.omniclaw_data");
const codeEngine = new OmniCodeEngine(process.cwd());
const browserAgent = new OmniBrowserAgent();
const multiChannel = new OmniMultiChannelGateway();

let activeModel = "qwen2.5:7b";
let totalTasksExecuted = 0;
let lastExecutionTrace: any[] = [];

// Estrae blocchi di codice fenced reali (```typescript / ```python / ```shell)
// dalla risposta dell'LLM. Nessuna esecuzione se l'LLM non ne propone.
function extractCodeBlocks(text: string): { language: "typescript" | "python" | "shell"; code: string }[] {
  const blocks: { language: "typescript" | "python" | "shell"; code: string }[] = [];
  const re = /```(typescript|ts|python|py|shell|bash|sh)\n([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tag = m[1].toLowerCase();
    const language: "typescript" | "python" | "shell" =
      tag === "python" || tag === "py" ? "python" :
      tag === "shell" || tag === "bash" || tag === "sh" ? "shell" : "typescript";
    blocks.push({ language, code: m[2].trim() });
  }
  return blocks;
}

/**
 * Loop agente reale: recall di memoria reale -> chiamata LLM reale via Ollama
 * -> se l'LLM propone blocchi di codice, li esegue DAVVERO col code engine
 * sandboxato e riporta output reale nel trace. Se Ollama non è raggiungibile
 * ritorna un errore onesto, mai un messaggio di successo fabbricato.
 */
async function runAgentLoop(prompt: string, model: string) {
  const trace: any[] = [];

  const memoryContext = memoryStore.formatForPrompt(prompt);
  trace.push({
    step: 1,
    type: "memory_recall",
    title: "Recall reale dal grafo di memoria (cosine similarity)",
    detail: memoryContext ? "Nodi rilevanti recuperati con similarità coseno reale" : "Nessun nodo di memoria supera la soglia di similarità"
  });

  const systemPrompt = `Sei OMNICLAW, un agente autonomo che unisce esecuzione di codice reale (TypeScript/Python/Shell), navigazione web reale e memoria a grafo reale.
Se la richiesta richiede calcoli, elaborazione dati o azioni concrete, rispondi includendo un blocco di codice fenced (\`\`\`typescript, \`\`\`python o \`\`\`shell) con codice REALMENTE eseguibile: verrà eseguito davvero e il suo output reale ti verrà mostrato.
${memoryContext}
Cartella di lavoro corrente: ${process.cwd()}`;

  let ollamaOk = false;
  let replyText = "";
  try {
    const ollamaRes = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        stream: false
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (ollamaRes.ok) {
      const data: any = await ollamaRes.json();
      replyText = data.message?.content || "";
      ollamaOk = true;
    }
  } catch {
    ollamaOk = false;
  }

  if (!ollamaOk) {
    trace.push({
      step: 2,
      type: "error",
      title: "LLM locale non raggiungibile",
      detail: `Nessuna risposta da Ollama su ${OLLAMA_HOST}. Avvia Ollama ('ollama serve') e verifica che il modello '${model}' sia disponibile ('ollama pull ${model}').`
    });
    return {
      success: false,
      model,
      prompt,
      reply: "",
      error: `Impossibile contattare Ollama su ${OLLAMA_HOST}. Nessuna risposta è stata generata: nessun task è stato realmente eseguito.`,
      trace,
      codeResults: []
    };
  }

  trace.push({
    step: 2,
    type: "reasoning",
    title: "Risposta reale del modello",
    detail: `Risposta ricevuta da ${model} (${replyText.length} caratteri)`
  });

  // Esecuzione REALE dei blocchi di codice proposti dal modello (Think in Code).
  const blocks = extractCodeBlocks(replyText);
  const codeResults: any[] = [];
  for (const block of blocks) {
    const result = await codeEngine.execute(block.code, block.language);
    codeResults.push(result);
    trace.push({
      step: trace.length + 1,
      type: "code_execution",
      title: `Esecuzione reale (${block.language})`,
      detail: result.success
        ? `Exit 0 in ${result.executionTimeMs}ms — stdout: ${result.stdout.slice(0, 200) || "(vuoto)"}`
        : `Fallita (exit ${result.exitCode}) — stderr: ${result.stderr.slice(0, 200)}`
    });
  }

  if (prompt.length > 10) {
    memoryStore.addOrUpdateNode({
      type: "fact",
      label: prompt.slice(0, 30),
      content: `Richiesta utente del ${new Date().toLocaleDateString()}: "${prompt.slice(0, 120)}"`,
      confidence: 0.9,
      tags: ["session-task", "autonomous"]
    });
  }

  trace.push({
    step: trace.length + 1,
    type: "completion",
    title: "Esecuzione completata",
    detail: codeResults.length > 0 ? `${codeResults.filter(r => r.success).length}/${codeResults.length} blocchi di codice eseguiti con successo` : "Nessun blocco di codice proposto dal modello per questa richiesta"
  });

  return { success: true, model, prompt, reply: replyText, trace, codeResults };
}

console.log(`\n======================================================`);
console.log(`🦄 OMNICLAW AGENT UNICORN running on http://localhost:${PORT}`);
console.log(`🧠 Mem0 Knowledge Graph: Initialized`);
console.log(`⚡ Smolagents Code Engine: Active (TS / Python / Shell)`);
console.log(`🌐 Browser-Use Navigation: Ready`);
console.log(`📲 OpenClaw Multi-Channel: Online`);
console.log(`======================================================\n`);

const server = Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (req.method === "OPTIONS") return new Response(null, { headers });

    // Serve Static UI Assets
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const p = join(__dirname, "public", "index.html");
      return new Response(Bun.file(p), { headers: { "Content-Type": "text/html" } });
    }
    if (url.pathname.startsWith("/public/")) {
      const p = join(__dirname, url.pathname);
      if (existsSync(p)) return new Response(Bun.file(p));
    }
    if (url.pathname === "/app.js") {
      const p = join(__dirname, "public", "app.js");
      return new Response(Bun.file(p), { headers: { "Content-Type": "application/javascript" } });
    }
    if (url.pathname === "/style.css") {
      const p = join(__dirname, "public", "style.css");
      return new Response(Bun.file(p), { headers: { "Content-Type": "text/css" } });
    }

    // 1. Status & Metrics API
    if (url.pathname === "/api/status" && req.method === "GET") {
      const graph = memoryStore.getGraph();
      return new Response(JSON.stringify({
        status: "online",
        version: "1.1.0",
        activeModel,
        memoryNodesCount: graph.nodes.length,
        memoryEdgesCount: graph.edges.length,
        workingContext: graph.workingContext,
        totalTasksExecuted,
        lastTraceLength: lastExecutionTrace.length,
        currentBrowserUrl: browserAgent.getCurrentUrl()
      }), { headers });
    }

    // 2. Mem0 Memory Graph & Real Vector Search API
    if (url.pathname === "/api/memory" && req.method === "GET") {
      return new Response(JSON.stringify(memoryStore.getGraph()), { headers });
    }

    if (url.pathname === "/api/memory/search" && req.method === "POST") {
      try {
        let body: any = {};
        try { body = await req.json(); } catch {}
        const query = body.query || "TypeScript Rust clean code";
        const results = memoryStore.recall(query, 5);
        return new Response(JSON.stringify({ query, results }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/memory/node" && req.method === "POST") {
      try {
        const body: any = await req.json();
        const node = memoryStore.addOrUpdateNode({
          type: body.type || "fact",
          label: body.label || "Untitled Memory",
          content: body.content || "",
          confidence: body.confidence ?? 0.95,
          tags: body.tags || []
        });
        server.publish("omniclaw-events", JSON.stringify({ type: "memory_updated", node }));
        return new Response(JSON.stringify({ success: true, node }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    if (url.pathname === "/api/memory/node" && req.method === "DELETE") {
      try {
        const body: any = await req.json();
        const deleted = memoryStore.deleteNode(body.id);
        server.publish("omniclaw-events", JSON.stringify({ type: "memory_deleted", id: body.id }));
        return new Response(JSON.stringify({ success: deleted }), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // 3. Smolagents Code Execution API
    if (url.pathname === "/api/code/execute" && req.method === "POST") {
      try {
        const body: any = await req.json();
        const result = await codeEngine.execute(body.code || "", body.language || "typescript");
        server.publish("omniclaw-events", JSON.stringify({ type: "code_executed", result }));
        return new Response(JSON.stringify(result), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // 4. Browser-Use Autonomous Web Navigation API
    if (url.pathname === "/api/browser/navigate" && req.method === "POST") {
      try {
        const body: any = await req.json();
        const result = body.query 
          ? await browserAgent.searchWeb(body.query)
          : await browserAgent.navigate(body.url || "https://duckduckgo.com");

        server.publish("omniclaw-events", JSON.stringify({ type: "browser_action", result }));
        return new Response(JSON.stringify(result), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // 5. Autonomous Agent Loop (Think in Code + Web + Memory) — reale, mai fabbricato
    if (url.pathname === "/api/agent/run" && req.method === "POST") {
      try {
        const body: any = await req.json();
        const prompt = body.prompt || "";
        const model = body.model || activeModel;

        const result = await runAgentLoop(prompt, model);
        if (result.success) totalTasksExecuted += 1;
        lastExecutionTrace = result.trace;
        server.publish("omniclaw-events", JSON.stringify({ type: "agent_finished", prompt, trace: result.trace }));

        return new Response(JSON.stringify(result), { headers: { ...headers }, status: result.success ? 200 : 502 });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // 6. WhatsApp Webhook & Multi-Channel API
    if (url.pathname === "/api/webhook/whatsapp") {
      // Meta Webhook Verification
      if (req.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expectedToken = multiChannel.getWhatsAppConfig().verifyToken || "omniclaw_secret_token";

        if (mode === "subscribe" && token === expectedToken) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      }

      // Incoming WhatsApp Message
      if (req.method === "POST") {
        try {
          const body: any = await req.json();
          const entry = body.entry?.[0]?.changes?.[0]?.value;
          const message = entry?.messages?.[0];

          if (message && message.type === "text") {
            const senderPhone = message.from;
            const userText = message.text?.body || "";

            console.log(`📲 Incoming WhatsApp Message from ${senderPhone}: "${userText}"`);

            const result = await runAgentLoop(userText, activeModel);
            const replyText = result.success
              ? result.reply
              : `⚠️ ${result.error}`;

            await multiChannel.sendWhatsAppMessage(senderPhone, replyText);
          }

          return new Response(JSON.stringify({ status: "EVENT_RECEIVED" }), { headers });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
        }
      }
    }

    // 7. WhatsApp Configuration API
    if (url.pathname === "/api/channels/whatsapp/config") {
      if (req.method === "POST") {
        try {
          const body: any = await req.json();
          multiChannel.setWhatsAppConfig({
            phoneNumberId: body.phoneNumberId,
            accessToken: body.accessToken,
            verifyToken: body.verifyToken || "omniclaw_secret_token",
            targetPhoneNumber: body.targetPhoneNumber
          });
          return new Response(JSON.stringify({ success: true, message: "WhatsApp configuration updated successfully" }), { headers });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
        }
      }
      if (req.method === "GET") {
        const cfg = multiChannel.getWhatsAppConfig();
        return new Response(JSON.stringify({
          configured: Boolean(cfg.phoneNumberId && cfg.accessToken),
          hasTargetPhone: Boolean(cfg.targetPhoneNumber),
          verifyToken: cfg.verifyToken || "omniclaw_secret_token"
        }), { headers });
      }
    }

    // 8. Telegram Configuration + Real Long-Polling Bot
    if (url.pathname === "/api/channels/telegram/config") {
      if (req.method === "POST") {
        try {
          const body: any = await req.json();
          const token: string = body.token || "";
          if (!token) {
            return new Response(JSON.stringify({ error: "Token del bot Telegram mancante." }), { status: 400, headers });
          }
          multiChannel.setTelegramToken(token);

          // Verifica reale del token con una chiamata getMe prima di avviare il polling.
          const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
          if (!meRes.ok) {
            return new Response(JSON.stringify({ error: "Token Telegram non valido (verifica getMe fallita)." }), { status: 400, headers });
          }
          const me: any = await meRes.json();

          multiChannel.stopTelegramPolling();
          multiChannel.startTelegramPolling(async (chatId, text) => {
            console.log(`📲 Incoming Telegram Message from ${chatId}: "${text}"`);
            const result = await runAgentLoop(text, activeModel);
            const replyText = result.success ? result.reply : `⚠️ ${result.error}`;
            await multiChannel.sendTelegramMessage(chatId, replyText);
          });

          return new Response(JSON.stringify({ success: true, botUsername: me.result?.username || null }), { headers });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
        }
      }
      if (req.method === "GET") {
        return new Response(JSON.stringify({ configured: multiChannel.hasTelegram() }), { headers });
      }
      if (req.method === "DELETE") {
        multiChannel.stopTelegramPolling();
        return new Response(JSON.stringify({ success: true }), { headers });
      }
    }

    return new Response("Not Found", { status: 404, headers });
  },
  websocket: {
    open(ws) {
      ws.subscribe("omniclaw-events");
    },
    message(ws, message) {},
    close(ws) {
      ws.unsubscribe("omniclaw-events");
    }
  }
});
