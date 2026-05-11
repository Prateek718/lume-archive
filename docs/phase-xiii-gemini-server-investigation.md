# Phase XIII — Gemini Server-Side Migration: Investigation Report

**Status:** Ground-truth investigation only. No edits, no deployment, no design decisions.
**Goal:** Move `EXPO_PUBLIC_GEMINI_API_KEY` off the client (where it ships embedded in production APKs and is therefore extractable) onto a server-side surface — most likely Supabase Edge Functions. This document captures everything a designer/implementer needs to plan that move.

---

## 1. Every Gemini call in the codebase

There are **six** distinct call types. All live under `lib/gemini/`.

| # | Call type            | Model              | Module                        | Endpoint flavor                  | Output tokens cap | Streaming? |
|---|----------------------|--------------------|-------------------------------|----------------------------------|-------------------|------------|
| 1 | `vision`             | `gemini-2.5-pro`   | `lib/gemini/vision.ts`        | `:generateContent`               | 4096              | No         |
| 2 | `skin_recs`          | `gemini-2.5-flash` | `lib/gemini/skin.ts`          | `:streamGenerateContent?alt=sse` | 8192              | Yes        |
| 3 | `beard_recs`         | `gemini-2.5-flash` | `lib/gemini/beard.ts`         | `:streamGenerateContent?alt=sse` | 4096              | Yes        |
| 4 | `makeup_recs`        | `gemini-2.5-flash` | `lib/gemini/makeup.ts`        | `:streamGenerateContent?alt=sse` | 6144              | Yes        |
| 5 | `hair_recs`          | `gemini-2.5-flash` | `lib/gemini/hair.ts`          | `:streamGenerateContent?alt=sse` | 8192              | Yes        |
| 6 | `delta_commentary`   | `gemini-2.5-flash` | `lib/gemini/delta.ts`         | `:streamGenerateContent?alt=sse` | 4096              | Yes (no onPartial) |

Per-call shape:

### 1.1 `analyseWithGemini` (vision) — `lib/gemini/vision.ts:389`
- Inputs: `base64Image` (compressed 512×512 JPEG, ~50–80 KB raw bytes ⇒ ~70–110 KB base64), city, gender, careCategories, ageRange, previousScanSummary, scanId, scanNumber.
- Body: a single `contents[0].parts` with two parts: `inline_data` (base64 JPEG) + `text` (the prompt).
- `temperature: 0`, `maxOutputTokens: 4096`.
- Plain `fetch()` against `:generateContent` (non-stream). Reads the full JSON response.
- Output is parsed JSON: face_shape / skin_type / skin_concerns_detailed / score_skin / undertone / fitzpatrick / observation block (3 editorial insights + trait_chips).
- Includes a defensive sanitizer (`sanitizeObservation`) that strips face-shape leakage from observation prose.

### 1.2 `getSkinRecommendations` — `lib/gemini/skin.ts:156`
- Inputs: `analysis` (full GeminiAnalysis JSON), `matchedProducts` (catalog hits), `ageRange`, `options.scanId`, `options.onPartial?`.
- Streamed over SSE via `streamGeminiSSE`. `onPartial` lets the UI render the routine progressively.
- Post-process: `normalizeConcern()` against `target_concern` strings; fallback `routine_note` derived from advice.

### 1.3 `getBeardRecommendations` — `lib/gemini/beard.ts:126`
- Inputs: `analysis`, `beardGoal`, options.
- Streamed. Post-process strips face-shape language from `beard_shape_intro`.

### 1.4 `getMakeupRecommendations` — `lib/gemini/makeup.ts:103`
- Inputs: `analysis`, options.
- Streamed. Post-process validates the 6-swatch palette schema and falls back to a static palette lookup (`getPaletteSwatches`) when the model returns malformed swatches.

### 1.5 `getHairRecommendationsFromGemini` — `lib/gemini/hair.ts:219`
- Inputs: hair profile, faceShape, gender, city, budget, matched products, options.
- Streamed. **Not tied to scans** — fires only when the hair_profile changes (during hair-setup), so it does NOT participate in the scan critical path.

