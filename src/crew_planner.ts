/**
 * 🧑‍🤝‍🧑 Role-Delegation Task Decomposition (CrewAI-style)
 *
 * Gap: OmniClaw's existing `runAgentLoop` (server.ts) is a real, verified
 * single-persona ReAct/CodeAgent loop — one system prompt, one sequence of
 * think/execute steps. Real production multi-agent frameworks named as
 * competitors (CrewAI, and the same role-delegation pattern in LangGraph/
 * AutoGen) instead decompose a complex request into role-scoped subtasks
 * ("Researcher", "Analyst", "Writer", ...) and run them sequentially,
 * threading the real output of one subtask into the next as context
 * (CrewAI's `context` attribute) rather than one flat, undifferentiated loop.
 *
 * This module adds the DECOMPOSITION step only — a real Ollama call that
 * asks the local model to break the request into role-scoped subtasks and
 * return them as JSON. It is intentionally honest about failure: if Ollama
 * is unreachable, or the model's response can't be parsed as a valid
 * subtask array, this returns `null` rather than fabricating subtasks — the
 * caller (server.ts) is expected to fall back to the existing single-agent
 * loop in that case, never to invent a decomposition that didn't happen.
 */

export interface CrewSubtask {
  role: string;
  goal: string;
}

const DECOMPOSE_SYSTEM_PROMPT = `Sei un pianificatore di task per un sistema multi-agente stile CrewAI.
Ricevi una richiesta utente e devi scomporla in un massimo di 4 sotto-task sequenziali, ciascuno con un ruolo distinto e specifico (es. "Ricercatore", "Analista", "Scrittore", "Verificatore", "Programmatore") e un obiettivo concreto e verificabile.
Se la richiesta è già semplice/atomica e non trae beneficio da una scomposizione in ruoli distinti, rispondi con un array con UN solo elemento.
Rispondi SOLO con un array JSON valido, senza testo prima o dopo, in questo identico formato:
[{"role": "Nome Ruolo", "goal": "Obiettivo concreto e specifico di questo sotto-task"}, ...]`;

function extractJsonArray(text: string): any[] | null {
  // Il modello a volte avvolge il JSON in ```json ... ``` o aggiunge testo attorno:
  // isoliamo il primo blocco che sembra un array JSON valido.
  const fenced = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  if (!candidate || candidate.length < 2) return null;
  try {
    const parsed = JSON.parse(candidate);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validateSubtasks(raw: any[]): CrewSubtask[] | null {
  const cleaned: CrewSubtask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = typeof item.role === "string" ? item.role.trim() : "";
    const goal = typeof item.goal === "string" ? item.goal.trim() : "";
    if (!role || !goal) continue;
    cleaned.push({ role: role.slice(0, 80), goal: goal.slice(0, 400) });
  }
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, 4);
}

/**
 * Chiede davvero al modello locale (via il `callOllama` fornito dal chiamante,
 * per riusare esattamente la stessa connessione/gestione errori già verificata
 * in server.ts) di scomporre `prompt` in sotto-task con ruoli distinti.
 * Ritorna `null` — mai un array fabbricato — se Ollama non risponde o la
 * risposta non è un JSON valido nel formato atteso.
 */
export async function decomposeIntoSubtasks(
  prompt: string,
  callOllama: (model: string, messages: { role: string; content: string }[]) => Promise<{ ok: boolean; content: string }>,
  model: string
): Promise<CrewSubtask[] | null> {
  const { ok, content } = await callOllama(model, [
    { role: "system", content: DECOMPOSE_SYSTEM_PROMPT },
    { role: "user", content: prompt }
  ]);
  if (!ok || !content) return null;

  const raw = extractJsonArray(content);
  if (!raw) return null;

  return validateSubtasks(raw);
}
