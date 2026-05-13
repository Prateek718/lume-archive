// gemini-skin-recs — Phase XIII-b edge function.
//
// POST-only, JWT-authenticated. Routes the skin recommendation call
// (gemini-2.5-flash) through the server.
//
// Pattern mirrors gemini-delta-commentary:
//   1. Method check (POST only)
//   2. Decode caller JWT → user_id
//   3. Parse + validate body shape
//   4. Per-user-per-24h quota check (fail closed)
//   5. Build skin prompt server-side
//   6. callGeminiWithRetry (two attempts)
//   7. Parse + schema sanity check (502 on failure, no partials)
//   8. Post-processing (§3 item 5):
//        - normalize step.target_concern through normalizeConcern; drop the
//          field if it can't be resolved to a CanonicalConcern.
//        - apply routine_note fallback derivation (first sentence of advice,
//          or a stock line) so the client never sees an empty routine_note.
//   9. Fire-and-forget gemini_usage insert via EdgeRuntime.waitUntil
//  10. Return GeminiSkinRecsResponse
//
// See docs/phase-xiii-architecture.md §1.2, §3 item 5, §7.2, §8.1, §9, §13.

import "@supabase/functions-js/edge-runtime.d.ts";

import type {
  GeminiSkinRecsRequest,
  GeminiSkinRecsResponse,
  GeminiVisionResponse,
  MatchedProduct,
  RoutineStep,
} from "../_shared/types.ts";
import { buildSkinPrompt } from "../_shared/prompts.ts";
import { cleanJsonResponse } from "../_shared/helpers.ts";
import { normalizeConcern } from "../_shared/normalize.ts";
import { callGeminiWithRetry } from "../_shared/gemini-client.ts";
import { logUsage } from "../_shared/cost-tracking.ts";
import { checkQuota } from "../_shared/quota.ts";

const CALL_TYPE      = "skin_recs" as const;
const MODEL          = "gemini-2.5-flash" as const;
const MAX_OUT_TOKENS = 8192;
const QUOTA_CEILING  = 20;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

function decodeJwtSub(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const payload = JSON.parse(atob(b64 + pad));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function isVisionResponse(v: unknown): v is GeminiVisionResponse {
  if (!v || typeof v !== "object") return false;
  // Permissive — the skin prompt JSON-stringifies the whole analysis.
  return true;
}

function isMatchedProductArray(v: unknown): v is MatchedProduct[] {
  if (!Array.isArray(v)) return false;
  return v.every((m) => {
    if (!m || typeof m !== "object") return false;
    const o = m as Record<string, unknown>;
    return (
      typeof o.category === "string" &&
      typeof o.name === "string" &&
      typeof o.brand === "string" &&
      Array.isArray(o.attributes)
    );
  });
}

function validateRequest(body: unknown): GeminiSkinRecsRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "body_must_be_object" };
  const b = body as Record<string, unknown>;

  if (!isVisionResponse(b.analysis)) return { error: "analysis_invalid" };
  if (!isMatchedProductArray(b.matchedProducts)) {
    return { error: "matchedProducts_invalid" };
  }
  if (b.ageRange != null && typeof b.ageRange !== "string") {
    return { error: "ageRange_must_be_string_or_null" };
  }
  if (b.scanId != null && typeof b.scanId !== "string") {
    return { error: "scanId_must_be_string_or_null" };
  }

  return {
    analysis:        b.analysis as GeminiVisionResponse,
    matchedProducts: b.matchedProducts as MatchedProduct[],
    ageRange:        (b.ageRange as string | null | undefined) ?? null,
    scanId:          (b.scanId   as string | null | undefined) ?? null,
  };
}

function passesSchemaSanity(p: GeminiSkinRecsResponse): boolean {
  if (typeof p.advice !== "string" || !p.advice.trim()) return false;
  if (!Array.isArray(p.steps)) return false;
  // routine_note may be empty here — the fallback below populates it.
  return true;
}

// Mirrors lib/gemini/skin.ts:233-246. Walks every step and rewrites
// target_concern to its CanonicalConcern via the alias table; drops the
// field if the input is unrecognisable so the catalog scorer's exact-string
// match doesn't silently fall through to the non-target path.
function normalizeStepConcerns(steps: RoutineStep[] | undefined): void {
  if (!steps) return;
  for (const step of steps) {
    if (!step.target_concern) continue;
    const raw = step.target_concern;
    const normalized = normalizeConcern(raw);
    if (normalized) {
      step.target_concern = normalized;
    } else {
      console.warn(JSON.stringify({
        event:           "target_concern_dropped",
        unrecognized:    raw,
      }));
      delete step.target_concern;
    }
  }
}