### 1.6 `getDeltaCommentary` — `lib/gemini/delta.ts:196`
- Inputs: previousScan, currentScan, scanDelta deltas, scanNumber, options.
- Streamed (no `onPartial` — used as a one-shot rather than a UX stream).
- Runs only on rescans, in parallel with the section calls.

All six share the same retry shape: at most TWO attempts (initial + at most one conditional retry), gated by `shouldRetry()` which classifies the error/finish-reason.

---

## 2. Shared infrastructure (`lib/gemini/shared.ts`)

This module is the security-critical hot spot. Every call funnels through these constants and helpers:

### 2.1 The key — line 10
```ts
export const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY!;
```
The `EXPO_PUBLIC_` prefix is the explicit signal that Expo will inline this value into the JS bundle. **In a production APK the key is recoverable by anyone with `apktool` and a text search.**

### 2.2 The three endpoint URLs — lines 15-17
```ts
export const ENDPOINT             = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_VISION}:generateContent?key=${API_KEY}`;
export const ENDPOINT_TEXT        = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEXT}:generateContent?key=${API_KEY}`;
export const ENDPOINT_TEXT_STREAM = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEXT}:streamGenerateContent?alt=sse&key=${API_KEY}`;
```
Note: the API key is interpolated as a **query string parameter** (`?key=...`). It is not in a header. That means TLS protects it on the wire, but every request log on every proxy in between sees `?key=AIza...` in the URL line. For a server-side migration, the canonical Gemini SDK pattern uses the same query-string scheme; the migration's job is to keep that exposure server-side.

`ENDPOINT_TEXT` (non-stream Flash) is **declared but unused** in current code — every Flash caller uses `ENDPOINT_TEXT_STREAM`.

### 2.3 `streamGeminiSSE` — lines 257-347
Plain `fetch()`, then dual-path body read:
- **Preferred path:** `response.body.getReader()` + `TextDecoder`, frame-by-frame SSE parse, calls `onPartialText(accumulated)` on each text delta.
- **Fallback path:** `response.text()` full buffer, then split-on-newlines and parse each `data:` frame (no progressive UI). Used when the RN fetch polyfill doesn't expose a body reader.

Returns `{ text, inputTokens, outputTokens, finishReason, safetyRatings }`. Token counts come from Gemini's `usageMetadata` field, which lands in the *last* SSE frame.

### 2.4 `shouldRetry(err, finishReason)` — lines 40-84
Single-retry classifier. Returns `true` for HTTP 5xx/429, network failures, JSON parse errors, and empty responses. Returns `false` for `MAX_TOKENS / SAFETY / RECITATION / BLOCKLIST` (deterministic) and post-parse schema failures.

### 2.5 Prompt scaffolding constants
- `VOICE_ANCHOR` and `EDITORIAL_RULES` — the shared editorial-voice system prompt.
- `CANONICAL_CATEGORY_LIST` — must stay in sync with `constants/productConstants.ts`.
- `cardinal()` / `ordinal()` / `fitzpatrickToDepthTier()` / `getPaletteSwatches()` / `cleanJsonResponse()` / `tryParsePartialJson()` / `faceShapeProse()` / `stripFaceShapeSentences()`.

A server-side runtime would need most of these (or at least the ones touched by the migrated calls).

---

## 3. Every call site

`grep` for the six exported functions. Excluding the test screen, every production caller is in `services/scanService.ts`:

### 3.1 `analyseWithGemini` (vision)
- `services/scanService.ts:310` — `runScanPhase1`. The only production caller.
- `app/gemini-test.tsx:119` — dev-only verification screen, header marked `REMOVE BEFORE LAUNCH`.

### 3.2 `getSkinRecommendations`
- `services/scanService.ts:707` — Phase 2 of a fresh scan.
- `services/scanService.ts:1105` — `refreshRecommendations` (post-edit regen).
- `services/scanService.ts:1245` — `regenerateSkinRecs` (per-section retry).
- `app/gemini-test.tsx:141` — dev test.

### 3.3 `getBeardRecommendations`
- `services/scanService.ts:723` — Phase 2 (gated by `beardApplicable`).
- `services/scanService.ts:1115` — refresh path.
- `services/scanService.ts:1261` — `regenerateBeardRecs`.

### 3.4 `getMakeupRecommendations`
- `services/scanService.ts:740` — Phase 2 (gated by `needsMakeup`, which checks `shouldRegenerateMakeup` against stored undertone/depth).
- `services/scanService.ts:1126` — refresh path.
- `services/scanService.ts:1270` — `regenerateMakeupRecs`.

### 3.5 `getHairRecommendationsFromGemini`
- `services/scanService.ts:1470` — `generateAndSaveHairProfile`. Triggered from the hair-setup analyzing screen, **not** from the scan flow. One call site, period.
- `app/gemini-test.tsx:159` — dev test.

### 3.6 `getDeltaCommentary`
- `services/scanService.ts:501` — `generateAndStoreDeltaCommentary`, fired only on rescans. One call site.

UI orchestration that triggers these is in `hooks/useScan.tsx`:
- `runScanPhase1` (vision) — `useScan.tsx:309`
- `runScanPhase2` (the four section fan-out) — `useScan.tsx:213`, `useScan.tsx:451`
- `refreshRecommendations` — `useScan.tsx:254`
- `regenerateSection` (per-section retry) — `useScan.tsx:479`

There is no caller of any Gemini function outside these two files (plus the dev-only test screen).

---

## 4. `.env` keys

Confirmed at the start of this session. Five public keys, by name:

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_GEMINI_API_KEY        ← target of this migration
EXPO_PUBLIC_GOOGLE_PLACES_KEY
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
```

