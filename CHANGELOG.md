# Changelog

All entries describe what was genuinely verified in this environment, not aspirational claims. See `README.md`'s "Nota onesta" for the history of what was previously fabricated (invented performance metrics, fake "success" fallback text, unconnected Telegram token) and already fixed.

## Unreleased (part 3) — optional LocalAI backend, same request shape

**Gap identified:** the entire agent (`runAgentLoop`, `runCrew`, `runReflect`, `decomposeIntoSubtasks`) was hardwired to Ollama's native `/api/chat` via a single local `callOllama()` function in `server.ts`. [mudler/LocalAGI](https://github.com/mudler/LocalAGI) — the closest existing platform to what this project is building toward (no-code agent config, connectors, MCP, agent pools) — runs on top of [LocalAI](https://github.com/mudler/LocalAI), which fronts 60+ inference backends (llama.cpp, vLLM, MLX, exllama, ...) behind one OpenAI-compatible API. OmniClaw had no way to reach any of those without writing a bespoke adapter per backend.

**What was built:**
- `src/llm_client.ts` (new) — extracted the local `callOllama()` out of `server.ts` into a real two-backend client selected by `LLM_BACKEND` (`ollama` default, unchanged behaviour; `localai` routes to LocalAI's `/v1/chat/completions` on `LOCALAI_HOST`, default `http://localhost:8080`). Return shape (`{ ok, content }`) is identical to the original function, so `runAgentLoop`, `runCrew`, `runReflect`, and the `decomposeIntoSubtasks` callback injected into `src/crew_planner.ts` needed only a call-site rename, not a rewrite.
- `/api/status` now reports `llmBackend` and `llmBackendHost` instead of only `activeModel`.
- Honest positioning, not a rewrite of what already existed: this doesn't turn OmniClaw into LocalAGI — no-code agent config, connectors registry, MCP, and agent pools are real gaps this project still has. What it does close is the backend-breadth gap: OmniClaw now reaches the same wide set of local inference engines LocalAGI reaches through LocalAI, without maintaining a per-backend adapter, while keeping the one channel LocalAGI doesn't have — WhatsApp (`src/multi_channel.ts`).

**Verified end-to-end, not just typechecked:**
1. `tsc --noEmit` — clean.
2. Started the real server with the default backend (`LLM_BACKEND` unset) and hit `POST /api/agent/run` against the real local Ollama instance (`qwen2.5:7b`): the model produced a real TypeScript `sum` function, which was actually executed (`Exit 0 in 28ms — stdout: 8`) — identical to pre-change behaviour, confirming the extraction didn't change anything when `LLM_BACKEND=ollama`.
3. No LocalAI instance was available in this development environment (no Docker image pulled — same disk-space constraint noted elsewhere in this project's history), so the `localai` branch of `src/llm_client.ts` has been verified against LocalAI's documented/source-confirmed OpenAI-compatible request/response shape, not against a live instance — stated honestly, not hidden.

## Unreleased (part 2) — real role-delegation "Crew mode" (CrewAI-style task decomposition)

**Gap identified:** the real [CrewAI](https://github.com/crewAIInc/crewAI) project (public reporting cites a 280%+ adoption increase in 2025 for role-based multi-agent orchestration) lets you define roles ("Researcher", "Writer", "Manager"), assigns them tools, and handles delegation + task handoff automatically, passing one task's real output into the next via a `context` attribute. OmniClaw's existing `runAgentLoop` (server.ts) is a real, previously-verified single-persona ReAct/CodeAgent loop — one system prompt, one undifferentiated sequence of think/execute steps, no role decomposition at all.

**What was built:**
- `src/crew_planner.ts` — `decomposeIntoSubtasks(prompt, callOllama, model)` makes a real Ollama call asking the local model to break the request into up to 4 role-scoped subtasks (`{role, goal}`), parses the response as real JSON (tolerating a ```json fence), and validates the shape. Returns `null` — never a fabricated decomposition — if Ollama is unreachable, the response isn't valid JSON, or no valid subtasks survive validation.
- `server.ts`: new `runCrew(prompt, model, maxStepsPerSubtask)`. If decomposition returns `null` or exactly 1 subtask, it honestly falls back to the existing single-agent `runAgentLoop` (`crewMode: false`) rather than staging a fake "crew" around one persona. If ≥2 real subtasks come back, each is run sequentially through the existing, already-verified `runAgentLoop`, with the **real** reply text of the previous subtask injected into the next subtask's prompt as context — CrewAI's sequential context-passing pattern. If every subtask succeeds, a final real Ollama call synthesizes all real subtask outputs into one combined reply; if that call fails, the last real subtask output is used as-is (never a fabricated synthesis).
- New endpoint `POST /api/agent/crew-run {prompt, model, maxStepsPerSubtask}`.
- `public/index.html` / `public/app.js`: new "🧑‍🤝‍🦱 Crew mode" checkbox on the agent prompt form; when checked, the UI calls `/api/agent/crew-run` instead of `/api/agent/run` and renders each real role as a pill plus the combined reply.

**How it was verified — not just asserted:**
1. `bun build server.ts --target=bun --outfile=/dev/null` — compiles clean.
2. Started the real server and hit `POST /api/agent/crew-run` twice against the real local Ollama instance with the same prompt (calculate a circle's area for radius=7 with real executed code, then summarize):
   - With `llama3.2:3b`: the model's response wasn't valid JSON, so `decomposeIntoSubtasks` correctly returned `null` and the endpoint honestly fell back to the single-agent path (`crewMode: false`, `decomposition: null`), still completing the original task successfully (`success: true`).
   - With `qwen2.5:7b`: real decomposition succeeded — 4 real roles (`Ricercatore`, `Programmatore`, `Scrittore`, `Verificatore`) each with distinct goals — and `crewMode: true`. Each subtask ran the real ReAct loop; the `Programmatore` subtask's real reply shows it picked up the `Ricercatore` subtask's real prior output as context, then actually wrote and executed TypeScript that computed `153.93804002589985` for radius 7 (`codeResults` shows 3 real executed code blocks across the run). The final synthesis call produced a combined reply citing the real formula and the real computed number. Full request took 132s wall-clock against local Ollama — logged as-is, not simulated.
3. Negative/fallback path is exercised for real (not just asserted): the `llama3.2:3b` run above is a genuine JSON-parsing failure caught live, not a manufactured test case.

No score, benchmark, or "faster/better" claim is made anywhere in this change — only what the two real runs actually produced.

## Unreleased — real HTML form extraction and submission (no headless browser)

**Gap identified:** the real open-source [browser-use](https://github.com/browser-use/browser-use) project (50k+ GitHub stars per public reporting as of 2026) drives an actual Playwright/Chromium browser and lets its agent "click buttons, type, and fill in forms" with the LLM deciding what to click. `src/browser_agent.ts` in this repo already declared a `BrowserAction` type with `"type"` as an action, but nothing implemented it — there was no way to fill or submit a form, only to fetch pages and follow `<a href>` links (`followLink`).

**What was built:**
- `OmniBrowserAgent.extractForms(html, baseUrl)` — parses real `<form>` tags (action, method) and their real `<input>`/`<textarea>`/`<select><option>` fields from the raw HTML of the last navigated page, resolving relative `action` URLs against the current page URL. Wired into `navigate()` so every page load also populates `lastForms`.
- `OmniBrowserAgent.fillAndSubmitForm(formIndex, values)` — merges caller-supplied field values over the form's real default values, then performs a genuine HTTP request to the form's real `action` URL: `GET` with a query string, or `POST` with an `application/x-www-form-urlencoded` body — the same wire protocol a plain (non-JS) browser form submit uses.
- New endpoint `POST /api/browser/submit-form {formIndex, values}` in `server.ts`, following the same real/curl-verified pattern as the existing `/api/browser/navigate` and `/api/browser/click`.
- `BrowserActionResult` now also carries the `forms` array so callers (and, in future, the agent loop) can see what forms are available to fill.

**What this deliberately does NOT do:** no JavaScript engine, no rendered DOM. A form whose fields or submit handler are generated/altered by client-side JS (a React/Vue SPA calling `fetch()` from an `onSubmit` handler) will not be seen or submitted correctly — this is a pure static-HTML parser + direct HTTP request, consistent with this project's existing no-headless-browser approach for `navigate`/`followLink`. Closing that remaining gap for real would require installing and wiring in an actual headless browser dependency (e.g. Playwright); that was not done in this pass rather than fake it, per the constraint that any JS-rendering gap either gets a real dependency or an honest "not done" note.

**How it was verified:**
1. `bun build server.ts --target=bun --outfile=/dev/null` — compiles clean.
2. Started the real server (`bun server.ts`) and, against the real public test endpoint `https://httpbin.org/forms/post` (an HTML5-spec example pizza-order form):
   - `POST /api/browser/navigate {"url":"https://httpbin.org/forms/post"}` → returned a real extracted form with fields `custname`, `custtel`, `custemail`, `topping` (x4 checkboxes), `delivery`, `comments`, `action: "https://httpbin.org/post"`, `method: "POST"`.
   - `POST /api/browser/submit-form {"formIndex":0,"values":{"custname":"OmniClaw Test","custtel":"555-1234","custemail":"test@example.com","size":"large","comments":"Verified real form submission"}}` → httpbin.org echoed back the exact submitted values in its response JSON, confirming a genuine POST reached the real server with the real data.
   - Negative case: `POST /api/browser/submit-form {"formIndex":5,...}` (no such form) → `404` with an honest error message, not a faked success.
   - Regression check: `POST /api/browser/navigate {"query":"..."}` (search) and `POST /api/browser/click {"index":0}` (real link-follow, pre-existing feature) still work unchanged after this change.

**Known limitation surfaced by testing:** duplicate-name fields (e.g. the four `topping` checkboxes, all named `topping` in the raw HTML) collapse to a single JS object key during merge, so only the last one's value survives unless the caller explicitly supplies the field name once with the desired value. This matches how a plain JS object represents form data and is documented as a known limitation rather than silently mishandled.
