# Phase XIII — Gemini server-side migration: architecture

> **v3 — revised 2026-05-11.** Four revisions applied: per-call
> kill-switch flags (`vision_enabled`, `skin_recs_enabled`,
> `beard_recs_enabled`, `makeup_recs_enabled`, `hair_recs_enabled`,
> `delta_commentary_enabled`) added alongside the master
> `gemini_scans_enabled` in §10 — `lib/appConfig.ts` gains six per-call
> helpers; §14.2 migration order revised to lowest-blast-radius-first
> (delta → hair → makeup → beard → skin); §14.2 commit strategy moved
> from single bulk commit to per-function commits with a bake window
> between each plus a final cleanup commit; new §18 maps every §17
> deferred item to its Block 1–5 trigger point and pins alert thresholds
> for the future log aggregator. The v2 sections preserved verbatim
> below outside of these four targeted changes.
>
> **v2 — revised 2026-05-11.** Six revisions applied: remote-config kill
> switch (§10) replaces the EAS env-var pattern; quota-check failure now
> fails closed (§8.1); §16 restructured into gated verification steps
> referenced from §14; §4.4 grows a verification step; §15.5 split into
> 15.5a/15.5b; §13 gains §13.4 on observability v1-vs-scale. All other
> sections preserved verbatim.
>
> Design-only document. No source-code edits, no `.env` changes, no SQL, no
> deployments. Locked decisions live in the brief at the top of the
> conversation that produced this document. This file operationalises them.
>
> Date prepared: 2026-05-11. Branch target: `phase-xiii-gemini-server` off
> `main`. Splits into XIII-a (vision only, single commit) and XIII-b (five
> Flash calls, one focused commit per function on
> `phase-xiii-gemini-server-flash` plus a final cleanup commit — see §14.2).
>
> Reads as a companion to `docs/phase-xiii-gemini-server-investigation.md`.
> Where the investigation lists options, this document picks one and shows
> the shape of the implementation. Line numbers reference current code at
> the time of writing.

---

## 0. The three V1-V3 findings that shape this design

| ID | Finding | Architectural consequence in this doc |
|----|---------|---------------------------------------|
| V1 | `response.body.getReader` is undefined in RN's fetch polyfill on Android. `streamGeminiSSE`'s "preferred path" never runs in production — every call falls through to the buffered `response.text()` branch, which means `onPartial` already never fires in shipped APKs. | **Drop streaming entirely.** Every function below uses Google's `:generateContent` endpoint. No SSE. No `ReadableStream` responses from the Edge Function. No `onPartial`. (§6 below.) |
| V2 | `delta_commentary` (`lib/gemini/delta.ts:271`) calls `streamGeminiSSE(ENDPOINT_TEXT_STREAM, body)` without an `onPartial` argument. It only reads the final accumulated text. Vestigial streaming. | Migrate `gemini-delta-commentary` as a plain JSON request/response. No behavioural change visible to the user. |
| V3 | `gemini_usage` has an active `gemini_usage_insert_own` RLS policy (`supabase/migrations/phase_00_baseline_rls.sql:129-132`) that allows any authenticated user to insert their own rows. `logUsage` (`lib/geminiUsage.ts:45-60`) writes from the client today, authored by the user's session. | **Server writes telemetry with the service role.** The RLS insert policy can stay (no rush to drop it — service role bypasses RLS), but the client-side write path is deleted in this phase. Costs can no longer be falsified. (§7 below.) |

These three findings are why this is a "lift-and-shift to non-streaming
service-role-writing edge functions" migration, not a "streaming proxy"
migration. The investigation document explored both options; this design
locks in the simpler one because V1 means the streaming UX it was protecting
already wasn't running in prod.

---

## 1. Function inventory

Six functions, one per call type. Each is a `supabase/functions/<name>/index.ts`
file with its own `deno.json` (if needed) plus a shared
`supabase/functions/_shared/` tree imported via relative path.

All six share these defaults:
- **HTTP method:** `POST` only. GET returns 405.
- **Auth:** Supabase JWT required. The Edge Function runtime enforces this
  by default; we do not pass `verify_jwt: false`. The function reads the
  caller's `user_id` from the JWT to scope quota + cost tracking.
- **Content-Type:** request and response are `application/json`.
- **Retry semantics:** see §9. One retry against Google, gated by the
  ported `shouldRetry`. The function returns `502` on exhaustion.
- **Quota:** per-user, per-24h, per-function. Default 50, overridden per
  function below. See §8 for the count query.

### 1.1 `gemini-vision`

| Field | Value |
|---|---|
| Endpoint path | `supabase/functions/gemini-vision/index.ts` |
| Google endpoint | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent` |
| `maxOutputTokens` | 4096 |
| `temperature` | 0 |
| `cost_tracking.call_type` | `'vision'` |
| `cost_tracking.model` | `'gemini-2.5-pro'` |
| Quota ceiling | **10 / user / 24h** (justified §8) |
| Auth | JWT required, anon NOT allowed |

Request body schema:
```ts
// supabase/functions/_shared/types.ts — co-located with the function for clarity
export interface GeminiVisionRequest {
  imageBase64:         string;           // ~70–110 KB string; client compresses to 512×512 @ q0.85
  city:                string | null;
  gender:              'man' | 'woman';
  careCategories:      string[];         // subset of ['skin','hair','beard','makeup']
  ageRange:            string | null;
  previousScanSummary: string | null;
  scanId:              string;           // for cost-tracking row + future retries
  scanNumber:          number;           // for ordinal()/cardinal() in observation block
}
```

Response body schema — mirrors today's `GeminiAnalysis` from
`lib/gemini/vision.ts:34-57`:
```ts
export interface GeminiVisionResponse {
  face_shape:               string;
  skin_type:                string;
  skin_concerns:            string[];
  skin_concerns_detailed:   SkinConcernObservation[];
  beard_density:            'none' | 'light' | 'medium' | 'heavy' | null;
  beard_condition:          'well_groomed' | 'needs_shaping' | 'patchy' | 'untrimmed' | null;
  brow_condition:           'well_defined' | 'sparse' | 'ungroomed' | 'over_plucked' | null;
  undereye:                 'dark_circles' | 'puffiness' | 'normal' | null;
  score_skin:               number;
  fitzpatrick_scale:        number | null;
  skin_undertone:           'warm' | 'cool' | 'neutral' | null;
  observation:              ScanObservation;            // post-sanitized server-side
  confidence?:              { face_shape?: number; skin_undertone?: number };
  alternatives?:            { face_shape?: string | null; skin_undertone?: string | null };
}
```

Error responses:
- `400` — body fails Zod-or-equivalent validation. JSON `{ error: string }`.
- `401` — no/invalid JWT. (Runtime-default response; we don't customize.)
- `429` — quota exceeded. JSON `{ error: 'quota_exceeded' }` + `Retry-After: <seconds-until-reset>` header.
- `502` — Gemini call failed both attempts. JSON `{ error: string, finish_reason: string | null }`.

### 1.2 `gemini-skin-recs`

| Field | Value |
|---|---|
| Endpoint path | `supabase/functions/gemini-skin-recs/index.ts` |
| Google endpoint | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` |
| `maxOutputTokens` | 8192 |
| `temperature` | 0 |
| `cost_tracking.call_type` | `'skin_recs'` |
| `cost_tracking.model` | `'gemini-2.5-flash'` |
| Quota ceiling | **20 / user / 24h** |
| Auth | JWT required |

Request:
```ts
export interface GeminiSkinRecsRequest {
  analysis:        GeminiVisionResponse;   // full analysis, used to embed JSON.stringify into the prompt
  matchedProducts: MatchedProduct[];       // shape: { category, actives?: string[] }
  ageRange:        string | null;
  scanId:          string | null;
}
```

Response — mirrors today's `SkinRecommendation` post-normalize (see
`lib/gemini/skin.ts:228-256` for the normalization steps that move
server-side):
```ts
export interface GeminiSkinRecsResponse {
  advice:       string;
  routine_note: string;             // never empty — server applies the fallback derivation
  steps:        RoutineStep[];      // target_concern values are pre-normalized against CANONICAL_CONCERNS
}
```

### 1.3 `gemini-beard-recs`

| Field | Value |
|---|---|
| Endpoint path | `supabase/functions/gemini-beard-recs/index.ts` |
| Google endpoint | `…/gemini-2.5-flash:generateContent` |
| `maxOutputTokens` | 4096 |
| Quota ceiling | **20 / user / 24h** |
| Auth | JWT required |

Request:
```ts
export interface GeminiBeardRecsRequest {
  analysis:  GeminiVisionResponse;
  beardGoal: 'fuller' | 'sharper' | 'shorter' | 'longer' | 'none' | null;
  scanId:    string | null;
}
```

Response — mirrors `BeardRecommendation` post-sanitization
(`lib/gemini/beard.ts:200-207`):
```ts
export interface GeminiBeardRecsResponse {
  advice:             string;
  beard_shape_intro:  string | null;     // null if missing OR face-shape-leak detected on server
  steps:              BeardRoutineStep[];
  beard_styles:       BeardStyle[];
}
```

### 1.4 `gemini-makeup-recs`

| Field | Value |
|---|---|
| Endpoint path | `supabase/functions/gemini-makeup-recs/index.ts` |
| Google endpoint | `…/gemini-2.5-flash:generateContent` |
| `maxOutputTokens` | 6144 |
| Quota ceiling | **10 / user / 24h** |
| Auth | JWT required |

Request:
```ts
export interface GeminiMakeupRecsRequest {
  analysis: GeminiVisionResponse;        // needs fitzpatrick_scale + skin_undertone for the palette
  scanId:   string | null;
}
```

Response — server runs the palette validation + fallback at
`lib/gemini/makeup.ts:172-212` before responding:
```ts
export interface GeminiMakeupRecsResponse {
  advice:     string;
  techniques: string[];
  palette:    MakeupPalette | null;      // null if undertone/fitzpatrick missing OR swatches malformed AND no static fallback
}
```

### 1.5 `gemini-hair-recs`

| Field | Value |
|---|---|
| Endpoint path | `supabase/functions/gemini-hair-recs/index.ts` |
| Google endpoint | `…/gemini-2.5-flash:generateContent` |
| `maxOutputTokens` | 8192 |
| Quota ceiling | **10 / user / 24h** |
| Auth | JWT required |

Request:
```ts
export interface GeminiHairRecsRequest {
  profile:         HairProfile;
  faceShape:       string | null;
  gender:          string;
  city:            string | null;
  budget:          'affordable' | 'premium';
  matchedProducts: MatchedProduct[];
  scanId:          string | null;         // hair recs are not tied to a scan; always null today
}
```

Response — mirrors `HairRecommendations` shape; today's `getHairRecommendationsFromGemini`
does no post-processing (`lib/gemini/hair.ts:291`), so the response is the
parsed JSON directly:
```ts
export interface GeminiHairRecsResponse {
  advice:                string;
  styles:                string[];
  styles_detailed:       HairStyle[];
  condition_explanation: string;
  routine:               HairRoutineStep[];
  products:              HairProductPick[];
}
```