(Earlier context referenced R2 keys and a Custom Search key; neither is present in the current `.env`. The Custom Search investigation last cycle confirmed it as fully dead config.)

Only `EXPO_PUBLIC_GEMINI_API_KEY` is in scope for Phase XIII. After the migration:
- The client should NOT have any Gemini key.
- The server-side function should hold a non-public key (e.g., `GEMINI_API_KEY`, set via `supabase secrets set`).
- `EXPO_PUBLIC_GOOGLE_PLACES_KEY` is a separate concern — it is restricted server-side at Google by referer / app bundle, so it's a different threat model. Out of scope here, but worth flagging as the next candidate.

---

## 5. Cost tracking dependency (`lib/geminiUsage.ts`)

Every call funnels into `logUsage()`:

```
client                                         supabase.gemini_usage
──────                                         ──────────────────────
console.log(...)              ─────────────►   (just stdout)
supabase.from('gemini_usage')                  insert row { user_id, scan_id,
  .insert({...})              ─────────────►     call_type, model,
                                                 input_tokens, output_tokens,
                                                 cost_usd, duration_ms,
                                                 success, error_message }
```

### 5.1 Pricing table — `geminiUsage.ts:7-10`
```ts
'gemini-2.5-pro':        { input: 1.25 / 1_000_000, output: 10.00 / 1_000_000 },
'gemini-2.5-flash':      { input: 0.30 / 1_000_000, output: 2.50  / 1_000_000 },
'gemini-2.5-flash-lite': { input: 0.10 / 1_000_000, output: 0.40  / 1_000_000 },
```

### 5.2 Database table — `supabase/migrations/phase_00_baseline_telemetry.sql`
- `public.gemini_usage` exists, baselined at Phase 0.
- Originally had a CHECK constraint that allowed only `('vision','skin_recs','hair_recs')` — silently rejected `beard_recs / makeup_recs / delta_commentary`. **Already fixed** in `phase_xi_fixes_and_indexes.sql`.
- `user_id` cascades on user delete; `scan_id` is `ON DELETE SET NULL` (also fixed in phase_xi).

