// gemini-beard-recs — Phase XIII-b edge function.
//
// POST-only, JWT-authenticated. Routes the beard recommendation call
// (gemini-2.5-flash) through the server.
//
// Pattern mirrors gemini-delta-commentary:
//   1. Method check (POST only)
//   2. Decode caller JWT → user_id
//   3. Parse + validate body shape
//   4. Per-user-per-24h quota check (fail closed)
//   5. Build beard prompt server-side
//   6. callGeminiWithRetry (two attempts)
//   7. Parse + schema sanity check (502 on failure, no partials)
//   8. Sanitize beard_shape_intro — null it out if missing/blank, or if it
//      names a categorical face_shape (the prompt explicitly forbids that;
//      mirrors lib/gemini/beard.ts:200-207).
//   9. Fire-and-forget gemini_usage insert via EdgeRuntime.waitUntil
//  10. Return GeminiBeardRecsResponse
//
// QUOTA_CEILING is 20 because rescans regenerate beard advice alongside
// the skin recs, so caps need to absorb two rescans per 24h plus a couple
// of manual re-runs without bumping into the limiter.
//
// See docs/phase-xiii-architecture.md §1.3, §3 item 6, §7.2, §8.1, §9, §13.

import "@supabase/functions-js/edge-runtime.d.ts";

import type {
  BeardGoal,
  GeminiBeardRecsRequest,
  GeminiBeardRecsResponse,
  GeminiVisionResponse,
} from "../_shared/types.ts";
import { buildBeardPrompt } from "../_shared/prompts.ts";
import { cleanJsonResponse, faceShapeProse } from "../_shared/helpers.ts";
import { callGeminiWithRetry } from "../_shared/gemini-client.ts";
import { logUsage } from "../_shared/cost-tracking.ts";
import { checkQuota } from "../_shared/quota.ts";

const CALL_TYPE      = "beard_recs" as const;
const MODEL          = "gemini-2.5-flash" as const;
const MAX_OUT_TOKENS = 4096;
const QUOTA_CEILING  = 20;

const VALID_BEARD_GOALS: ReadonlySet<string> = new Set<BeardGoal>([
  "fuller", "sharper", "shorter", "longer", "none",
]);

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
  // Permissive — the beard prompt JSON-stringifies the whole analysis.
  return true;
}

function validateRequest(body: unknown): GeminiBeardRecsRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "body_must_be_object" };
  const b = body as Record<string, unknown>;

  if (!isVisionResponse(b.analysis)) return { error: "analysis_invalid" };
  if (b.beardGoal != null && (typeof b.beardGoal !== "string" || !VALID_BEARD_GOALS.has(b.beardGoal))) {
    return { error: "beardGoal_invalid" };
  }
  if (b.scanId != null && typeof b.scanId !== "string") {
    return { error: "scanId_must_be_string_or_null" };
  }

  return {
    analysis:  b.analysis as GeminiVisionResponse,
    beardGoal: (b.beardGoal as BeardGoal | null | undefined) ?? null,
    scanId:    (b.scanId as string | null | undefined) ?? null,
  };
}

function passesSchemaSanity(p: GeminiBeardRecsResponse): boolean {
  if (typeof p.advice !== "string" || !p.advice.trim()) return false;
  if (p.beard_shape_intro !== null && typeof p.beard_shape_intro !== "string") return false;
  if (!Array.isArray(p.steps)) return false;
  if (!Array.isArray(p.beard_styles)) return false;
  return true;
}

// Mirrors lib/gemini/beard.ts:200-207. The prompt explicitly forbids naming
// a categorical face_shape ("oval face", "round shape", etc.) inside the
// beard_shape_intro bridge. Belt-and-braces: if Gemini ignores that rule we
// strip the field server-side rather than leaking it to the UI.
function sanitizeBeardShapeIntro(parsed: GeminiBeardRecsResponse): void {
  const intro = parsed.beard_shape_intro;
  if (typeof intro !== "string" || intro.trim().length === 0) {
    parsed.beard_shape_intro = null;
    return;
  }
  if (faceShapeProse().test(intro)) {
    parsed.beard_shape_intro = null;
    return;
  }
  parsed.beard_shape_intro = intro.trim();
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
  const request = validated as GeminiBeardRecsRequest;

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
    contents: [{ parts: [{ text: buildBeardPrompt(request) }] }],
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
  let parsed: GeminiBeardRecsResponse;
  try {
    parsed = JSON.parse(cleaned) as GeminiBeardRecsResponse;
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

  // ─── Post-processing: face-shape-leak sanitizer (§3 item 6) ─────────────
  sanitizeBeardShapeIntro(parsed);

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