### 1.6 `gemini-delta-commentary`

| Field | Value |
|---|---|
| Endpoint path | `supabase/functions/gemini-delta-commentary/index.ts` |
| Google endpoint | `…/gemini-2.5-flash:generateContent` |
| `maxOutputTokens` | 4096 |
| Quota ceiling | **10 / user / 24h** |
| Auth | JWT required |

Request — the server computes `concerns_worsened` server-side using the
same `SEVERITY_RANK` logic at `lib/gemini/delta.ts:217-226`, so the client
just hands over both scans + the delta row:
```ts
export interface GeminiDeltaCommentaryRequest {
  previousScan: Pick<Scan, 'skin_concerns' | 'skin_concerns_detailed'>;
  currentScan:  Pick<Scan, 'skin_concerns' | 'skin_concerns_detailed'>;
  scanDelta: {
    days_between:        number;
    concerns_improved:   string[];
    concerns_new:        string[];
    concerns_persistent: string[];
  };
  scanNumber: number;
  scanId:     string | null;
}
```

Response — mirrors `DeltaCommentary` post-sanity-check
(`lib/gemini/delta.ts:289-301`):
```ts
export interface GeminiDeltaCommentaryResponse {
  cover_dek:     string;
  cover_lines:   [DekLine, DekLine, DekLine];
  concern_notes: { [concernKey: string]: string };
  closing_line:  string;
}
```

---

## 2. Shared module layout — `supabase/functions/_shared/`

Six files. Each is plain TypeScript that Deno can import. No bundler step.
The Supabase CLI deploys `_shared/` alongside each function via relative
imports.

### 2.1 `_shared/prompts.ts`

Exports:
- `const VOICE_ANCHOR: string` — duplicated verbatim from `lib/gemini/shared.ts:171`.
- `const EDITORIAL_RULES: string` — duplicated from `lib/gemini/shared.ts:173-189`.
- `const CANONICAL_CATEGORY_LIST: string` — duplicated from `lib/gemini/shared.ts:89-118`.
- `function buildVisionPrompt(req: GeminiVisionRequest): string` — moved from `lib/gemini/vision.ts:62-384`.
- `function buildSkinPrompt(req: GeminiSkinRecsRequest): string` — moved from `lib/gemini/skin.ts:24-151`.
- `function buildBeardPrompt(req: GeminiBeardRecsRequest): string` — moved from `lib/gemini/beard.ts:24-121`.
- `function buildMakeupPrompt(req: GeminiMakeupRecsRequest): string` — moved from `lib/gemini/makeup.ts:24-98`.
- `function buildHairPrompt(req: GeminiHairRecsRequest): string` — moved from `lib/gemini/hair.ts:24-214`.
- `function buildDeltaPrompt(ctx: DeltaScanContext): string` — moved from `lib/gemini/delta.ts:57-191`.

Imported by every function's `index.ts`.

### 2.2 `_shared/helpers.ts`

Exports:
- `function cardinal(n: number): string` — duplicated from `lib/gemini/shared.ts:202-213`.
- `function ordinal(n: number): string` — duplicated from `lib/gemini/shared.ts:215-227`.
- `function fitzpatrickToDepthTier(f: number | null | undefined): DepthTier | null` — duplicated from `lib/gemini/shared.ts:146-154`.
- `const PALETTE_SWATCHES: Record<string, string[]>` — duplicated from `lib/gemini/shared.ts:123-144`.
- `function getPaletteSwatches(...)` — duplicated from `lib/gemini/shared.ts:156-163`.
- `function faceShapeProse(): RegExp` — duplicated from `lib/gemini/shared.ts:232-234`.
- `function stripFaceShapeSentences(text: string): string` — duplicated from `lib/gemini/shared.ts:236-240`.
- `function cleanJsonResponse(raw: string): string` — duplicated from `lib/gemini/shared.ts:383-393`.

> **Verify before implementation:** every helper above is pure JS/TS that
> uses only standard `Math`, `String`, and `RegExp`. No `process.env`. No
> Node-only imports. Should run cleanly in Deno. The Supabase Edge runtime
> is Deno 1.x with the standard library available. Confirm during XIII-a
> implementation by running `supabase functions serve` locally.

Imported by:
- `cardinal`, `ordinal`: `gemini-vision` (observation title/issue label), `gemini-delta-commentary`.
- `fitzpatrickToDepthTier`, `getPaletteSwatches`, `PALETTE_SWATCHES`: `gemini-makeup-recs` (palette validation + fallback).
- `faceShapeProse`, `stripFaceShapeSentences`: `gemini-vision` (observation sanitizer), `gemini-beard-recs` (beard_shape_intro sanitizer).
- `cleanJsonResponse`: every function.

### 2.3 `_shared/gemini-client.ts`

Exports:
- `interface GeminiCallResult { text: string; inputTokens: number; outputTokens: number; finishReason: string | null; safetyRatings: unknown | null }`
- `async function callGemini(model: 'gemini-2.5-pro' | 'gemini-2.5-flash', body: object, maxOutputTokens: number): Promise<GeminiCallResult>` — single non-streaming `:generateContent` call.
- `function shouldRetry(err: unknown, finishReason: string | null): boolean` — moved verbatim from `lib/gemini/shared.ts:40-84`.
- `async function callGeminiWithRetry(...): Promise<GeminiCallResult>` — wraps `callGemini` in the two-attempt loop with `RETRY_BACKOFF_MS=1500` jittered (§9).

Key implementation note for the URL — never log the constructed URL with
the key embedded. Build it at fetch time:
```ts
const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
url.searchParams.set('key', Deno.env.get('GEMINI_API_KEY')!);
const response = await fetch(url, { method: 'POST', headers: {...}, body: JSON.stringify(body) });
```

`Deno.env.get('GEMINI_API_KEY')` reads from the Supabase secrets store
(set via `supabase secrets set` — see §12).

Imported by every function.

### 2.4 `_shared/cost-tracking.ts`

Exports:
- `type CallType = 'vision' | 'skin_recs' | 'beard_recs' | 'makeup_recs' | 'hair_recs' | 'delta_commentary'`
- `type ModelName = 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.5-flash-lite'`
- `const PRICING: Record<ModelName, { input: number; output: number }>` — duplicated from `lib/geminiUsage.ts:6-10`.
- `function computeCost(model, inputTokens, outputTokens): number` — duplicated from `lib/geminiUsage.ts:26-33`.
- `async function logUsage(args: { userId: string; scanId: string | null; callType: CallType; model: ModelName; inputTokens: number; outputTokens: number; durationMs: number; success: boolean; errorMessage?: string }): Promise<void>` — writes one row to `public.gemini_usage` using a service-role Supabase client (see §7 for the client construction and failure semantics).

Imported by every function.

### 2.5 `_shared/quota.ts`

Exports:
- `interface QuotaResult { ok: boolean; remaining: number; resetSeconds: number }`
- `async function checkQuota(args: { userId: string; callType: CallType; ceiling: number }): Promise<QuotaResult>` — counts rows from `gemini_usage` where `user_id = $1 AND call_type = $2 AND created_at > now() - interval '24 hours'`. Returns `{ ok: count < ceiling, remaining: max(0, ceiling - count), resetSeconds: 86400 }`. The reset is conservative — actual sliding-window reset is faster but the simple value suffices for `Retry-After`.

Imported by every function. Each function passes its own `ceiling` constant
defined inline (e.g., `const QUOTA_CEILING = 10` at the top of `gemini-vision/index.ts`).

### 2.6 `_shared/types.ts`

Exports the request/response types shown in §1 plus the foundation types
they depend on: `SkinConcernObservation`, `RoutineStep`, `BeardStyle`,
`MakeupPalette`, `MakeupSwatch`, `HairProfile`, `HairStyle`, `HairRoutineStep`,
`HairProductPick`, `Scan` (slimmed), `DepthTier`, `Undertone`, `DekLine`,
`DeltaScanContext`.

These types are duplicated from `types/index.ts` (currently the
client-side source). Pure type definitions — no runtime cost to duplicate.

> **Verify before implementation:** make sure the duplicated types match
> the client-side ones exactly. A mismatch at the response boundary causes
> silent data loss. One way: a CI step that diffs `_shared/types.ts`
> against `types/index.ts` for the affected types. Out of scope for v1; a
> manual review checkbox in the §15 test plan covers it.

### 2.7 `_shared/normalize.ts`

Exports:
- `function normalizeConcern(input: string): CanonicalConcern | null` — duplicated from `constants/concerns.ts:225` (along with `CANONICAL_CONCERNS` at `:18-55`, `CanonicalConcern` type at `:57`, `CANONICAL_SET` at `:59`, and the `CONCERN_ALIASES` map at `:66-217` — the helper depends on all four).

Imported by `gemini-skin-recs` (concern normalization after parse —
`lib/gemini/skin.ts:233-246`).

---

## 3. Per-function request/response contracts

Already laid out in §1. The contracts above are the source of truth for
the client refactor. Anywhere they differ from today's client-internal
shapes is intentional and called out:

1. **Vision request:** `imageBase64` is the raw base64 string (no
   `data:image/jpeg;base64,` prefix). Server constructs the Gemini
   `inline_data` envelope. Today the client builds the envelope inline at
   `lib/gemini/vision.ts:421-431`.
2. **All requests:** `scanId` is non-optional `string | null` (not
   `string | undefined`). Simplifies parsing on Deno.
3. **All responses:** No `_meta` field for tokens. The client doesn't read
   those; the server logs them to `gemini_usage` directly.
4. **Vision response:** observation is **post-sanitized server-side**
   (mirrors `sanitizeObservation` at `lib/gemini/vision.ts:536-552`). The
   client receives a clean payload and no longer runs the sanitizer.
5. **Skin response:** `target_concern` on every step is **already
   normalized** server-side using the moved `normalizeConcern`. Client
   does not re-normalize. `routine_note` is **never empty** — server
   applies the fallback derivation from `lib/gemini/skin.ts:250-256`.
6. **Beard response:** `beard_shape_intro` is null if invalid OR leaking
   face-shape (server runs the check from `lib/gemini/beard.ts:200-207`).
7. **Makeup response:** Palette swatches **already validated** server-side
   with static fallback applied (mirrors `lib/gemini/makeup.ts:172-212`).
   `palette.depth_tier` is overwritten server-side from the user's
   `fitzpatrick_scale`.
8. **Delta response:** Schema sanity checks (`cover_lines.length === 3`,
   etc.) run server-side; if they fail, the server returns 502 rather
   than a partial response. Matches today's throw at `lib/gemini/delta.ts:290-301`.

---

## 4. Client-side changes

The client retains all higher-level orchestration. Each function in
`lib/gemini/<call>.ts` becomes a thin wrapper around
`supabase.functions.invoke()`.

### 4.1 `lib/gemini/vision.ts`