### 5.3 Migration implication
After the migration, the **server-side function** must continue to write to `gemini_usage`. Two architectural options:
1. **Edge function writes directly** to `gemini_usage` using the Postgres service-role key (server-side already trusted). Pro: simpler. Con: server-side logging is not the same row-level-secured insert the client does today (currently uses the user's auth context).
2. **Edge function returns the usage record** to the client; client writes the row. Pro: keeps RLS authorship. Con: client can falsify the cost log.

Today the client invokes `supabase.auth.getUser()` and inserts a row authored by the user — see `geminiUsage.ts:46-60`. RLS likely allows users to insert their own rows (worth confirming when the migration design lands). A server-side path with the service role bypasses RLS, which is fine for telemetry.

---

## 6. Architectural constraints

### 6.1 Streaming UX is real — not optional for Flash calls
`getSkinRecommendations`, `getBeardRecommendations`, `getMakeupRecommendations`, `getHairRecommendationsFromGemini` all pass `onPartial` callbacks that drive progressive UI rendering. The user-perceived latency story depends on this — if the migration buffers the entire response server-side and returns one body, the observation/recs screens become a long blank wait instead of the current "fields fill in as they parse" experience.

This means the Edge Function needs to expose a streaming response (chunked transfer or SSE) and the client needs to consume the same per-line frame format `streamGeminiSSE` already understands. Supabase Edge Functions (Deno) support streaming responses via `Response(ReadableStream)`. The migration must preserve this end-to-end, not collapse it.

`getDeltaCommentary` does NOT pass `onPartial` — it streams but only reads the final accumulated text. That call could be served as a non-streaming response without UX regression.

### 6.2 Image payload (vision call only)
- Compressed to 512×512 JPEG @ quality 0.85 in `services/scanService.ts:78` before any network hop.
- Base64 size: roughly 70–110 KB string (ImageManipulator quality 0.85 typically yields ~50–80 KB raw bytes ⇒ +33% base64 overhead).
- Today this base64 is embedded directly in the request body to Gemini. After migration the client would POST this to the Edge Function, which would re-embed it in the upstream request to Gemini.
- **Ingress doubling:** every scan now ships the image bytes once (client → Gemini). After migration: client → Edge Function → Gemini. Edge Function must accept ~100 KB request bodies; the Supabase default 6 MB body limit is comfortable.

### 6.3 Latencies (observed from existing logs / code comments)
- Vision call: described in code as "~18s" (`scanService.ts:237` comment). This is dominated by Gemini, not transport — a server-side hop adds only the second round-trip plus any cold-start cost.
- Phase 2 Flash calls: 8–25s each typically. Run in parallel via `Promise.allSettled`.
- Cold-start: a Supabase Edge Function on its first invocation in a region has been observed at 300–800ms. After the first call it stays warm for several minutes. For a vision call gated behind a multi-second Gemini latency, cold start is a small fraction. For the parallel section calls, it adds once (the first one warms it for the others).

### 6.4 Token-budget headroom
- Vision: 4096 (used to be 2500; bumped to absorb the observation block at line 434-436).
- Skin/Hair: 8192 (skin recs comment notes Gemini 2.5 reasoning tokens consume budget beyond visible output).
- Makeup: 6144.
- Beard: 4096 (bumped from 2000 after observed MAX_TOKENS at 996, line 161-164).
- Delta: 4096.

These are caps on the Gemini side, not transport. The migration doesn't change them, but the Edge Function should not impose its own response-size cap below ~250 KB to be safe.

### 6.5 `inline_data` JSON shape (vision only)
The vision request shape is Google's specific Gemini schema:
```json
{ "contents": [{ "parts": [
    { "inline_data": { "mime_type": "image/jpeg", "data": "<base64>" } },
    { "text": "<prompt>" }
] }], "generationConfig": { "temperature": 0, "maxOutputTokens": 4096 } }
```
The Edge Function either (a) accepts the same shape and forwards it, or (b) accepts `{ image: <base64>, prompt: <text> }` and constructs Google's shape server-side. Option (b) is cleaner if multiple call types share a single function entrypoint.

### 6.6 Retry semantics
`shouldRetry()` is the only logic that varies retry vs. fail-fast based on Gemini's `finishReason`. Two design options for migration:
1. Push `shouldRetry` to the server. Pro: identical behavior. Con: the server must inspect Gemini's response and decide whether to retry (one extra Gemini call from the server).
2. Keep retry on the client. Pro: matches today's structure, easy to understand. Con: a client-side retry is a second full Edge Function round trip.

Today's retry is on the client; carrying that pattern across is the simpler diff but doubles the round-trip cost when Gemini throws a transient error. For a single retry per call, it's negligible.

---

## 7. Existing Supabase setup

### 7.1 What exists
- `supabase/migrations/` — 21 SQL migration files. Hand-applied or applied via `supabase db push`; this project does not appear to use the local Supabase emulator.
- Client SDK config at `lib/supabase.ts` (uses `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`).

### 7.2 What does NOT exist
- **No `supabase/functions/` directory.** Confirmed via `ls supabase/`.
- **No Supabase CLI** on the dev machine (a prior `supabase --version` returned `command not found`). The CLI is a prerequisite to scaffold and deploy Edge Functions.
- No prior Edge Function in production. This will be the first.
- No `supabase/config.toml` (the file the CLI expects when scaffolding a project). It would need to be initialized via `supabase init` before `supabase functions new`.

### 7.3 What the migration adds
- `supabase/functions/<name>/index.ts` — Deno-runtime entrypoint(s).
- `supabase/functions/<name>/deno.json` (optional) and any shared `_shared/` modules (Supabase convention).
- A `supabase secrets set GEMINI_API_KEY=<value>` invocation. The key never goes in `.env` again; it lives in Supabase's secret store.
- Auth: by default Edge Functions require a valid JWT (`Authorization: Bearer <supabase_anon_jwt>`). The Supabase JS client adds this automatically when `supabase.functions.invoke('name', {...})` is used.

---

## 8. Surprises and risks

### 8.1 The key is in production APKs *today*
This is the immediate blast radius. Anyone with a built APK and 5 minutes can extract `EXPO_PUBLIC_GEMINI_API_KEY` and run unbounded inference on Anthropic's, sorry, Lumé's billing. (Yes, Anthropic's wasn't a typo — flagging that this report is for the Lumé project.) **This is the entire reason the migration is happening.** The first action regardless of design choices: revoke and rotate the existing key the moment the server-side path goes live, AND add a per-key quota at Google's console as a belt-and-suspenders measure.

### 8.2 Streaming preservation is the single hardest design question
Naive proxies (e.g., `Response.json(await fetch(url).then(r => r.json()))`) defeat streaming. The whole UX value of the per-section progressive renders depends on `onPartial` getting called once per SSE frame. If the migration silently serialises everything, the routine screen will feel slower despite Gemini being just as fast. The Edge Function MUST pipe the upstream `ReadableStream` into the response stream.

### 8.3 The `?key=` URL position vs. server logs
Even on the server side, a careless implementation that forwards URLs through a logging layer can leak the key into console output. Best practice on Deno: build the URL via `new URL()` and call `url.searchParams.set('key', Deno.env.get('GEMINI_API_KEY'))` only at the moment of fetch, never `console.log` the constructed URL.

### 8.4 The dev-only `app/gemini-test.tsx` screen
File header says `REMOVE BEFORE LAUNCH`. It still calls Gemini directly. Either remove it before Phase XIII ships, OR migrate it to use `supabase.functions.invoke('gemini-...')` like everything else. Forgetting it means the key still ends up in the bundle.

### 8.5 Cost-log RLS uncertainty
`logUsage` writes to `gemini_usage` from the client today, authored by the user's session. The current RLS policies for `gemini_usage` were not re-examined for this report — worth checking before deciding whether the Edge Function writes the usage row (service role) or hands a usage record back to the client (user role + RLS insert). Pointer: `supabase/migrations/phase_00_baseline_rls.sql` covers RLS policy state at the start of Phase XI cleanup.

### 8.6 RN fetch-fallback path is untested for non-streaming endpoints
`streamGeminiSSE`'s fallback path (full `response.text()` then per-line parse) was added because some RN runtimes don't expose `body.getReader()`. If the Edge Function returns a chunked-transfer-encoded stream, the client's fallback path will accumulate the entire body before parsing — i.e., `onPartial` never fires. The migration should verify whether RN's current fetch implementation reaches the streaming branch or the fallback branch. If fallback, the entire UX point of `onPartial` is already moot in production today (only the dev-built reader works).

### 8.7 Two finishReason cases that today are silent
`MAX_TOKENS` and `SAFETY` are non-retried on the client. After migration, if the server transparently forwards the response, the client still sees them and still throws — fine. But if the server "helpfully" retries on a finishReason it shouldn't, costs balloon. The migration should keep `shouldRetry` semantics intact end-to-end.

### 8.8 `ENDPOINT_TEXT` (non-stream Flash) is dead
Declared at `shared.ts:16`, never imported. Removable, but separate from the migration; flagging because a server-side rewrite has a chance to clean this up too.

---

## 9. Open questions for the implementer

1. **Single multi-call Edge Function, or six?**
   One per call type is the cleanest (`gemini-vision`, `gemini-skin-recs`, etc.) and matches today's six-module structure. A single function dispatching by `call_type` is less code but couples deployment of all six. Recommend: one per type.

2. **Where do prompts live?**
   Today every prompt is built client-side and shipped over the wire. After migration, two options:
   (a) Client builds the prompt and POSTs `{ prompt, generationConfig }` to the function. Pro: zero shared logic to duplicate server-side; the Edge Function becomes a thin proxy. Con: prompts live on the client, so prompt-engineering changes still ship in app updates.
   (b) Server builds the prompt from raw inputs; client POSTs `{ analysis, options }`. Pro: prompt updates ship without an OTA. Con: every shared util (`VOICE_ANCHOR`, `cardinal`, `fitzpatrickToDepthTier`, etc.) needs a Deno copy.
   Recommend: (a) for v1, migrate prompts later as a separate phase if needed.

3. **Auth?**
   Default Supabase Edge Functions check for a Supabase JWT. That gives "any signed-in user can hit it" out of the box. Is per-user rate-limiting needed here? Today there is no client-side rate limit either — a misbehaving user can already burn through the same calls — but the cost lands on Lumé's bill regardless. A per-user-per-day quota in the Edge Function (cheap Postgres count against `gemini_usage`) is worth considering.

4. **Cost log writer: server (service role) or client (user role)?**
   See §5.3 and §8.5. Lean toward server-side write with the service role; users can't falsify it, and it's one less round trip.

5. **Streaming response format: SSE or chunked-transfer?**
   Today's client parses Google's SSE format (`data: {json}\n\n`). Easiest for the Edge Function: forward Google's stream verbatim, including the `data:` framing. The client's `streamGeminiSSE` keeps working with zero changes.

6. **What's the rollout / rollback story?**
   The existing call sites import functions like `analyseWithGemini` directly. A safe staged rollout could keep the function exports intact but route them through `supabase.functions.invoke()` internally, gated by a feature flag (or a single env var like `EXPO_PUBLIC_GEMINI_VIA_EDGE`). Same call sites, same tests, swap of internal transport.

7. **What's the timeline for revoking the existing key?**
   The current key is in the wild on every installed APK. Once the server path is live and verified, the existing key MUST be revoked the same day, even if a few legacy installs throw analyse-errors. Otherwise the migration has fixed nothing.

8. **`hasValidHairProfile` and other helpers**
   Most helpers are pure functions and don't depend on the Gemini key. They stay client-side. But if option (b) from question 2 is chosen, these helpers (or their server-side equivalents) need to ship in Deno too.

9. **Does the `gemini-test.tsx` dev screen survive?**
   If yes, route it through the function like everything else. If no, delete it as part of Phase XIII so the key extraction surface area shrinks to zero.

---

## Appendix A — Files read for this report

- `lib/gemini/shared.ts` (393 lines)
- `lib/gemini/index.ts` (25 lines)
- `lib/gemini/vision.ts` (552 lines)
- `lib/gemini/skin.ts` (310 lines)
- `lib/gemini/hair.ts` (345 lines)
- `lib/gemini/beard.ts` (261 lines)
- `lib/gemini/makeup.ts` (266 lines)
- `lib/gemini/delta.ts` (353 lines)
- `lib/geminiUsage.ts` (72 lines)
- `services/scanService.ts` (1547 lines, full)
- `hooks/useScan.tsx` (535 lines, full)
- `app/gemini-test.tsx` (head only — confirmed dev-only test screen)
- `.env` (key names only — values not read)
- `supabase/migrations/phase_00_baseline_telemetry.sql` (relevant excerpts)
- `supabase/migrations/` directory listing

## Appendix B — Recommended next phase boundary

Phase XIII naturally splits in two:
- **XIII-a:** Stand up one Edge Function (recommend `gemini-vision`, the highest-value call), wire it end-to-end including streaming and cost logging, confirm parity, ship it. Revoke the public key.
- **XIII-b:** Migrate the remaining five calls in a single sweep, identical pattern, no design surprises.

This contains the "first Edge Function ever" risk inside a single shippable unit and keeps the urgent-key-rotation bit tight.