// Mirrors lib/gemini/skin.ts:250-256. routine_note is REQUIRED in the
// response contract (§1.2) — if Gemini omits it or returns whitespace,
// derive a fallback so the client never has to render an empty pulled-quote.
function applyRoutineNoteFallback(parsed: GeminiSkinRecsResponse): void {
  if (parsed.routine_note && parsed.routine_note.trim()) return;
  const advice = parsed.advice ?? "";
  const firstSentence = advice.match(/^[^.!?]*[.!?]/)?.[0]?.trim();
  parsed.routine_note = firstSentence && firstSentence.length > 0
    ? firstSentence
    : "A short, consistent routine beats a long inconsistent one.";
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const userId = decodeJwtSub(req.headers.get("authorization"));
  if (!userId) {
    return json({ error: "unauthenticated" }, 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const validated = validateRequest(raw);
  if ("error" in validated) {
    return json({ error: validated.error }, 400);
  }
  const request = validated as GeminiSkinRecsRequest;

  console.log(JSON.stringify({
    event:     "request",
    scan_id:   request.scanId,
    user_id:   userId,
    call_type: CALL_TYPE,
  }));

  // ─── Quota ──────────────────────────────────────────────────────────────
  const quota = await checkQuota({ userId, callType: CALL_TYPE, ceiling: QUOTA_CEILING });
  if (quota.failed) {
    return json(
      { error: "quota_check_failed" },
      503,
      { "Retry-After": "60" },
    );
  }
  if (!quota.ok) {
    return json(
      { error: "quota_exceeded" },
      429,
      { "Retry-After": String(quota.resetSeconds) },
    );
  }

  const geminiBody = {
    contents: [{ parts: [{ text: buildSkinPrompt(request) }] }],
    generationConfig: {
      temperature:     0,
      maxOutputTokens: MAX_OUT_TOKENS,
    },
  };

  let result;
  try {
    result = await callGeminiWithRetry(MODEL, geminiBody, MAX_OUT_TOKENS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const finishReason = (err as { finishReason?: string | null }).finishReason ?? null;
    console.error(JSON.stringify({
      event:         "gemini_exhausted",
      scan_id:       request.scanId,
      error:         msg,
      finish_reason: finishReason,
    }));
    EdgeRuntime.waitUntil(logUsage({
      userId,
      scanId:       request.scanId,
      callType:     CALL_TYPE,
      model:        MODEL,
      inputTokens:  0,
      outputTokens: 0,
      durationMs:   Date.now() - startedAt,
      success:      false,
      errorMessage: msg,
    }));
    return json({ error: msg, finish_reason: finishReason }, 502);
  }

  console.log(JSON.stringify({
    event:         "gemini_call",
    scan_id:       request.scanId,
    latency_ms:    Date.now() - startedAt,
    input_tokens:  result.inputTokens,
    output_tokens: result.outputTokens,
    finish_reason: result.finishReason,
  }));

  // ─── Parse + schema sanity (§3 — 502 on failure, no partials) ──────────
  const cleaned = cleanJsonResponse(result.text);
  let parsed: GeminiSkinRecsResponse;
  try {
    parsed = JSON.parse(cleaned) as GeminiSkinRecsResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      event:   "parse_failed",
      scan_id: request.scanId,
      error:   msg,
    }));
    EdgeRuntime.waitUntil(logUsage({
      userId,
      scanId:       request.scanId,
      callType:     CALL_TYPE,
      model:        MODEL,
      inputTokens:  result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs:   Date.now() - startedAt,
      success:      false,
      errorMessage: `parse_failed: ${msg}`,
    }));
    return json(
      { error: "malformed_response", finish_reason: result.finishReason },
      502,
    );
  }

  if (!passesSchemaSanity(parsed)) {
    console.error(JSON.stringify({
      event:         "schema_failed",
      scan_id:       request.scanId,
      finish_reason: result.finishReason,
    }));
    EdgeRuntime.waitUntil(logUsage({
      userId,
      scanId:       request.scanId,
      callType:     CALL_TYPE,
      model:        MODEL,
      inputTokens:  result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs:   Date.now() - startedAt,
      success:      false,
      errorMessage: "schema_failed",
    }));
    return json(
      { error: "malformed_response", finish_reason: result.finishReason },
      502,
    );
  }

  // ─── Post-processing (§3 item 5) ────────────────────────────────────────
  normalizeStepConcerns(parsed.steps);
  applyRoutineNoteFallback(parsed);

  // ─── Telemetry (fire-and-forget) ─────────────────────────────────────────
  EdgeRuntime.waitUntil(logUsage({
    userId,
    scanId:       request.scanId,
    callType:     CALL_TYPE,
    model:        MODEL,
    inputTokens:  result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs:   Date.now() - startedAt,
    success:      true,
  }));

  console.log(JSON.stringify({
    event:      "response",
    scan_id:    request.scanId,
    status:     200,
    latency_ms: Date.now() - startedAt,
  }));

  return json(parsed, 200);
});