- **Delete (~lines 416-450, 462-475):** the `fetch(ENDPOINT, ...)` envelope construction, the `json?.candidates?.[0]?.content?.parts?.[0]?.text` extraction, `cleanJsonResponse`, `JSON.parse(cleaned)`, the backward-compat `skin_concerns_detailed → skin_concerns` derivation, and the sanitizer call. All move server-side.
- **Delete (~lines 480-489, 521-530):** the `logUsage` calls. Cost tracking now happens server-side.
- **Delete (~lines 409-508):** the retry loop and `shouldRetry` check. Both move server-side.
- **Delete (~lines 62-384):** `buildVisionPrompt`. Moves to `_shared/prompts.ts` server-side.
- **Delete (~lines 536-552):** `sanitizeObservation`. Moves to `_shared/helpers.ts` server-side, called from `gemini-vision/index.ts`.
- **Keep:** the exported types (`GeminiAnalysis`, `ObservationOutput`) — re-exported by the new wrapper for backward compat.
- **New body** (~50 lines): build the `GeminiVisionRequest`, `await supabase.functions.invoke('gemini-vision', { body: req })`, validate the response shape minimally, return as `GeminiAnalysis`. The kill switch from §10 wraps this.

### 4.2 `lib/gemini/skin.ts`, `beard.ts`, `makeup.ts`, `hair.ts`, `delta.ts`

Same pattern as vision:
- Delete prompt builders (move to `_shared/prompts.ts`).
- Delete `streamGeminiSSE` calls and their `onPartial` plumbing.
- Delete retry loops (`for (let attempt = 1; attempt <= 2; attempt++)` at
  `lib/gemini/skin.ts:176`, `beard.ts:145`, `makeup.ts:121`, `hair.ts:242`,
  `delta.ts:248`).
- Delete `shouldRetry` import and check.
- Delete `logUsage` calls.
- Delete post-parse normalization (concern, palette, schema sanity) — moved server-side.
- Keep the public function signatures so call sites in `services/scanService.ts`
  don't change.
- Drop the `onPartial` argument from each function signature (it's a no-op
  in production today per V1; removing the parameter is the cleanest
  change). See §6 for the cascade.

### 4.3 `services/scanService.ts` — what stays vs. changes

Call sites that *do not change* in shape:
- `runScanPhase1` vision call at `:310` — same `analyseWithGemini(...)` signature, same args. The transport changes inside.
- `runScanPhase2` skin/beard/makeup parallel fan-out at `:707`, `:723`, `:740` — same signatures. The `{ scanId }` options object stays.
- `refreshRecommendations` skin/beard/makeup at `:1105`, `:1115`, `:1126`.
- `regenerateSkinRecs` / `regenerateBeardRecs` / `regenerateMakeupRecs` at `:1245`, `:1261`, `:1270`.
- `generateAndSaveHairProfile` hair call at `:1470`.
- `generateAndStoreDeltaCommentary` delta call at `:501`.

What changes is what each underlying function does with its arguments. The
fact that `services/scanService.ts` doesn't need to know whether the call
goes direct or via an edge function is by design — the kill switch (§10)
lives inside the wrapper, not at the call site.

### 4.4 `hooks/useScan.tsx`

No changes. The hook only orchestrates state transitions and calls into
`scanService`. It does not pass `onPartial` (verified via grep — only the
five gemini modules reference `onPartial`, and none of the call sites in
`scanService.ts` set it). V1's finding that `onPartial` never fires in
production is consistent with this: there is no UI consumer.

> **VERIFY during XIII-a implementation, before any wrapper drops its
> `onPartial` parameter:** run `grep -n "onPartial" hooks/useScan.tsx`.
>
> Expected: **zero matches**. (Confirmed at design time on 2026-05-11 — no
> matches at any line.)
>
> If matches exist: the prior grep was stale. The matches must be reviewed
> and any `onPartial` plumbing removed from `useScan.tsx` *before* the
> wrappers in `lib/gemini/*.ts` drop the parameter — otherwise the hook
> will pass an argument the wrapper no longer accepts (TS will catch it
> but only after the wrapper rewrite; better to clear the hook first).

### 4.5 `lib/geminiUsage.ts`

- **Delete (~all of it):** `logUsage`, `formatScanTotal`, `PRICING`,
  `computeCost`, `UsageRecord`, `CallType`, `ModelName`. None of these are
  called from the client after this phase.
- The only remaining usage outside `lib/gemini/*` (which is also being
  refactored) is `import type { ModelName } from '../geminiUsage'` at
  `lib/gemini/shared.ts:7`. That import goes away with the rest of
  `shared.ts`.
- **Verify before deletion:** `grep -rn logUsage lib/ services/ hooks/ app/`
  to confirm no straggler imports. (At time of writing, only `lib/gemini/*`
  imports it.)

### 4.6 `app/gemini-test.tsx`

Per the locked decisions: **deleted in this phase**. No need to migrate
it. One fewer surface that bundles a Gemini key, one less file in the
production APK.

---

## 5. `lib/gemini/shared.ts` disposition — export by export

| Export | Disposition | Reasoning |
|---|---|---|
| `API_KEY` (`:10`) | **DELETE** | The whole point of the migration. No client-side Gemini key after XIII-b. |
| `MODEL_VISION`, `MODEL_TEXT` (`:12-13`) | **DELETE** | Constants used only in old Gemini calls. Server-side functions hard-code their own models. |
| `ENDPOINT` / `ENDPOINT_TEXT` / `ENDPOINT_TEXT_STREAM` (`:15-17`) | **DELETE** | Client no longer builds Gemini URLs. |
| `RETRY_BACKOFF_MS` (`:24`) | **DELETE** | Retry moves server-side; the client wrapper does not retry (Edge Function already retries once internally). |
| `shouldRetry` (`:40-84`) | **MOVE** to `_shared/gemini-client.ts`. Delete the client-side copy. |
| `CANONICAL_CATEGORY_LIST` (`:89-118`) | **MOVE** to `_shared/prompts.ts`. Used only in prompt construction. |
| `PALETTE_SWATCHES` (`:123-144`) | **MOVE** to `_shared/helpers.ts`. Static lookup used only by `gemini-makeup-recs` fallback. |
| `fitzpatrickToDepthTier` (`:146-154`) | **MOVE + KEEP CLIENT COPY**. Server uses its own copy in `_shared/helpers.ts`. Client retains the export because `services/scanService.ts:628`, `:1095`, `:749`, `:1134`, `:1278` call it directly. Cleanest path: leave a thin file like `lib/utils/fitzpatrick.ts` exporting this single function, update those callers, then drop `lib/gemini/shared.ts` entirely. |
| `getPaletteSwatches` (`:156-163`) | **MOVE** to `_shared/helpers.ts`. No client-side caller after `lib/gemini/makeup.ts` is rewritten. |
| `Undertone`, `DepthTier` type re-exports (`:166`) | **DELETE re-export**, callers import from `types/` directly. |
| `VOICE_ANCHOR` (`:171`) | **MOVE** to `_shared/prompts.ts`. |
| `EDITORIAL_RULES` (`:173-189`) | **MOVE** to `_shared/prompts.ts`. |
| `cardinal` (`:202-213`) | **MOVE + KEEP CLIENT COPY**. Server uses its copy. Client retains because `lib/profileData.ts:7`, `app/(tabs)/routine.tsx:30`, `components/routine/RescanBanner.tsx:12` use it for non-Gemini UI (issue labels, scan-number prose). Same disposition as `fitzpatrickToDepthTier` — move to a neutral `lib/utils/numbers.ts` (or similar) and update imports. |
| `ordinal` (`:215-227`) | **MOVE** to `_shared/helpers.ts`. No client-side caller outside Gemini today (vision uses it for the observation title — that call moves server-side). |
| `faceShapeProse` (`:232-234`) | **MOVE** to `_shared/helpers.ts`. Only used by the server-side sanitizers. |
| `stripFaceShapeSentences` (`:236-240`) | **MOVE** to `_shared/helpers.ts`. Same. |
| `StreamResult` type (`:246-252`) | **DELETE** | Streaming gone. |
| `streamGeminiSSE` (`:257-347`) | **DELETE** | V1: never works in prod RN anyway. Server uses plain `fetch` + `response.json()`. |
| `tryParsePartialJson` (`:351-380`) | **DELETE** | Was only used by partial-streaming `onPartial` paths. With streaming gone, the server reads the full response and uses `cleanJsonResponse` only. |
| `cleanJsonResponse` (`:383-393`) | **MOVE** to `_shared/helpers.ts`. |

End state: `lib/gemini/shared.ts` is **deleted**. Its only client-side
survivors (`cardinal`, `fitzpatrickToDepthTier`) live in small
neutral modules outside `lib/gemini/`.

---

## 6. Streaming removal — concrete file list

V1 says streaming never fires in prod, so deleting it is a no-op for the
user. Files that need an `onPartial` reference removed:

| File | Lines | What goes |
|---|---|---|
| `lib/gemini/shared.ts` | 246-380 | `StreamResult`, `streamGeminiSSE`, `tryParsePartialJson` |
| `lib/gemini/skin.ts` | 16-18, 160-208 | `streamGeminiSSE`, `tryParsePartialJson` imports; `onPartial` option + callback wiring |
| `lib/gemini/beard.ts` | 15-17, 129-177 | Same shape |
| `lib/gemini/makeup.ts` | 14-17, 105-151 | Same shape |
| `lib/gemini/hair.ts` | 16-19, 226-272 | Same shape |
| `lib/gemini/delta.ts` | 19-21, 255-271 | Same shape (already had no `onPartial`) |

Plus the new client wrappers don't accept an `onPartial` argument.
`services/scanService.ts` never passes one today (verified via grep), so
no call-site cleanup needed there.

The observation/recommendations UI screens never relied on partial state
in production — they receive the final scan row from Supabase after
`runScanPhase2` settles (`hooks/useScan.tsx:226-229`). Nothing to remove
on the UI side.

---

## 7. Cost tracking redesign

### 7.1 Server-side write

