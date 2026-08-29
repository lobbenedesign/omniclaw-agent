#!/usr/bin/env bun
/**
 * 🦄 OMNICLAW AGENT SERVER (v1.0.0)
 * Unifying OpenClaw, Browser-Use, Smolagents Code Execution, and Mem0 Graph Memory.
 */

import { OmniMemoryStore } from "./src/memory";
import { OmniCodeEngine } from "./src/code_engine";
import { OmniBrowserAgent } from "./src/browser_agent";
import { OmniMultiChannelGateway } from "./src/multi_channel";
import { decomposeIntoSubtasks, CrewSubtask } from "./src/crew_planner";
import { callLLM, currentBackend, currentBackendHost, currentBackendLabel } from "./src/llm_client";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

const PORT = Number(process.env.PORT) || 3002;

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
 * Loop agentico REALE multi-step, ispirato al ciclo ReAct/CodeAgent di
 * smolagents (huggingface/smolagents): a ogni step si richiama davvero
 * l'LLM locale via Ollama passandogli l'intera cronologia dei messaggi,
 * inclusi gli output REALI dei blocchi di codice eseguiti nello step
 * precedente (stdout/stderr veri, non riassunti a mano). Il loop si ferma
 * quando: (a) il modello risponde senza proporre alcun blocco di codice
 * (= considera il task concluso), oppure (b) si raggiunge `maxSteps`.
 * Nessun fallback fittizio: se Ollama non risponde in un qualunque step,
 * il loop si interrompe con un errore esplicito.
 */
async function runAgentLoop(prompt: string, model: string, maxSteps = 4) {
  const trace: any[] = [];
  maxSteps = Math.max(1, Math.min(8, Math.floor(maxSteps) || 4));

  const memoryContext = memoryStore.formatForPrompt(prompt);
  trace.push({
    step: 1,
    type: "memory_recall",
    title: "Recall reale dal grafo di memoria (cosine similarity)",
    detail: memoryContext ? "Nodi rilevanti recuperati con similarità coseno reale" : "Nessun nodo di memoria supera la soglia di similarità"
  });

  const systemPrompt = `Sei OMNICLAW, un agente autonomo che ragiona in cicli (osserva -> pensa -> agisce) unendo esecuzione di codice reale (TypeScript/Python/Shell), navigazione web reale e memoria a grafo reale.
Se la richiesta richiede calcoli, elaborazione dati o azioni concrete, rispondi includendo un blocco di codice fenced (\`\`\`typescript, \`\`\`python o \`\`\`shell) con codice REALMENTE eseguibile: verrà eseguito davvero in sandbox e l'output reale (stdout/stderr) ti verrà rimostrato nel messaggio successivo, così potrai correggere o proseguire.
Quando hai raggiunto una risposta finale completa e non hai più bisogno di eseguire altro codice, rispondi SOLO in linguaggio naturale, SENZA alcun blocco di codice: questo segnala che il task è concluso.
Hai a disposizione al massimo ${maxSteps} cicli di ragionamento/esecuzione.
${memoryContext}
Cartella di lavoro corrente: ${process.cwd()}`;

  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt }
  ];

  const codeResults: any[] = [];
  let lastReply = "";
  let stepsUsed = 0;

  for (let iteration = 1; iteration <= maxSteps; iteration++) {
    stepsUsed = iteration;
    const { ok, content } = await callLLM(model, messages);

    if (!ok) {
      trace.push({
        step: trace.length + 1,
        type: "error",
        title: "LLM locale non raggiungibile",
        detail: `Nessuna risposta da ${currentBackendLabel()} su ${currentBackendHost()} allo step ${iteration}/${maxSteps}. Avvia il backend LLM configurato (LLM_BACKEND=${currentBackend()}) e verifica che il modello '${model}' sia disponibile.`
      });
      return {
        success: false,
        model,
        prompt,
        reply: lastReply,
        error: `Impossibile contattare ${currentBackendLabel()} su ${currentBackendHost()} allo step ${iteration}. Nessuna risposta è stata generata in questo step: il loop si interrompe onestamente invece di fabbricare un risultato.`,
        trace,
        codeResults,
        stepsUsed: iteration
      };
    }

    lastReply = content;
    messages.push({ role: "assistant", content });
    trace.push({
      step: trace.length + 1,
      type: "reasoning",
      title: `Ciclo ${iteration}/${maxSteps} — risposta reale del modello`,
      detail: `Risposta ricevuta da ${model} (${content.length} caratteri)`
    });

    const blocks = extractCodeBlocks(content);
    if (blocks.length === 0) {
      // Nessun codice proposto: il modello considera il task concluso.
      trace.push({
        step: trace.length + 1,
        type: "loop_stop",
        title: "Loop terminato: nessun ulteriore codice proposto",
        detail: `Il modello ha risposto in linguaggio naturale senza blocchi di codice al ciclo ${iteration}: risposta considerata finale.`
      });
      break;
    }

    let observationText = "";
    for (const block of blocks) {
      const result = await codeEngine.execute(block.code, block.language);
      codeResults.push(result);
      trace.push({
        step: trace.length + 1,
        type: "code_execution",
        title: `Ciclo ${iteration}/${maxSteps} — esecuzione reale (${block.language})`,
        detail: result.success
          ? `Exit 0 in ${result.executionTimeMs}ms — stdout: ${result.stdout.slice(0, 200) || "(vuoto)"}`
          : `Fallita (exit ${result.exitCode}) — stderr: ${result.stderr.slice(0, 200)}`
      });
      observationText += `\n\n[Output reale esecuzione ${block.language}]\nexitCode: ${result.exitCode}\nstdout:\n${result.stdout.slice(0, 1500)}\nstderr:\n${result.stderr.slice(0, 800)}`;
    }

    if (iteration === maxSteps) {
      trace.push({
        step: trace.length + 1,
        type: "loop_stop",
        title: "Loop terminato: limite step raggiunto",
        detail: `Raggiunto il limite configurato di ${maxSteps} cicli.`
      });
      break;
    }

    // Reinietta l'output REALE come osservazione per il prossimo ciclo (ReAct-style).
    messages.push({ role: "user", content: `Ecco l'output reale ottenuto eseguendo davvero il codice che hai proposto.${observationText}\n\nContinua il ragionamento: se il task è concluso rispondi senza blocchi di codice, altrimenti proponi il prossimo blocco di codice reale da eseguire.` });
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
    detail: `${stepsUsed}/${maxSteps} cicli usati — ${codeResults.length > 0 ? `${codeResults.filter(r => r.success).length}/${codeResults.length} blocchi di codice eseguiti con successo` : "nessun blocco di codice proposto dal modello"}`
  });

  return { success: true, model, prompt, reply: lastReply, trace, codeResults, stepsUsed };
}

