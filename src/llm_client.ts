/**
 * 🧠 Real LLM Client — Ollama or LocalAI, both genuine HTTP calls
 *
 * Backend selected via LLM_BACKEND ("ollama" | "localai", default "ollama"
 * so existing setups keep working unchanged):
 *
 *  - Ollama (http://localhost:11434, native /api/chat): the original
 *    behaviour of this project (previously a local function in server.ts).
 *  - LocalAI (http://localhost:8080, OpenAI-compatible /v1/chat/completions):
 *    lets OmniClaw run against LocalAI's much wider set of local backends
 *    (llama.cpp, vLLM, MLX, exllama, ...) behind the same request shape,
 *    without adding a per-backend adapter for each one.
 *
 * Return shape is unchanged from the original callOllama(): { ok, content }.
 * Nessun testo fabbricato: se la chiamata fallisce, ritorna ok:false — mai
 * un contenuto inventato.
 */

export type LLMBackendName = "ollama" | "localai";

export interface LLMChatMessage {
  role: string;
  content: string;
}

export interface LLMChatResult {
  ok: boolean;
  content: string;
}

function backendName(): LLMBackendName {
  return (process.env.LLM_BACKEND || "ollama").trim().toLowerCase() === "localai" ? "localai" : "ollama";
}

export const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
export const LOCALAI_HOST = process.env.LOCALAI_HOST || "http://localhost:8080";

async function callOllamaBackend(model: string, messages: LLMChatMessage[]): Promise<LLMChatResult> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) return { ok: false, content: "" };
    const data: any = await res.json();
    return { ok: true, content: data.message?.content || "" };
  } catch {
    return { ok: false, content: "" };
  }
}

async function callLocalAIBackend(model: string, messages: LLMChatMessage[]): Promise<LLMChatResult> {
  try {
    const res = await fetch(`${LOCALAI_HOST}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) return { ok: false, content: "" };
    const data: any = await res.json();
    return { ok: true, content: data.choices?.[0]?.message?.content || "" };
  } catch {
    return { ok: false, content: "" };
  }
}

/** Chiama davvero il backend LLM configurato (Ollama o LocalAI) con una lista di messaggi reale. */
export async function callLLM(model: string, messages: LLMChatMessage[]): Promise<LLMChatResult> {
  return backendName() === "localai" ? callLocalAIBackend(model, messages) : callOllamaBackend(model, messages);
}

export function currentBackend(): LLMBackendName {
  return backendName();
}

export function currentBackendHost(): string {
  return backendName() === "localai" ? LOCALAI_HOST : OLLAMA_HOST;
}

export function currentBackendLabel(): string {
  return backendName() === "localai" ? "LocalAI" : "Ollama";
}
