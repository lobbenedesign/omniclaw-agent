# Changelog

All entries describe what was genuinely verified in this environment, not aspirational claims. See `README.md`'s "Nota onesta" for the history of what was previously fabricated (invented performance metrics, fake "success" fallback text, unconnected Telegram token) and already fixed.

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