/**
 * Crew mode reale (stile CrewAI role delegation): prima chiama davvero
 * `decomposeIntoSubtasks` per far scomporre al modello locale la richiesta in
 * sotto-task con ruoli distinti; se la scomposizione fallisce onestamente
 * (Ollama irraggiungibile, JSON non valido, o un solo sotto-task) ricade
 * sull'esecuzione a singolo agente già verificata (`runAgentLoop`) — non
 * inventa mai ruoli fittizi. Se ci sono >=2 sotto-task reali, esegue ognuno
 * in sequenza con `runAgentLoop`, iniettando nel prompt del sotto-task
 * successivo l'output REALE (non riassunto a mano) del sotto-task
 * precedente come contesto — lo stesso pattern di "context passing" che
 * CrewAI applica tra i task di una crew sequenziale.
 */
async function runCrew(prompt: string, model: string, maxStepsPerSubtask = 3) {
  const decomposition = await decomposeIntoSubtasks(prompt, callLLM, model);

  if (!decomposition || decomposition.length <= 1) {
    const single = await runAgentLoop(prompt, model, Math.max(4, maxStepsPerSubtask));
    return {
      ...single,
      crewMode: false,
      decomposition: decomposition,
      subtasks: [{
        role: "Agente Unico",
        goal: prompt,
        reply: single.reply,
        success: single.success,
        trace: single.trace,
        codeResults: single.codeResults
      }]
    };
  }

  const subtaskResults: any[] = [];
  let previousOutput = "";
  let allSucceeded = true;

  for (let i = 0; i < decomposition.length; i++) {
    const subtask: CrewSubtask = decomposition[i];
    const subPrompt = `[Ruolo assegnato: ${subtask.role}]\nObiettivo di questo sotto-task: ${subtask.goal}\nRichiesta originale dell'utente (contesto generale): ${prompt}${previousOutput ? `\n\nOutput reale prodotto dal sotto-task precedente (usalo come contesto, non ripeterlo da zero):\n${previousOutput.slice(0, 1500)}` : ""}`;

    const result = await runAgentLoop(subPrompt, model, maxStepsPerSubtask);
    if (!result.success) allSucceeded = false;
    subtaskResults.push({
      role: subtask.role,
      goal: subtask.goal,
      reply: result.reply,
      success: result.success,
      error: (result as any).error ?? null,
      trace: result.trace,
      codeResults: result.codeResults
    });
    previousOutput = result.reply || previousOutput;

    if (!result.success) break; // onesto: non si prosegue a un sotto-task successivo se quello reale è fallito
  }

  // Sintesi finale reale: un'ultima chiamata Ollama che combina gli output
  // reali di tutti i sotto-task riusciti in una risposta unificata. Se
  // fallisce, si usa l'ultimo output reale disponibile senza inventarne uno nuovo.
  let finalReply = previousOutput;
  if (allSucceeded && subtaskResults.length > 1) {
    const synthesisPrompt = `Combina i seguenti output reali prodotti dai sotto-task del team in un'unica risposta finale coerente per l'utente, che aveva chiesto: "${prompt}"\n\n${subtaskResults.map((s, idx) => `--- Sotto-task ${idx + 1} (${s.role}): ${s.goal} ---\n${s.reply}`).join("\n\n")}`;
    const synthesis = await callLLM(model, [
      { role: "system", content: "Sei il coordinatore finale di un team di agenti. Rispondi SOLO con la sintesi finale in linguaggio naturale, senza blocchi di codice." },
      { role: "user", content: synthesisPrompt }
    ]);
    if (synthesis.ok && synthesis.content) finalReply = synthesis.content;
  }

  return {
    success: allSucceeded,
    crewMode: true,
    model,
    prompt,
    decomposition,
    subtasks: subtaskResults,
    reply: finalReply,
    trace: subtaskResults.flatMap((s, idx) => [
      { step: 0, type: "crew_role_start", title: `Sotto-task ${idx + 1}/${subtaskResults.length} — ruolo: ${s.role}`, detail: s.goal },
      ...s.trace
    ]),
    codeResults: subtaskResults.flatMap((s) => s.codeResults)
  };
}

