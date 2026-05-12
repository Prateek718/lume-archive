// gemini-delta-commentary — Phase XIII-b edge function.
//
// POST-only, JWT-authenticated. Routes the delta narrative call
// (gemini-2.5-flash) through the server so the client never holds the
// Gemini API key. Triggered once per rescan after Phase 2 settles.
//
// Pattern:
//   1. Method check (POST only)
//   2. Decode caller JWT → user_id
//   3. Parse + validate body shape
//   4. Per-user-per-24h quota check (fail closed)
//   5. Compute concerns_worsened server-side from the two scans
//   6. Build delta prompt server-side
//   7. callGeminiWithRetry (two attempts)
//   8. Parse + schema sanity check (502 on failure, no partials)
//   9. Fire-and-forget gemini_usage insert via EdgeRuntime.waitUntil
//  10. Return GeminiDeltaCommentaryResponse
//
// See docs/phase-xiii-architecture.md §1.6, §3 item 8, §7.2, §8.1, §9, §13.

import "@supabase/functions-js/edge-runtime.d.ts";

import type {
  DeltaScanContext,
  DeltaScanInput,
  GeminiDeltaCommentaryRequest,
  GeminiDeltaCommentaryResponse,
  SkinConcernObservation,
} from "../_shared/types.ts";
import { buildDeltaPrompt } from "../_shared/prompts.ts";
import { cleanJsonResponse } from "../_shared/helpers.ts";
import { callGeminiWithRetry } from "../_shared/gemini-client.ts";
import { logUsage } from "../_shared/cost-tracking.ts";
import { checkQuota } from "../_shared/quota.ts";

const CALL_TYPE      = "delta_commentary" as const;
const MODEL          = "gemini-2.5-flash" as const;
const MAX_OUT_TOKENS = 4096;
const QUOTA_CEILING  = 10;

const SEVERITY_RANK: Record<string, number> = {
  mild:        1,
  moderate:    2,
  significant: 3,
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

// Decode the JWT payload without re-verifying — verify_jwt=true on the
// function already enforced validation at the runtime boundary.
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

function isScanInput(v: unknown): v is DeltaScanInput {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  if (s.skin_concerns !== null && !Array.isArray(s.skin_concerns)) return false;
  if (s.skin_concerns_detailed !== undefined && !Array.isArray(s.skin_concerns_detailed)) return false;
  return true;
}

function validateRequest(body: unknown): GeminiDeltaCommentaryRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "body_must_be_object" };
  const b = body as Record<string, unknown>;

  if (!isScanInput(b.previousScan)) return { error: "previousScan_invalid" };
  if (!isScanInput(b.currentScan))  return { error: "currentScan_invalid" };

  const delta = b.scanDelta as Record<string, unknown> | undefined;
  if (!delta || typeof delta !== "object") return { error: "scanDelta_required" };
  if (typeof delta.days_between !== "number" || !Number.isFinite(delta.days_between)) {
    return { error: "scanDelta.days_between_required" };
  }
  if (!Array.isArray(delta.concerns_improved))   return { error: "scanDelta.concerns_improved_required" };
  if (!Array.isArray(delta.concerns_new))        return { error: "scanDelta.concerns_new_required" };
  if (!Array.isArray(delta.concerns_persistent)) return { error: "scanDelta.concerns_persistent_required" };

  if (typeof b.scanNumber !== "number" || !Number.isFinite(b.scanNumber)) {
    return { error: "scanNumber_required" };
  }
  if (b.scanId != null && typeof b.scanId !== "string") {
    return { error: "scanId_must_be_string_or_null" };
  }

  return {
    previousScan: b.previousScan as DeltaScanInput,
    currentScan:  b.currentScan  as DeltaScanInput,
    scanDelta: {
      days_between:        delta.days_between as number,
      concerns_improved:   delta.concerns_improved   as string[],
      concerns_new:        delta.concerns_new        as string[],
      concerns_persistent: delta.concerns_persistent as string[],
    },
    scanNumber: b.scanNumber as number,
    scanId:     (b.scanId as string | null | undefined) ?? null,
  };
}

// Mirrors lib/gemini/delta.ts:217-226 — concerns flagged "persistent" whose
// severity rank rose between previous and current count as "worsened" for
// the prompt's purposes.
function computeWorsened(
  previousDetailed:    SkinConcernObservation[],
  currentDetailed:     SkinConcernObservation[],
  concerns_persistent: string[],
): string[] {
  const worsened: string[] = [];
  for (const c of concerns_persistent) {
    const prev = previousDetailed.find((x) => x.concern === c);
    const curr = currentDetailed.find((x) => x.concern === c);
    if (!prev || !curr) continue;
    const prevRank = SEVERITY_RANK[prev.severity] ?? 0;
    const currRank = SEVERITY_RANK[curr.severity] ?? 0;
    if (currRank > prevRank) worsened.push(c);
  }
  return worsened;
}

function passesSchemaSanity(p: GeminiDeltaCommentaryResponse): boolean {
  if (typeof p.cover_dek !== "string" || !p.cover_dek.trim()) return false;
  if (!Array.isArray(p.cover_lines) || p.cover_lines.length !== 3) return false;
  if (!p.concern_notes || typeof p.concern_notes !== "object") return false;
  if (typeof p.closing_line !== "string" || !p.closing_line.trim()) return false;
  return true;
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
  const request = validated as GeminiDeltaCommentaryRequest;

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

  // ─── Build prompt context (computes concerns_worsened) + Gemini body ────
  const previousDetailed = request.previousScan.skin_concerns_detailed ?? [];
  const currentDetailed  = request.currentScan.skin_concerns_detailed  ?? [];

  const ctx: DeltaScanContext = {
    scan_number:                request.scanNumber,
    days_between:               request.scanDelta.days_between,
    previous_concerns:          request.previousScan.skin_concerns ?? [],
    current_concerns:           request.currentScan.skin_concerns  ?? [],
    previous_concerns_detailed: previousDetailed,
    current_concerns_detailed:  currentDetailed,
    concerns_improved:          request.scanDelta.concerns_improved,
    concerns_persistent:        request.scanDelta.concerns_persistent,
    concerns_new:               request.scanDelta.concerns_new,
    concerns_worsened:          computeWorsened(
      previousDetailed, currentDetailed, request.scanDelta.concerns_persistent,
    ),
  };

  const geminiBody = {
    contents: [{ parts: [{ text: buildDeltaPrompt(ctx) }] }],
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

  // ─── Parse + schema sanity (§3 item 8 — 502 on failure, no partials) ───
  const cleaned = cleanJsonResponse(result.text);
  let parsed: GeminiDeltaCommentaryResponse;
  try {
    parsed = JSON.parse(cleaned) as GeminiDeltaCommentaryResponse;
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
