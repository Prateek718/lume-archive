// gemini-vision — Phase XIII-a edge function.
//
// POST-only, JWT-authenticated. Routes the vision call (gemini-2.5-pro)
// through the server so the client never holds the Gemini API key.
//
// Pattern:
//   1. Method check (POST only)
//   2. Decode caller JWT → user_id
//   3. Parse + validate body shape
//   4. Per-user-per-24h quota check (fail closed)
//   5. Build vision prompt server-side
//   6. callGeminiWithRetry (two attempts)
//   7. Parse + sanitize observation
//   8. Fire-and-forget gemini_usage insert via EdgeRuntime.waitUntil
//   9. Return GeminiVisionResponse
//
// See docs/phase-xiii-architecture.md §1.1, §7.2, §8.1, §9, §13.

import "@supabase/functions-js/edge-runtime.d.ts";

import type {
  GeminiVisionRequest,
  GeminiVisionResponse,
  SkinConcernObservation,
  ScanObservation,
} from "../_shared/types.ts";
import { buildVisionPrompt } from "../_shared/prompts.ts";
import { cleanJsonResponse, sanitizeObservation } from "../_shared/helpers.ts";
import { callGeminiWithRetry } from "../_shared/gemini-client.ts";
import { logUsage } from "../_shared/cost-tracking.ts";
import { checkQuota } from "../_shared/quota.ts";

const CALL_TYPE      = "vision" as const;
const MODEL          = "gemini-2.5-pro" as const;
const MAX_OUT_TOKENS = 4096;
const QUOTA_CEILING  = 10;

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
    // base64url → base64
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const payload = JSON.parse(atob(b64 + pad));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function validateRequest(body: unknown): GeminiVisionRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "body_must_be_object" };
  const b = body as Record<string, unknown>;

  if (typeof b.imageBase64 !== "string" || b.imageBase64.length === 0) {
    return { error: "imageBase64_required" };
  }
  if (b.gender !== "man" && b.gender !== "woman") {
    return { error: "gender_must_be_man_or_woman" };
  }
  if (!Array.isArray(b.careCategories)) {
    return { error: "careCategories_required" };
  }
  if (typeof b.scanId !== "string" || b.scanId.length === 0) {
    return { error: "scanId_required" };
  }
  if (typeof b.scanNumber !== "number" || !Number.isFinite(b.scanNumber)) {
    return { error: "scanNumber_required" };
  }
  if (b.city != null && typeof b.city !== "string") {
    return { error: "city_must_be_string_or_null" };
  }
  if (b.ageRange != null && typeof b.ageRange !== "string") {
    return { error: "ageRange_must_be_string_or_null" };
  }
  if (b.previousScanSummary != null && typeof b.previousScanSummary !== "string") {
    return { error: "previousScanSummary_must_be_string_or_null" };
  }

  return {
    imageBase64:         b.imageBase64,
    city:                (b.city as string | null | undefined) ?? null,
    gender:              b.gender,
    careCategories:      b.careCategories as string[],
    ageRange:            (b.ageRange as string | null | undefined) ?? null,
    previousScanSummary: (b.previousScanSummary as string | null | undefined) ?? null,
    scanId:              b.scanId,
    scanNumber:          b.scanNumber,
  };
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
  const request = validated as GeminiVisionRequest;

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
      { "Retry-After": String(quota.resetSeconds) },
    );
  }
  if (!quota.ok) {
    return json(
      { error: "quota_exceeded" },
      429,
      { "Retry-After": String(quota.resetSeconds) },
    );
  }

  // ─── Build prompt + call Gemini ─────────────────────────────────────────
  const prompt = buildVisionPrompt(request);
  const geminiBody = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: "image/jpeg",
            data:       request.imageBase64,
          },
        },
        { text: prompt },
      ],
    }],
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
    // Fire-and-forget the failure row.
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

  // ─── Parse + sanitize ────────────────────────────────────────────────────
  const cleaned = cleanJsonResponse(result.text);
  let parsed: GeminiVisionResponse;
  try {
    parsed = JSON.parse(cleaned) as GeminiVisionResponse;
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
    return json({ error: `parse_failed: ${msg}`, finish_reason: result.finishReason }, 502);
  }

  // Derive legacy skin_concerns[] from the detailed array if missing.
  if (parsed.skin_concerns_detailed && parsed.skin_concerns_detailed.length > 0) {
    parsed.skin_concerns = parsed.skin_concerns_detailed.map(
      (o: SkinConcernObservation) => o.concern,
    );
    for (const c of parsed.skin_concerns_detailed) {
      if (!c.display_label || !c.display_label.trim()) {
        c.display_label = c.concern
          .split("_")
          .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      }
    }
  } else {
    parsed.skin_concerns_detailed = parsed.skin_concerns_detailed ?? [];
    parsed.skin_concerns = parsed.skin_concerns ?? [];
  }

  if (parsed.observation) {
    sanitizeObservation(parsed.observation as ScanObservation);
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