/**
 * Comando "reflect" reale: rilegge davvero le ultime N richieste utente
 * salvate come nodi di memoria (type "fact", tag "session-task") e fa una
 * VERA chiamata all'LLM locale chiedendogli di estrarre pattern/preferenze
 * ricorrenti. Il risultato, se l'LLM risponde, viene salvato come un nuovo
 * nodo di memoria di tipo "preference" così da influenzare i recall futuri.
 * Se non ci sono abbastanza task in memoria o Ollama non risponde, ritorna
 * un errore onesto invece di un'estrazione inventata.
 */
async function runReflect(model: string, lastN = 15) {
  const tasks = memoryStore.getGraph().nodes
    .filter(n => n.type === "fact" && n.tags.includes("session-task"))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, lastN);

  if (tasks.length < 3) {
    return { success: false, error: `Servono almeno 3 task reali in memoria per riflettere (trovati ${tasks.length}). Esegui prima qualche richiesta con /api/agent/run.` };
  }

  const historyText = tasks.map((t, i) => `${i + 1}. ${t.content}`).join("\n");
  const reflectPrompt = `Ecco la cronologia REALE delle ultime ${tasks.length} richieste che l'utente ha fatto a questo agente:\n${historyText}\n\nAnalizza questi task reali ed estrai in modo sintetico (max 5 righe puntate) pattern ricorrenti o preferenze dell'utente (es. linguaggi preferiti, tipo di task ricorrenti, stile di risposta desiderato). Rispondi SOLO con l'elenco puntato, senza premesse.`;

  const { ok, content } = await callLLM(model, [
    { role: "system", content: "Sei un modulo di auto-riflessione che analizza la cronologia reale di un agente AI per estrarne pattern utili." },
    { role: "user", content: reflectPrompt }
  ]);

  if (!ok || !content.trim()) {
    return { success: false, error: `Impossibile contattare ${currentBackendLabel()} su ${currentBackendHost()} per la riflessione: nessun pattern è stato realmente estratto.` };
  }

  const node = memoryStore.addOrUpdateNode({
    type: "preference",
    label: `Pattern utente (reflect ${new Date().toLocaleDateString()})`,
    content: content.trim().slice(0, 800),
    confidence: 0.85,
    tags: ["reflection", "auto-extracted"]
  });

  return { success: true, analyzedTasks: tasks.length, extractedPatterns: content.trim(), node };
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
        llmBackend: currentBackend(),
        llmBackendHost: currentBackendHost(),
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

    // 2b. Deduplicazione reale via clustering a cosine similarity (Mem0-style)
    if (url.pathname === "/api/memory/deduplicate" && req.method === "POST") {
      try {
        let body: any = {};
        try { body = await req.json(); } catch {}
        const threshold = typeof body.threshold === "number" ? body.threshold : 0.93;
        const result = memoryStore.deduplicate(threshold);
        server.publish("omniclaw-events", JSON.stringify({ type: "memory_deduplicated", ...result }));
        return new Response(JSON.stringify(result), { headers });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // 2c. Forgetting reale basato su decadimento reale (età + recency + accessCount)
    if (url.pathname === "/api/memory/decay" && req.method === "POST") {
      try {
        let body: any = {};
        try { body = await req.json(); } catch {}
        const minScore = typeof body.minScore === "number" ? body.minScore : 0.15;
        const result = memoryStore.applyDecay(minScore);
        server.publish("omniclaw-events", JSON.stringify({ type: "memory_decayed", forgotten: result.forgotten }));
        return new Response(JSON.stringify(result), { headers });
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

    // 4b. Follow a real link extracted from the last navigated/searched page
    // (no headless browser — real HTTP GET on the real href, see browser_agent.ts)
    if (url.pathname === "/api/browser/click" && req.method === "POST") {
      try {
        const body: any = await req.json();
        const target = typeof body.index === "number" ? { index: body.index } : { textMatch: body.text || "" };
        const result = await browserAgent.followLink(target);
        server.publish("omniclaw-events", JSON.stringify({ type: "browser_action", result }));
        return new Response(JSON.stringify(result), { headers, status: result.success ? 200 : 404 });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // 4c. Fill and submit a real form extracted from the last navigated page
    // (real HTTP GET/POST to the form's real action URL — no headless browser,
    // no JS onsubmit handlers executed, see src/browser_agent.ts).
    if (url.pathname === "/api/browser/submit-form" && req.method === "POST") {
      try {
        const body: any = await req.json();
        const formIndex = Number(body.formIndex);
        const values: Record<string, string> = body.values && typeof body.values === "object" ? body.values : {};
        if (!Number.isFinite(formIndex)) {
          return new Response(JSON.stringify({ error: "formIndex (number) is required" }), { status: 400, headers });
        }
        const result = await browserAgent.fillAndSubmitForm(formIndex, values);
        server.publish("omniclaw-events", JSON.stringify({ type: "browser_action", result }));
        return new Response(JSON.stringify(result), { headers, status: result.success ? 200 : 404 });
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

        const result = await runAgentLoop(prompt, model, body.maxSteps);
        if (result.success) totalTasksExecuted += 1;
        lastExecutionTrace = result.trace;
        server.publish("omniclaw-events", JSON.stringify({ type: "agent_finished", prompt, trace: result.trace }));

        return new Response(JSON.stringify(result), { headers: { ...headers }, status: result.success ? 200 : 502 });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // 5a-bis. Crew mode reale (CrewAI-style role delegation): decompone davvero
    // il task in sotto-task con ruoli distinti (via Ollama) ed esegue ciascuno
    // in sequenza, passando l'output reale come contesto. Vedi runCrew() sopra.
    if (url.pathname === "/api/agent/crew-run" && req.method === "POST") {
      try {
        const body: any = await req.json();
        const prompt = body.prompt || "";
        const model = body.model || activeModel;

        const result = await runCrew(prompt, model, Math.max(1, Math.min(5, Math.floor(body.maxStepsPerSubtask) || 3)));
        if (result.success) totalTasksExecuted += 1;
        lastExecutionTrace = result.trace;
        server.publish("omniclaw-events", JSON.stringify({ type: "crew_finished", prompt, subtaskCount: result.subtasks.length }));

        return new Response(JSON.stringify(result), { headers, status: result.success ? 200 : 502 });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
      }
    }

    // 5b. Self-reflection over real session history (see runReflect)
    if (url.pathname === "/api/agent/reflect" && req.method === "POST") {
      try {
        const body: any = await req.json();
        const model = body.model || activeModel;
        const result = await runReflect(model, body.lastN);
        if (result.success) {
          server.publish("omniclaw-events", JSON.stringify({ type: "reflection_saved", node: result.node }));
        }
        return new Response(JSON.stringify(result), { headers, status: result.success ? 200 : 422 });
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