Each function constructs a service-role Supabase client at module top:
```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **auto-populated** in
the Edge Function environment — no `supabase secrets set` needed for
those, only for `GEMINI_API_KEY`. (Confirm during XIII-a; Supabase docs
state these env vars are always available, but verify via a `Deno.env.get`
log on first deploy.)

Service role bypasses RLS — the existing `gemini_usage_insert_own` policy
is now irrelevant for production writes. We do NOT drop the policy in
this phase (no harm in leaving it; if XIII rolls back we don't want to
re-add it). A separate cleanup phase can drop it later.

### 7.2 Fire-and-forget cost tracking

Cost tracking inserts have a real latency floor — empirically measured
at ~200ms warm, up to 1.2s cold (Gate 6 result, 2026-05-11, Supabase
Sydney → Postgres via PostgREST). Awaiting the insert before writing
the HTTP response would add this to every scan's user-perceived latency.

Instead, fire-and-forget using Supabase's `EdgeRuntime.waitUntil`
primitive. The cost-tracking insert continues in the background after
the function's HTTP response is sent. The function instance is held
open until the promise resolves or the runtime times out.

Pattern:

```ts
const insertPromise = admin.from('gemini_usage').insert({
  user_id, scan_id, call_type, model,
  input_tokens, output_tokens, cost_usd, duration_ms,
  success, error_message: error_message ?? null,
});
EdgeRuntime.waitUntil(insertPromise.then(({ error }) => {
  if (error) console.error('[gemini-usage] insert failed (non-fatal):', error.message);
}));
// Do NOT await. Return the response immediately.
```

Trade-off accepted: a fraction of telemetry rows may be lost if the
function instance dies before `waitUntil` completes. Cost tracking is
observability, not correctness — we accept this. Estimated row-loss
rate: <0.1% under normal Supabase availability.

If at some future point we need exact cost telemetry (e.g., billing
reconciliation), revisit by routing telemetry through a synchronous
write path with its own latency budget, or via a Postgres trigger from
a faster-to-insert table.

### 7.3 Client-side deletions

- `lib/geminiUsage.ts`: delete the entire file (see §4.5).
- All `import { logUsage } from '../geminiUsage'` references in
  `lib/gemini/*.ts`: deleted as part of the rewrites in §4.

Verification step in §15: after XIII-b ships, grep `client` codebase for
any insert/update against `gemini_usage`. Expected: zero matches. The
table should be exclusively a server-write/operator-read surface.

---

## 8. Rate limiting design

### 8.1 Query

Each function, immediately after JWT validation and request parsing:
```ts
const { count, error } = await admin
  .from('gemini_usage')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId)
  .eq('call_type', CALL_TYPE)
  .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

if (error) {
  // Quota check failure means we can't verify the rate limit. Fail closed.
  // An attacker who can make gemini_usage queries fail (table DoS,
  // connection exhaustion, Postgres outage) must not gain unbounded
  // Gemini calls — that is the entire point of having a quota. We return
  // 503 with Retry-After so the client retries shortly, and the app
  // surfaces "scan temporarily unavailable."
  console.error('[quota] check failed, failing closed:', error.message);
  return new Response(
    JSON.stringify({ error: 'quota_check_failed' }),
    { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } },
  );
}

if ((count ?? 0) >= QUOTA_CEILING) {
  return new Response(
    JSON.stringify({ error: 'quota_exceeded' }),
    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '86400' } },
  );
}
```

**Fail-closed rationale.** A transient Postgres hiccup briefly bricks
scans for affected users — annoying, but recoverable on the next retry
(60s `Retry-After`). The alternative (fail-open) lets a `gemini_usage`
outage become an uncapped Gemini bill. Cost protection is the load-bearing
property of the quota layer; availability is not. A 503 here is a
**P1 alert** (see §13) because it means the cost guardrail is degraded —
not because users are blocked from scanning.

The `idx_gemini_usage_user_created` index
(`supabase/migrations/phase_00_baseline_telemetry.sql:103-104`) covers
this query — `(user_id, created_at desc)` is the exact shape it needs.
`call_type` is filtered in-memory after the index narrows by user; if
this proves slow at scale, add `(user_id, call_type, created_at)` later.
Out of scope for v1.

### 8.2 Ceilings — proposed defaults

Each function defines its own `const QUOTA_CEILING` at the top of `index.ts`.
No shared config table; if a ceiling needs to change, we redeploy that
function. Simpler than a remote config for v1.

| Function | Ceiling | Reasoning |
|---|---|---|
| `gemini-vision` | **10** | A scan is rare (intended ~once per 4 weeks). 10 attempts/day covers heavy retry sessions during onboarding without leaving Lumé's bill open to abuse. Vision is also the most expensive call (gemini-2.5-pro: $1.25/M input + $10/M output). |
| `gemini-skin-recs` | **20** | One per scan + per-section regen retries (each user-tap on "retry skin" is one call) + `refreshRecommendations` after edits. 20 absorbs a noisy retry day. |
| `gemini-beard-recs` | **20** | Same shape as skin. |
| `gemini-makeup-recs` | **10** | Regenerates rarely — only when undertone/depth changes (`shouldRegenerateMakeup` at `lib/makeupRecs.ts`). Most rescans reuse stored recs. 10 is generous. |
| `gemini-hair-recs` | **10** | Triggered only when the hair_profile changes (during hair-setup). Users rarely re-edit their hair profile. 10 covers onboarding stutter. |
| `gemini-delta-commentary` | **10** | One per rescan only. 10 is way more than legitimate use, but cheap insurance. |

Total per-user-per-day worst case: **80 calls** if every ceiling is
saturated. Well under any reasonable definition of legitimate use; well
under the implicit Google AI Studio per-key per-day quota we'll set up
manually (§8.3).

The default ceiling of 50 cited in locked decisions is the **fallback** —
if a future function is added without a per-function override, it gets 50.
None of the six current functions defaults; each has its own number above.

### 8.3 Google AI Studio per-key quota (manual setup)

Out of code scope but required as a belt-and-suspenders measure. Steps to
document in the deployment runbook (§14):
1. Sign into `aistudio.google.com` with the project owner's account.
2. Create a new API key. Restrict it to `generativelanguage.googleapis.com`.
3. Under "Quotas" for the project, lower the per-day generation quota to
   a value that covers projected legitimate use (e.g., 10,000 calls/day
   total for the project — 80 calls × 100 users budget) but caps a
   runaway scenario.
4. Save the key value. Set it as `GEMINI_API_KEY` via `supabase secrets set`.

The Google-side cap is the actual budget guardrail. The per-function
Supabase ceiling is the per-user fairness layer. They serve different
purposes; both are needed.

---

## 9. Retry logic placement

Today every call has a private retry loop wrapping its Gemini fetch
(`vision.ts:410-508`, `skin.ts:176-286`, etc.). In the new design:

- `_shared/gemini-client.ts` exports `callGeminiWithRetry` which is the
  single source of retry logic. Each function calls it once.
- Two attempts max, identical to today's shape.
- Backoff between attempts: `1500ms ± 250ms jitter` (jitter avoids
  thundering-herd when Gemini is rate-limiting many users at once).
- `shouldRetry` controls whether attempt 2 runs.
- If both attempts fail: function returns `502 Bad Gateway` with body
  `{ error: <msg>, finish_reason: <lastFinishReason | null> }`.

Sketch:
```ts
export async function callGeminiWithRetry(
  model: ModelName,
  body:  object,
  maxOutputTokens: number,
): Promise<GeminiCallResult> {
  let lastErr: unknown = null;
  let lastFinishReason: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      const backoff = 1500 + Math.floor(Math.random() * 500) - 250;
      await new Promise(r => setTimeout(r, backoff));
    }
    try {
      return await callGemini(model, body, maxOutputTokens);
    } catch (err) {
      lastErr = err;
      lastFinishReason = (err as { finishReason?: string }).finishReason ?? null;
      if (attempt === 1 && !shouldRetry(err, lastFinishReason)) break;
    }
  }
  throw Object.assign(lastErr as Error, { finishReason: lastFinishReason });
}
```

Client does not retry on top of this. A 502 from the function bubbles up
to `useScan` and shows the existing "scan failed" UI. That matches
today's behaviour: today's client throws after attempt-2-failed; tomorrow's
client throws after edge-function-502.

---

## 10. Kill switch design

The locked decisions originally specified option A (EAS env var set at
build time). On re-examination this is not actually a kill switch: a
build-time constant requires a release cycle to toggle. By the time a new
APK is built, submitted, and rolled out, an emergency is over. Replaced
here with a **remote-config table** read by the client on launch and
refreshed every 5 minutes.

### 10.1 Schema — new migration `supabase/migrations/phase_13_app_config.sql`

```sql
create table if not exists public.app_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id) on delete set null
);

comment on table public.app_config is
  'Server-controlled feature flags and operational toggles. Client reads
   these on app launch and refreshes every 5 minutes. Operator-writable
   only.';

alter table public.app_config enable row level security;

drop policy if exists app_config_select_all on public.app_config;
create policy app_config_select_all
  on public.app_config for select
  using (auth.role() = 'authenticated');

-- No INSERT/UPDATE/DELETE policies. Only service role writes (operator
-- via Supabase Studio).

create index if not exists idx_app_config_updated
  on public.app_config (updated_at desc);

-- Seed the kill switch rows: master + one per call.
-- All default to true (fail-open at seed time). Operator flips
-- individual rows to false when they want to disable a specific
-- function; flips the master to false for a billing-runaway emergency.
insert into public.app_config (key, value)
values ('gemini_scans_enabled', 'true'::jsonb)
on conflict (key) do nothing;

insert into public.app_config (key, value)
values ('vision_enabled', 'true'::jsonb)
on conflict (key) do nothing;

insert into public.app_config (key, value)
values ('skin_recs_enabled', 'true'::jsonb)
on conflict (key) do nothing;

insert into public.app_config (key, value)
values ('beard_recs_enabled', 'true'::jsonb)
on conflict (key) do nothing;

insert into public.app_config (key, value)
values ('makeup_recs_enabled', 'true'::jsonb)
on conflict (key) do nothing;

insert into public.app_config (key, value)
values ('hair_recs_enabled', 'true'::jsonb)
on conflict (key) do nothing;

insert into public.app_config (key, value)
values ('delta_commentary_enabled', 'true'::jsonb)
on conflict (key) do nothing;
```

The migration follows the Phase 12+ pattern in `supabase/migrations/` —
single file, idempotent (`if not exists`, `on conflict do nothing`,
`drop policy if exists`). It is run during XIII-a after the function
deploy but before client wrapper rewrite (so the table exists by the time
the new client tries to read it).

### 10.2 Client module — new `lib/appConfig.ts`

```ts
// lib/appConfig.ts
//
// Remote feature flags read from public.app_config. Cached in memory
// with a 5-minute TTL. Cache also invalidates on app foreground.
//
// FAIL-OPEN BY DESIGN: if the Supabase read fails (network blip, DB
// outage), assume features are enabled. The kill switch's purpose is
// to disable scans when WE choose to — not when an unrelated network
// failure happens to coincide. Failing closed on a network blip would
// brick scans for users on flaky connections every time the cache TTL
// expired. Accept the small window of "still scanning during an
// emergency on a stale-cached client" as the price of availability.

import { supabase } from './supabase';

export interface AppConfig {
  gemini_scans_enabled:     boolean;   // master kill switch
  vision_enabled:           boolean;
  skin_recs_enabled:        boolean;
  beard_recs_enabled:       boolean;
  makeup_recs_enabled:      boolean;
  hair_recs_enabled:        boolean;
  delta_commentary_enabled: boolean;
}

const DEFAULTS: AppConfig = {
  gemini_scans_enabled:     true,
  vision_enabled:           true,
  skin_recs_enabled:        true,
  beard_recs_enabled:       true,
  makeup_recs_enabled:      true,
  hair_recs_enabled:        true,
  delta_commentary_enabled: true,
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { config: AppConfig; fetchedAt: number } | null = null;
let inflight: Promise<AppConfig> | null = null;

export async function fetchAppConfig(): Promise<AppConfig> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.config;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('key, value');
      if (error) throw error;

      const next: AppConfig = { ...DEFAULTS };
      for (const row of data ?? []) {
        if (typeof row.value !== 'boolean') continue;
        switch (row.key) {
          case 'gemini_scans_enabled':     next.gemini_scans_enabled = row.value;     break;
          case 'vision_enabled':           next.vision_enabled = row.value;           break;
          case 'skin_recs_enabled':        next.skin_recs_enabled = row.value;        break;
          case 'beard_recs_enabled':       next.beard_recs_enabled = row.value;       break;
          case 'makeup_recs_enabled':      next.makeup_recs_enabled = row.value;      break;
          case 'hair_recs_enabled':        next.hair_recs_enabled = row.value;        break;
          case 'delta_commentary_enabled': next.delta_commentary_enabled = row.value; break;
        }
      }
      cache = { config: next, fetchedAt: Date.now() };
      return next;
    } catch (err) {
      console.warn('[appConfig] fetch failed, using defaults:', err);
      // Default-on; do NOT cache the failure — retry on next call.
      return DEFAULTS;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function invalidateAppConfigCache(): void {
  cache = null;
}

// Master-only check. Kept as an alias of the top-level flag for any
// future caller that wants only the master state — e.g. an admin
// surface that wants to display "scans globally disabled" without
// caring which specific call is in play.
export async function isGeminiEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled;
}

// Per-call helpers — each returns true if AND ONLY IF both the master
// flag (gemini_scans_enabled) AND the call-specific flag are true.
// The master short-circuits: flipping master to false disables every
// call regardless of per-call state.

export async function isVisionEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.vision_enabled;
}

export async function isSkinRecsEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.skin_recs_enabled;
}

export async function isBeardRecsEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.beard_recs_enabled;
}

export async function isMakeupRecsEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.makeup_recs_enabled;
}

export async function isHairRecsEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.hair_recs_enabled;
}

export async function isDeltaCommentaryEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.delta_commentary_enabled;
}
```

**Cache invalidation on foreground.** There is **no existing `AppState`
listener** in the codebase (verified at design time: `grep -rn AppState`
returns zero matches across `hooks/`, `services/`, `lib/`, `app/`).
Adding one is part of XIII-a. The cleanest spot is a root-level
`useEffect` in `app/_layout.tsx` (Expo Router root) that registers
`AppState.addEventListener('change', listener)` and calls
`invalidateAppConfigCache()` whenever `nextState === 'active'`. The
listener is the only `AppState` consumer in the codebase, so it owns its
own subscription teardown via the returned `Subscription.remove()`.

### 10.3 Wiring into the Gemini wrappers

Each thin wrapper in `lib/gemini/*.ts` calls **its specific helper** at
entry — not the generic master check. The per-call helper internally
short-circuits on the master flag (see §10.2), so the wrapper does not
need to compose them itself.

```ts
// pattern for lib/gemini/vision.ts:
import { isVisionEnabled } from '../appConfig';

if (!(await isVisionEnabled())) {
  throw new Error('Scan is temporarily unavailable. Please try again in a bit.');
}
```

Wrapper → helper mapping:

| Wrapper file | Helper called at entry |
|---|---|
| `lib/gemini/vision.ts` | `isVisionEnabled()` |
| `lib/gemini/skin.ts` | `isSkinRecsEnabled()` |
| `lib/gemini/beard.ts` | `isBeardRecsEnabled()` |
| `lib/gemini/makeup.ts` | `isMakeupRecsEnabled()` |
| `lib/gemini/hair.ts` | `isHairRecsEnabled()` |
| `lib/gemini/delta.ts` | `isDeltaCommentaryEnabled()` |

The 5-minute cache means this check is essentially free after the first
call per window. The first call per app session pays a single Supabase
round-trip (~50–100ms) — well under noise on a 15s scan. All seven flags
arrive in the same `app_config` SELECT, so per-call granularity does not
add any extra round-trips.

The thrown error string is the user-facing copy; `useScan.fail(msg)`
surfaces it via the existing error path at `hooks/useScan.tsx:355-358`.

The generic `isGeminiEnabled()` is retained but not called by any
wrapper in this phase. It is reserved for any future caller that needs
only the master state.

### 10.4 Operator runbook

Two tiers of kill switch. Use the right tier for the situation.

**Tier 1 — master kill (`gemini_scans_enabled`).** For
billing-runaway emergencies. Disables every Gemini call in the app at
once.

1. Open Supabase Studio → Table Editor → `app_config`.
2. Edit the row where `key = 'gemini_scans_enabled'`.
3. Set `value` to `false`. Save.
4. Within ≤5 minutes every running client sees the change (cache TTL).
   New app launches and any client that goes to foreground see it
   immediately. All six Gemini wrappers refuse.

**Tier 2 — per-call kill (`<call>_enabled`).** Surgical tool for
"this one function is misbehaving" — e.g. `gemini-skin-recs` is
returning garbage and you want skin to stop while vision, makeup,
delta, etc. keep working.

1. Open Supabase Studio → Table Editor → `app_config`.
2. Edit the row for the specific call: one of
   `vision_enabled`, `skin_recs_enabled`, `beard_recs_enabled`,
   `makeup_recs_enabled`, `hair_recs_enabled`, `delta_commentary_enabled`.
3. Set `value` to `false`. Save.
4. Within ≤5 minutes every running client refuses **only that one call**.
   The other five Gemini wrappers continue to work.

To re-enable either tier:
- Set the relevant row's `value` back to `true`. Save.

The master switch short-circuits the per-call switches in code (§10.2),
so flipping the master to false disables everything regardless of
per-call state. Re-enabling per-call rows while the master is false has
no effect until the master is flipped back to true.

No code change, no deployment, no APK rebuild for either tier. The
operator is the person with Supabase Studio access — currently the
project owner.

### 10.5 Threat model

| Scenario | Behaviour |
|---|---|
| Operator sets `gemini_scans_enabled=false` to throttle a runaway bill | Within 5 minutes, all clients refuse to invoke any Gemini wrapper. New launches refuse immediately. |
| Operator wants to disable a single misbehaving function without bricking the entire scan flow | Set `<function>_enabled` to `false` (one of the six per-call rows). Other functions continue to work. Within 5 minutes, all clients refuse only that one call. |
| Attacker tries to *enable* features by writing to `app_config` | RLS denies all client INSERT/UPDATE/DELETE (only SELECT policy exists). Only service role writes. |
| Network blip prevents the client from reading `app_config` | Wrapper proceeds with `DEFAULTS` (all seven flags true). User can still scan. Trade-off documented in `lib/appConfig.ts` header. |
| Attacker tries to *disable* features for other users | Same as above — RLS blocks. |
| Two operators flip the value concurrently | Last-write-wins; `updated_at` records who/when. Acceptable. |

### 10.6 What this replaces

The original §10 design — `EXPO_PUBLIC_GEMINI_EDGE_ENABLED` env var
threaded through EAS — is **removed entirely**. No env var is added; no
`eas.json` change is needed for this phase. References to that env var
elsewhere in the doc (Appendix A, §15.6) have been updated to match.

---

## 11. Deployment commands (XIII-a, vision only)

The exact CLI sequence. All commands run from `C:\Projects\lume_v1`.
Windows shell — the user's working dir per CLAUDE.md.

```bash
# Step 1 — install Supabase CLI (if not installed)
# Windows: scoop install supabase   OR   download from github.com/supabase/cli/releases
supabase --version
# Expected output: e.g. "1.150.0" — confirms the CLI is on PATH.

# Step 2 — log in (one-time per machine)
supabase login
# Opens a browser; signs in with the project owner's Supabase account.
# Expected: "Logged in to Supabase CLI." on success.

# Step 3 — initialize Supabase config (first-time only)
supabase init
# Creates supabase/config.toml if missing. Idempotent — safe if rerun.
# Expected output: "Generated supabase/config.toml" or "supabase/config.toml already exists".

# Step 4 — link to the remote project
supabase link --project-ref <project-ref>
# <project-ref> is the alphanumeric ID from the Supabase Dashboard URL
# (e.g. dashboard.supabase.com/project/xyzabc123 → "xyzabc123").
# Expected output: "Linked to project <project-ref>".
# Prompts for the database password — paste from the dashboard's Settings.

# Step 5 — scaffold the function
supabase functions new gemini-vision
# Creates supabase/functions/gemini-vision/index.ts with a hello-world stub.
# Expected output: "Created new Function at supabase/functions/gemini-vision".

# Step 6 — edit files locally
# Replace the stub with the implementation per §1.1.
# Create supabase/functions/_shared/{prompts,helpers,gemini-client,cost-tracking,quota,types,normalize}.ts.

# Step 7 — set the Gemini API key as a Supabase secret
supabase secrets set GEMINI_API_KEY=<value-from-google-ai-studio>
# Expected output: "Updated secrets" with the key name listed.
# This key is only stored in Supabase. It is NOT in .env. It is NOT in git.

# Step 8 — deploy
supabase functions deploy gemini-vision
# Expected output: "Deployed Functions on project <ref>: gemini-vision"
# plus a URL like https://<ref>.supabase.co/functions/v1/gemini-vision.

# Step 9 — verify with curl
JWT='<a-test-user-supabase-anon-jwt>'
curl -X POST "https://<ref>.supabase.co/functions/v1/gemini-vision" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"imageBase64":"<small-test-image-base64>","city":"Mumbai","gender":"woman","careCategories":["skin"],"ageRange":"25-34","previousScanSummary":null,"scanId":"00000000-0000-0000-0000-000000000000","scanNumber":1}'
# Expected: 200 OK with the GeminiVisionResponse body. ~15-20s latency.

# Step 10 — check the cost-tracking row
# In Supabase Dashboard → Table Editor → gemini_usage:
# Verify a row landed with call_type='vision', success=true, the input/output
# token counts populated, and cost_usd matching the price formula.

# Step 11 — check the function logs
supabase functions logs gemini-vision
# OR via Dashboard → Edge Functions → gemini-vision → Logs tab.
# Expected: structured JSON lines with scan_id, latency, success, tokens.
```

Step 9's `<small-test-image-base64>` can be any base64-encoded 512×512
JPEG. Generate with `convert image.jpg image.jpg -resize 512x512` then
`base64 image.jpg`. Keep one in a `.gitignore`'d scratch dir for retesting.

---

## 12. Secret management

- **Storage:** `GEMINI_API_KEY` lives in Supabase's secrets store, set via
  `supabase secrets set GEMINI_API_KEY=<value>`. It is encrypted at rest
  and exposed at function invocation time as `Deno.env.get('GEMINI_API_KEY')`.
- **Access:** server-side only. Never available to the client (no
  `EXPO_PUBLIC_` prefix possible because the secret never appears in
  `.env` to begin with).
- **Rotation:**
  ```bash
  supabase secrets set GEMINI_API_KEY=<new-value>
  ```
  Takes effect immediately; **no redeployment required**. The function
  reads the env var fresh on each invocation (Supabase guarantees env
  hot-reload on secret update — confirm during XIII-a verification).
- **Revoke + rotate the old key:** at Google AI Studio's "API keys" page,
  click "Delete" on the old key. Any leftover production APKs that hold
  the old key will start failing — intentional (per the locked decisions).
- **`.env` discipline:** the new key NEVER goes in `.env`. `.env` is
  exclusively for `EXPO_PUBLIC_*` keys bundled into the client. If anyone
  adds `GEMINI_API_KEY=...` to `.env`, the next prod build is back to
  Square One.
- **Listing what's set** (no values shown, only key names):
  ```bash
  supabase secrets list
  # Expected output:
  # NAME              DIGEST
  # GEMINI_API_KEY    <sha256-truncated>
  ```
  The digest is a fingerprint, not the value. Use this to confirm a
  secret exists without exposing it.

---

## 13. Observability

### 13.1 Function logs

Each function logs structured JSON via `console.log(JSON.stringify({...}))`
at three points:
1. **On request entry:** `{ event: 'request', scan_id, user_id, call_type }`.
2. **On Gemini call complete:** `{ event: 'gemini_call', scan_id, attempt, latency_ms, input_tokens, output_tokens, finish_reason, success }`.
3. **On response:** `{ event: 'response', scan_id, status, latency_ms, retried }`.

Access:
- Supabase Dashboard → Edge Functions → `<name>` → Logs tab. Filterable
  by timestamp; full-text search over the JSON.
- CLI: `supabase functions logs <name>` streams recent logs.

### 13.2 What NOT to log

- **The full Gemini response.** Includes user-derived editorial text that
  can be PII-adjacent. Log only token counts + finish_reason.
- **The full prompt.** Large (~5–10 KB), repetitive, and contains
  user-provided data (`previousScanSummary`, `city`, `analysis` JSON).
- **The image base64.** Never log it. Never echo it.
- **The Gemini API key.** Build the URL via `URL.searchParams.set` — do
  not interpolate into a logged string. (Even if `console.log(url)` was
  added accidentally, it would show the secret value to anyone with log
  access.)

### 13.3 Cost dashboard (future)

Out of scope for v1. Pointer: cost-tracking writes are already
queryable via Postgres on `gemini_usage`. A future operator dashboard can
sum `cost_usd` group by user/day/call_type. The data is now
service-role-only (RLS denies SELECT to clients), so a dashboard built on
top would use a service-role key or run via a `supabase functions` admin
endpoint.

### 13.4 v1 vs scale

The pattern in §13.1–§13.3 (`console.log` JSON → Supabase function logs →
Dashboard query) is the v1 minimum. It is enough to debug an incident or
spot-check a deploy, but at any meaningful scale several limitations bite:

- Supabase log retention is bounded (a few days on the current plan).
  Anything older is gone.
- No aggregation across functions in a single view. Comparing latency on
  `gemini-vision` against `gemini-skin-recs` means opening two tabs and
  eyeballing.
- No alerting. A 502 spike at 03:00 sits in the logs until someone reads
  them.
- No structured field indexing — full-text search over a JSON blob does
  not scale.

Phase XIV (post-XIII) should add:
- Structured logs shipped to an external aggregator (Datadog, Better
  Stack, Axiom — pick by cost and retention).
- Alerts on: any user hitting 429 (quota exceeded), 502 rate > 5% on any
  function over a 5-minute window, **any 503 from quota-check failure
  (P1 — the cost guardrail is degraded; see §8.1)**.
- A per-function latency dashboard (p50, p95, p99) with rolling 24h
  history.
- Cost-per-user-per-day surface fed from `gemini_usage`, with alert at
  N× legitimate-use threshold.

Out of scope for XIII. Flagged here so it is not forgotten when XIII
ships and the next priority gets chosen.

---

## 14. Migration order (operational)

### 14.1 Phase XIII-a — vision only

0. **Pre-flight: pass all seven gates in §16.**
   - Gates 1–7 cover CLI install, Deno helper compatibility, env
     auto-population, secret hot-reload, cold-start latency,
     cost-tracking insert latency, and worst-case body size.
   - **Success:** every gate is green and recorded in the PR description.
   - **Failure recovery:** stop. Do not write the real `gemini-vision`
     index until the failing gate is resolved per its recovery path.
     Skipping a gate that turns out to fail later means a partly-built
     function gets reworked — cheaper to verify the assumption first.

1. **Build & deploy the function.**
   - Implement `supabase/functions/gemini-vision/` + all `_shared/` files.
   - Run §11 steps 1-8.
   - **Success looks like:** `supabase functions deploy gemini-vision` returns 0 and lists the deployed URL.
   - **Failure recovery:** if deploy fails, check `supabase functions logs gemini-vision` for the error. Common: missing `deno.json`, import path typo. Fix locally, redeploy. Nothing in prod has changed yet.

2. **Set the new Gemini API key.**
   - Generate a fresh key at Google AI Studio. **Do not reuse the existing one** — we want a clean revoke target.
   - `supabase secrets set GEMINI_API_KEY=<new-value>`.
   - **Success:** `supabase secrets list` shows the secret with a fresh digest.
   - **Failure recovery:** if `secrets set` fails, you're not linked correctly. Rerun `supabase link`.

3. **Verify the function in isolation via curl.**
   - Run §11 step 9 with a real test user's JWT.
   - **Success:** 200 OK + a row in `gemini_usage` with `call_type='vision'`.
   - **Failure recovery:** if 500/502, read the function logs. Most common at this stage: env var typo, prompt-too-large, malformed Gemini response.

4. **Update the client to call the function for vision.**
   - Rewrite `lib/gemini/vision.ts` per §4.1 on branch `phase-xiii-gemini-server`.
   - Single commit.
   - Build a dev APK: `eas build --profile development --platform android`.
   - **Success:** dev APK runs a scan end-to-end without the new `GEMINI_API_KEY` in `.env`.

5. **End-to-end test on the dev build.**
   - Run a fresh scan. Verify: observation renders, partial scan is saved, analysis JSON matches what the curl test returned.
   - Run a rescan. Verify: previous-scan context flows through (the `previousScanSummary` field).
   - Verify cost-tracking: a new `gemini_usage` row lands per scan.
   - **Success:** no regression vs. pre-migration scan flow. Latency within 10%.
   - **Failure recovery:** keep the dev branch off `main`. Fix locally and retest. Production users still hit the old direct-Gemini path.

6. **Merge XIII-a → main, deploy client.**
   - Merge the single commit. Tag the release.
   - Build production APK: `eas build --profile production --platform android`.
   - Submit to internal-test track first; expand to friends only after smoke tests pass.

7. **DO NOT revoke the old Gemini key yet.**
   - XIII-a still uses the same key for Flash calls (those are still
     direct-from-client). Revocation has to wait for XIII-b.

### 14.2 Phase XIII-b — five Flash calls

**Migration order: lowest blast radius first.** The five Flash calls
migrate in this order, ordered by blast-radius-smallest-first rather
than representativeness:

1. **`gemini-delta-commentary`** — lowest traffic (rescans only);
   simplest post-processing; failure leaves the new scan intact, only
   the prose summary is missing.
2. **`gemini-hair-recs`** — rare invocation (hair-profile edits only);
   standalone — no `scan_id`; no post-parse normalization to move
   server-side.
3. **`gemini-makeup-recs`** — per-scan but regenerates rarely;
   exercises palette-validation-with-static-fallback.
4. **`gemini-beard-recs`** — per-scan when applicable; exercises the
   face-shape-leak sanitizer.
5. **`gemini-skin-recs`** — last: highest traffic, most post-parse
   logic (concern normalization + `routine_note` fallback). By the
   time it ships the shared scaffolding has baked through four prior
   deploys.

Rationale: prove the pattern on calls where failure is cheap, then
graduate to calls where failure is expensive.

**Per-function template.** For each of the five calls, in the order
above, repeat the following five steps before starting the next call:

  a. **Build & deploy the Edge Function.** Server-side only — no client
     change yet. Follows §11 steps 5–8.
  b. **Curl-verify in isolation.** Real request in, real response out, a
     `gemini_usage` row lands. Pass/fail is binary.
  c. **Rewrite the matching client wrapper** (`lib/gemini/<call>.ts`)
     per §4.2 as its own focused commit on
     `phase-xiii-gemini-server-flash`.
  d. **Build a dev APK, run a real end-to-end scan**, confirm behaviour
     for the call just migrated.
  e. **Merge to main; observe for a bake window** before starting the
     next function.

Bake window duration is calibrated to test-user volume: under low-volume
friend-testing it can be hours; under broader rollout it should be 24–48h.

The five wrapper commits — one per function — land sequentially on
`phase-xiii-gemini-server-flash`, each merged to `main` before the next
function's deploy begins. The order is non-negotiable: a failure in step
(d) for an earlier call must be resolved before a later call's deploy
starts, so the bake window of any in-flight call is never overlapped
with another in-flight call.

**Why per-function commits, not one bulk commit.** Per-function commits
enable surgical rollback — if the skin-recs wrapper regresses, revert
that one commit without disturbing the other four. They enable
per-function latency and error-rate baselines against `main`, because
each function's bake window is isolated. And they interact correctly
with the per-call kill-switch flags introduced in Revision 3: if
`<call>_enabled` flips false, only that one wrapper refuses, because
only that wrapper's commit introduced the edge-function dependency for
that call.

**Final cleanup commit.** After all five wrappers have landed and
stabilized (the fifth function — `gemini-skin-recs` — has completed its
bake window), ship one final commit on
`phase-xiii-gemini-server-flash` that:

- Extracts `cardinal` and `fitzpatrickToDepthTier` into neutral utility
  modules per §5 (e.g. `lib/utils/numbers.ts`, `lib/utils/fitzpatrick.ts`),
  and updates all client callers to import from the new paths.
- Deletes `lib/gemini/shared.ts`.
- Deletes `lib/geminiUsage.ts`.
- Deletes `app/gemini-test.tsx`.

The cleanup is held until last so the survivors-extraction is not
entangled with any of the five behavioural migrations. If one of the
wrapper migrations needs reverting, the deletion stays out of the
blast radius.

**Revoke the old Gemini key at Google AI Studio.** Performed AFTER all
five client wrappers have shipped and stabilized, AND the final cleanup
commit has merged. (This is the same guidance previously placed at the
end of XIII-a — moved here because the new per-function structure means
the Flash path doesn't stop using the old key until the fifth wrapper
ships.)

- New production APK has no key — it doesn't matter to new installs.
- **Friends with the old APK will start seeing scan failures.** This
  is intended. They get pushed a new build.
- **Success:** old key is "Deleted" in the AI Studio key list; any
  remaining direct-Gemini call returns 403.

**Distribute the new APK to friends.**

- EAS internal distribution link.
- **Success:** friends update and resume scanning. Cost-tracking shows
  `gemini_usage` rows coming from server side only — no inserts
  authored by user JWTs anymore.

---

## 15. Test plan

For each function, four curl tests + one end-to-end test.

### 15.1 Curl tests (per function)

1. **Valid JWT + valid body:**
   ```
   POST /functions/v1/<name>
   Authorization: Bearer <user-jwt>
   { ... valid request ... }
   → 200 OK, response matches §1 schema.
   ```
2. **No JWT:**
   ```
   POST /functions/v1/<name>
   { ... valid request ... }
   → 401 Unauthorized (Supabase default).
   ```
3. **Valid JWT + over-quota user:**
   - Set up a test user with 99 rows in `gemini_usage` for the call_type in the last 24h.
   - Call the function.
   - → 429 Too Many Requests + `Retry-After: 86400`.
4. **Valid JWT + malformed body:**
   ```
   POST /functions/v1/<name>
   Authorization: Bearer <user-jwt>
   { ... missing required fields ... }
   → 400 Bad Request, body { error: <description> }.
   ```

### 15.2 End-to-end test (per phase)

XIII-a:
- Fresh scan on dev APK with new key set server-side, old key removed from `.env`.
- Expect: full observation renders, scan row saved, gemini_usage row lands with `call_type='vision'`.
- Verify latency: `console.time('scan_phase_1')` in the wrapper. Expect 15–22s total (Gemini-dominated, edge function adds ≤500ms cold start).

XIII-b:
- Fresh scan with all four sections.
- Expect: skin, beard (if applicable), makeup (if applicable) all render.
- Expect: five gemini_usage rows for vision + 1–4 sections.
- Rescan immediately after first scan: expect `delta_commentary` row to land within 30s.
- Hair-profile edit on a separate test user: expect `hair_recs` row to land.

### 15.3 Cost-tracking verification

After each test scan, query:
```sql
select call_type, success, input_tokens, output_tokens, cost_usd, duration_ms
from gemini_usage
where user_id = '<test-user>'
and created_at > now() - interval '5 minutes'
order by created_at desc;
```
Expected: one row per Gemini call, all `success=true`, costs match the
PRICING formula.

### 15.4 Latency regression check

Run 5 scans pre-XIII-a (current main) and 5 scans post-XIII-a. Compare
mean Phase 1 latency. Expectation: within ±10%. If the edge function adds
more than 1.5s overhead, investigate (cold starts repeating? unexpected
serial DB call?).

### 15.5a Verify the client no longer reads `GEMINI_API_KEY`

Goal: prove the client code path has cut its dependency on a client-side
Gemini key. After this test, the value of `EXPO_PUBLIC_GEMINI_API_KEY`
in `.env` is irrelevant to client behaviour.

1. On a dev build, temporarily set `EXPO_PUBLIC_GEMINI_API_KEY=DUMMY_INVALID` in `.env`.
2. Build a fresh dev APK.
3. Run a scan.
4. **Expected:** scan succeeds. The client no longer reads this var; all
   Gemini calls route through edge functions, which use the *server-side*
   secret.

**Conclusion:** the client is no longer bound to any client-side Gemini
key. Old APKs already in the wild that still bundle the var are not
affected by what value lives in the env *at the client level* — they
fail only because the server-side key (set via `supabase secrets`) was
rotated, not because of any client-side dummy value.

### 15.5b Verify the server-side key is the only working path

Goal: prove there is no client-side fallback if the server-side secret
is bad.

1. In a non-prod Supabase project, temporarily set the secret
   `GEMINI_API_KEY` to an invalid value (`supabase secrets set GEMINI_API_KEY=DUMMY_INVALID`).
2. Rerun a scan against that project.
3. **Expected:** the edge function returns 502 (Gemini API rejects the
   key with a 400/401, the function maps to 502). The client surfaces
   the existing "scan failed" UI.

**Conclusion:** the server-side secret is the sole load-bearing key. No
client-side fallback exists — if the server-side key is wrong, scans
fail loudly. This is the desired post-migration state.

### 15.6 Kill switch test (remote config)

Tests the §10 remote-config flow end-to-end.

1. **Baseline.** Confirm `app_config` row for `gemini_scans_enabled` is `true`.
   Open the app, run a scan. Expected: scan succeeds.
2. **Flip the flag.** In Supabase Studio → Table Editor → `app_config`,
   set `value` to `false` on the `gemini_scans_enabled` row. Save.
3. **Immediate test — fresh launch.** Force-quit the app, relaunch, run
   a scan. Expected: within seconds the user sees *"Scan is temporarily
   unavailable. Please try again in a bit."* No network call to any
   `functions.invoke` endpoint or Gemini.
4. **Cached-client test.** On a second test device that opened the app
   *before* the flag was flipped (so its 5-minute cache is still warm),
   run a scan immediately. Expected: scan still succeeds (cache hasn't
   expired). Wait 5+ minutes, run again. Expected: scan now refuses.
   Alternatively, send the app to background and foreground it — the
   foreground listener invalidates the cache and the next scan refuses.
5. **Restore.** Flip `value` back to `true`. Confirm scans recover on
   the next cache refresh on each client.
6. **RLS check (security).** As an authenticated non-operator user, try
   `await supabase.from('app_config').update({ value: true })`. Expected:
   the request is silently denied (no UPDATE policy exists for the
   authenticated role — only SELECT). The row is unchanged.

### 15.7 Manual review checkboxes

- [ ] No `EXPO_PUBLIC_GEMINI_API_KEY` reference in `lib/`, `services/`, `hooks/`, or `app/` post-XIII-b.
- [ ] `lib/geminiUsage.ts` deleted.
- [ ] `app/gemini-test.tsx` deleted.
- [ ] `_shared/types.ts` matches client `types/index.ts` for all shared types (visual diff).
- [ ] `gemini_usage` table has no rows authored by a user JWT after XIII-b deploys (verify by checking `auth.uid()` in a server-side audit query — or simpler: check that all new rows after deploy timestamp came in via service role).

---

## 16. Pre-flight verification gates

The original §16 was a list of "things to verify" with no enforcement.
Restructured here as **gated steps**: all seven must pass before any
production code is written for XIII-a (specifically, before
`supabase/functions/gemini-vision/index.ts` gets its first non-stub
commit). Each gate has a concrete action, an explicit success criterion,
and a failure-recovery path.

Cross-referenced from §14.1 step 0.

### Gate 1 — Supabase CLI install on Windows

- **Action:** `scoop install supabase` (preferred) or download the
  Windows binary from `github.com/supabase/cli/releases` and put it on
  `PATH`. Then run `supabase --version`.
- **Success:** prints a version string (e.g. `1.150.0`) with no error.
- **Failure recovery:** if `scoop` is not installed, run the bootstrap
  per `scoop.sh`. If the binary fails to launch, try the official
  Windows installer linked from Supabase docs. Don't proceed until this
  gate is green.

### Gate 2 — Deno compatibility of helpers

The eight helpers being moved server-side (`cardinal`, `ordinal`,
`fitzpatrickToDepthTier`, `getPaletteSwatches`, `cleanJsonResponse`,
`faceShapeProse`, `stripFaceShapeSentences`, `normalizeConcern`) all use
only `Math`, `String`, `RegExp`, `Array`. They *should* run in Deno
unchanged, but the assumption must be tested empirically before we trust
it.

- **Action:** scaffold a throwaway test function:
  ```bash
  supabase functions new __test_helpers
  ```
  Inline-paste each helper into `__test_helpers/index.ts`. Wire a simple
  POST handler that runs every helper against a known input and returns
  the results as JSON. Run locally:
  ```bash
  supabase functions serve __test_helpers
  curl -X POST http://localhost:54321/functions/v1/__test_helpers \
       -H 'Content-Type: application/json' -d '{}'
  ```
- **Success:** 200 response with the expected outputs. No Deno import
  errors, no `ReferenceError`s, no transpile warnings.
- **Failure recovery:** identify which helper fails. Most likely
  candidates are anything that touches `process.env` (none of the eight
  do, but verify) or relies on Node-only globals. Replace with a
  Deno-compatible substitute *before* proceeding. Don't ship the gate
  with a known incompatibility.

### Gate 3 — Service role env auto-population

§7 assumes `Deno.env.get('SUPABASE_URL')` and
`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` are available without an
explicit `supabase secrets set`. Supabase docs say yes, but production
code must not rely on a doc claim that isn't tested.

- **Action:** in the `__test_helpers` stub from Gate 2, add on first
  invocation:
  ```ts
  console.log(JSON.stringify({
    hasSrk: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    hasUrl: !!Deno.env.get('SUPABASE_URL'),
  }));
  ```
  Deploy the stub. Hit it once. Check logs.
- **Success:** both fields print `true`.
- **Failure recovery:** if either is `false`, the §7 cost-tracking
  pattern needs adjustment. Two options: (a) manually set
  `SUPABASE_SERVICE_ROLE_KEY` via `supabase secrets set` (document in
  §12 rotation procedure as a one-time provisioning step) or (b) switch
  to a different auth pattern (e.g., the function inherits the caller's
  JWT and uses an SQL function with `security definer` for cost writes).
  Pick (a) unless there is a reason not to — it's the simpler path.

### Gate 4 — Secret hot-reload empirically

§12 claims `supabase secrets set GEMINI_API_KEY=<new>` takes effect on
the next invocation with no redeploy. Test before relying on it for
production rotation.

- **Action:**
  1. Deploy `__test_helpers` (or the real `gemini-vision` after gates
     1-3 pass) with `GEMINI_API_KEY` set to a known-invalid string.
  2. Send a request. Expect 502 (Gemini rejects the bad key).
  3. **Without redeploying**, run
     `supabase secrets set GEMINI_API_KEY=<a-real-working-key>`.
  4. Send the same request again.
- **Success:** the second request returns 200 — proving the function
  picked up the new secret value on next invocation, no redeploy.
- **Failure recovery:** if step 4 still returns 502 with the old-key
  error, hot-reload is not working. Update §12 to add an explicit
  `supabase functions deploy <name>` redeploy step after every secret
  rotation, and update the rotation runbook accordingly.

### Gate 5 — Cold start latency on free tier

We need to know how cold-start behaves on the Supabase free/Pro plan
before the first user-facing scan goes through. If cold start is
multi-second, it eats into the scan latency budget.

- **Action:** deploy the (now-real, post-gates 1–4) `gemini-vision`
  function. Wait 15 minutes (longer than any plausible warm-pool
  window). Send one curl request and measure time-to-first-byte (TTFB).
  Repeat 3× with 15-minute gaps to get a representative cold-start
  number.
- **Success:** TTFB ≤ 1.5 seconds *before* the Gemini call itself
  begins. (Total scan latency will dwarf this — Gemini call is 12-18s —
  but cold start should not be the dominant term.)
- **Failure recovery:** if cold start consistently > 1.5s, options:
  (a) accept it as a one-time-per-session cost (scans are infrequent —
  user is on the scan screen for 15+ seconds anyway), (b) add a
  scheduled cron pinger keeping the function warm (small recurring
  cost, only worth it if cold start hurts UX), or (c) move to a
  different runtime later. Document the chosen path before proceeding.

### Gate 6 — `gemini_usage` row insert latency baseline (NO CEILING)

The cost-tracking insert runs in the background via
`EdgeRuntime.waitUntil` (§7.2), so its latency does NOT extend
user-perceived scan latency. This gate establishes a baseline
measurement for the insert's wall-clock latency. There is no pass/fail
ceiling — we measure for observability.

- **Action:** in the deployed `gemini-vision` (or the test stub), wrap
  the `admin.from('gemini_usage').insert(...)` call with timing
  instrumentation. Run 5 invocations.
- **Success:** any measurement completes. The number itself is reported
  as a baseline for future observability work.
- **Failure recovery:** if all 5 fail (every insert returns an error),
  investigate. Common causes: RLS evaluation rejecting service role
  unexpectedly (shouldn't happen), connection pool exhaustion, malformed
  row.

Historical baseline from 2026-05-11: warm inserts ~200-350ms, first
cold insert after function start ~1-1.7s. Sydney project, PostgREST
hop.

### Gate 7 — Largest legitimate body size

Verify the worst-case vision request still fits under Supabase's
function body limit (default 6MB) and parses cleanly.

- **Action:** craft a synthetic vision request with the largest
  realistic payload — a 100KB base64-encoded image plus the full prompt
  context including a `previousScanSummary` string at the upper end of
  what `delta.ts` will pass in. Send it via curl.
- **Success:** parses cleanly, no `413 Payload Too Large`, no JSON
  parse error in the function.
- **Failure recovery:** if 413, bump the function body limit in
  `supabase/config.toml` under `[functions.<name>]`. (Default of 6MB is
  ~60× the worst-case payload, so this gate is mostly a sanity check —
  but verify rather than assume.)

### Gate completion

All seven gates must be green before XIII-a writes the first non-stub
commit of `gemini-vision/index.ts`. Track in the PR description as a
checklist:

```
- [ ] Gate 1 — Supabase CLI on Windows
- [ ] Gate 2 — Deno helper compatibility
- [ ] Gate 3 — Service-role env auto-population
- [ ] Gate 4 — Secret hot-reload
- [ ] Gate 5 — Cold-start latency ≤1.5s
- [ ] Gate 6 — gemini_usage insert baseline measured (no ceiling — fire-and-forget per §7.2)
- [ ] Gate 7 — Largest body parses
```

---

## 17. What's NOT in scope for Phase XIII

- Moving prompts from code to a DB table (`gemini_prompts` table). Still in code, but now server-side code — prompt iteration becomes a function redeploy, not an APK release.
- Per-user-per-hour quota (only per-day for v1).
- Multi-region edge function deployment (Supabase default region only).
- A/B testing infrastructure for prompt variants.
- Migrating `EXPO_PUBLIC_GOOGLE_PLACES_KEY` (separate phase — different threat model since the key is referer-restricted at Google).
- Migrating `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (an OAuth client ID, not a secret — does not need migrating).
- Per-call structured response logging (only token counts + finish_reason in v1).
- Replacing the `gemini_usage_insert_own` RLS policy with a deny-all client-write policy. The current policy is now dead code (server uses service role), but dropping it is a separate cleanup.
- Adding a `(user_id, call_type, created_at)` composite index for tighter quota queries. Existing `(user_id, created_at)` index suffices at current volume.
- An operator-facing cost dashboard. The raw `gemini_usage` rows are queryable in Supabase Studio.
- `EXPO_PUBLIC_GEMINI_EDGE_ENABLED` build-time env var. Removed from this design wholesale (§10) — replaced by the `app_config` remote-config table. There is no client-side kill-switch env var in this phase.
- Expanding `app_config` beyond `gemini_scans_enabled`. The table is designed to grow (any future operator-toggled flag can land as a new key), but adding additional flags is out of scope for this phase. The migration seeds the one row Phase XIII needs.
- An operator UI for editing `app_config`. v1 operator workflow is Supabase Studio Table Editor (§10.4). A purpose-built admin UI is a later phase.
- External structured-log aggregation and alerting per §13.4. v1 ships with `console.log` → Supabase function logs only.

---

## 18. Deferred items — Block mapping

Every item deferred from Phase XIII is mapped here against the Block 1–5
scaling roadmap so it can be picked up at the right point rather than
forever-deferred. Block definitions: **Block 1** = cannot ship to anyone
without these; **Block 2** = cannot ship to public app store without
these; **Block 3** = cannot scale past ~1k DAU without these;
**Block 4** = cannot scale past ~100k DAU without these; **Block 5** =
cannot operate professionally without these.

| Deferred item | Block | Justification |
|---|---|---|
| Prompts moved from code to `gemini_prompts` DB table | Block 4 | A/B-testing infrastructure is a post-100k-DAU concern; server-side-but-in-code is sufficient until then. |
| Per-user-per-hour quota | Block 3 | Per-day quota suffices until abuse patterns emerge at higher user volumes. |
| Multi-region Edge Function deployment | Block 4 | Single-region latency is acceptable until an international user base materializes. |
| A/B testing infrastructure for prompt variants | Block 4 | Requires the `gemini_prompts` DB table above; same trigger. |
| Migrating `EXPO_PUBLIC_GOOGLE_PLACES_KEY` | Block 2 | Public-app-store launch requires all paid-API keys to be server-side; referer restrictions help but are not sufficient against motivated extraction. |
| Migrating `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | N/A | OAuth client ID is not a secret by design; no migration needed at any block. |
| Per-call structured response logging | Block 3 | Token counts + finish_reason suffice for v1 debugging; full structured logs need the aggregator from Block 3. |
| Drop `gemini_usage_insert_own` RLS policy | Block 2 | Dead-but-harmless code cleanup; defensible to leave during friend-test but should be cleaned before public-store launch. |
| `(user_id, call_type, created_at)` composite index | Block 3 | Quota check query degrades as `gemini_usage` rowcount approaches ~1M rows. |
| Operator-facing cost dashboard | Block 3 | Manual SQL queries against `gemini_usage` do not scale operationally past a handful of users. |
| `EXPO_PUBLIC_GEMINI_EDGE_ENABLED` env var | N/A | Replaced by `app_config` remote flags; never re-introduced. |
| Expanding `app_config` beyond Phase XIII flags | Block 3+ | Schema is designed to grow; specific additions handled case-by-case as future phases require flags. |
| Operator UI for editing `app_config` | Block 5 | Supabase Studio Table Editor is the v1 operator workflow; a purpose-built admin tool is part of operational maturity. |
| External structured-log aggregation + alerting (§13.4) | Block 3 | `console.log` → Supabase function logs is unreadable past ~1k DAU; this is the Block 3 observability upgrade. |

### 18.1 Alert thresholds (to wire when Block 3 aggregator lands)

When the external log aggregator from §13.4 ships, wire these thresholds
unchanged. They are defined here so that decisions about thresholds are
made cold, not under the pressure of an in-flight incident.

- **502 rate per function exceeding 5% over a rolling 5-minute window**
  → **P2 alert** (function degraded; service partially impacted).
- **Any 503 from quota-check failure (§8.1)**
  → **P1 alert** (cost guardrail degraded; potential unbounded Gemini
  spend if the Postgres outage persists).
- **p95 latency drift exceeding 20% week-over-week per function**
  → **P3 alert** (gradual regression detection).
- **Any user hitting 429 (quota exceeded) on legitimate-pattern usage**
  → **P3 alert** (signals quota ceiling may be miscalibrated).
- **`gemini_usage` daily cost** (sum of `cost_usd` over rolling 24h)
  **exceeding 3× rolling 30-day median**
  → **P2 alert** (potential abuse or runaway loop; not an outage but
  warrants investigation within hours).

Defining these thresholds now rather than during an incident is a
deliberate sequencing choice: an aggregator that ships without wired
alerts is decoration, not observability.

---

## Appendix A — files this design touches

**Created server-side:**
- `supabase/config.toml` (via `supabase init`)
- `supabase/functions/gemini-vision/index.ts`
- `supabase/functions/gemini-skin-recs/index.ts`
- `supabase/functions/gemini-beard-recs/index.ts`
- `supabase/functions/gemini-makeup-recs/index.ts`
- `supabase/functions/gemini-hair-recs/index.ts`
- `supabase/functions/gemini-delta-commentary/index.ts`
- `supabase/functions/_shared/prompts.ts`
- `supabase/functions/_shared/helpers.ts`
- `supabase/functions/_shared/gemini-client.ts`
- `supabase/functions/_shared/cost-tracking.ts`
- `supabase/functions/_shared/quota.ts`
- `supabase/functions/_shared/types.ts`
- `supabase/functions/_shared/normalize.ts`
- `supabase/migrations/phase_13_app_config.sql` — new `public.app_config` table seeded with the master `gemini_scans_enabled` flag plus six per-call flags (§10.1).

**Created client-side:**
- `lib/appConfig.ts` — remote-config reader, 5-min in-memory cache, master `isGeminiEnabled()` plus six per-call helpers `isVisionEnabled()`, `isSkinRecsEnabled()`, `isBeardRecsEnabled()`, `isMakeupRecsEnabled()`, `isHairRecsEnabled()`, `isDeltaCommentaryEnabled()` (§10.2).

**Modified client-side:**
- `lib/gemini/vision.ts` (rewritten to invoke; calls `isVisionEnabled()` at entry)
- `lib/gemini/skin.ts` (rewritten to invoke; calls `isSkinRecsEnabled()` at entry)
- `lib/gemini/beard.ts` (rewritten to invoke; calls `isBeardRecsEnabled()` at entry)
- `lib/gemini/makeup.ts` (rewritten to invoke; calls `isMakeupRecsEnabled()` at entry)
- `lib/gemini/hair.ts` (rewritten to invoke; calls `isHairRecsEnabled()` at entry)
- `lib/gemini/delta.ts` (rewritten to invoke; calls `isDeltaCommentaryEnabled()` at entry)
- `lib/gemini/index.ts` (re-exports adjusted)
- `app/_layout.tsx` — register `AppState.addEventListener('change', ...)` that calls `invalidateAppConfigCache()` on `'active'` (§10.2). No `AppState` listener exists in the codebase today — this is the first one.
- `lib/profileData.ts`, `app/(tabs)/routine.tsx`, `components/routine/RescanBanner.tsx` — update `cardinal` import path away from `lib/gemini/shared`.
- `services/scanService.ts` — update `fitzpatrickToDepthTier` import path away from `lib/gemini/shared`.
- `.env.example` — drop `EXPO_PUBLIC_GEMINI_API_KEY` line. No `EXPO_PUBLIC_GEMINI_EDGE_ENABLED` is added — kill switch is server-side via `app_config` (§10).
- `eas.json` — **no change in this phase**. The original design's `EXPO_PUBLIC_GEMINI_EDGE_ENABLED` entry is dropped; the build profile env stays as-is.

**Deleted:**
- `lib/gemini/shared.ts` (whole file, after extracting `cardinal` + `fitzpatrickToDepthTier` to neutral utility modules).
- `lib/geminiUsage.ts` (whole file).
- `app/gemini-test.tsx` (whole file).

**Not touched:**
- `supabase/migrations/*.sql` — schema is fine as-is. RLS policy on `gemini_usage` is left alone (dead but harmless).
- `hooks/useScan.tsx` — no streaming consumer, no logic change.
- `services/deltaService.ts`, `services/habitService.ts`, etc. — orchestration logic unchanged.
- `types/index.ts` — types are duplicated server-side, originals untouched.
