// gemini-hair-recs — Phase XIII-b edge function.
//
// POST-only, JWT-authenticated. Routes the hair recommendation call
// (gemini-2.5-flash) through the server. Hair recs are independent of
// scans — they regenerate when the user's hair_profile changes — so
// scanId may be null here in steady-state usage.
//
// Pattern mirrors gemini-delta-commentary:
//   1. Method check (POST only)
//   2. Decode caller JWT → user_id
//   3. Parse + validate body shape
//   4. Per-user-per-24h quota check (fail closed)
//   5. Build hair prompt server-side
//   6. callGeminiWithRetry (two attempts)
//   7. Parse + schema sanity check (502 on failure, no partials)
//   8. Fire-and-forget gemini_usage insert via EdgeRuntime.waitUntil
//   9. Return GeminiHairRecsResponse
//
// No post-processing — parsed JSON returned to the client directly.
//
// See docs/phase-xiii-architecture.md §1.5, §3, §7.2, §8.1, §9, §13.

import "@supabase/functions-js/edge-runtime.d.ts";

import type {
  GeminiHairRecsRequest,
  GeminiHairRecsResponse,
  HairProfile,
  MatchedProduct,
} from "../_shared/types.ts";
import { buildHairPrompt } from "../_shared/prompts.ts";
import { cleanJsonResponse } from "../_shared/helpers.ts";
import { callGeminiWithRetry } from "../_shared/gemini-client.ts";
import { logUsage } from "../_shared/cost-tracking.ts";
import { checkQuota } from "../_shared/quota.ts";

const CALL_TYPE      = "hair_recs" as const;
const MODEL          = "gemini-2.5-flash" as const;
const MAX_OUT_TOKENS = 8192;
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
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const payload = JSON.parse(atob(b64 + pad));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function isHairProfile(v: unknown): v is HairProfile {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  if (typeof p.hair_length !== "string") return false;
  if (typeof p.scalp_type  !== "string") return false;
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

function validateRequest(body: unknown): GeminiHairRecsRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "body_must_be_object" };
  const b = body as Record<string, unknown>;

  if (!isHairProfile(b.profile)) return { error: "profile_invalid" };
  if (b.faceShape != null && typeof b.faceShape !== "string") {
    return { error: "faceShape_must_be_string_or_null" };
  }
  if (typeof b.gender !== "string") return { error: "gender_required" };
  if (b.city != null && typeof b.city !== "string") {
    return { error: "city_must_be_string_or_null" };
  }
  if (b.budget !== "affordable" && b.budget !== "premium") {
    return { error: "budget_must_be_affordable_or_premium" };
  }
  if (!isMatchedProductArray(b.matchedProducts)) {
    return { error: "matchedProducts_invalid" };
  }
  if (b.scanId != null && typeof b.scanId !== "string") {
    return { error: "scanId_must_be_string_or_null" };
  }

  return {
    profile:         b.profile as HairProfile,
    faceShape:       (b.faceShape as string | null | undefined) ?? null,
    gender:          b.gender as string,
    city:            (b.city as string | null | undefined) ?? null,
    budget:          b.budget as "affordable" | "premium",
    matchedProducts: b.matchedProducts as MatchedProduct[],
    scanId:          (b.scanId as string | null | undefined) ?? null,
  };
}

function passesSchemaSanity(p: GeminiHairRecsResponse): boolean {
  if (typeof p.advice !== "string" || !p.advice.trim()) return false;
  if (!Array.isArray(p.styles)) return false;
  if (!Array.isArray(p.styles_detailed)) return false;
  if (typeof p.condition_explanation !== "string") return false;
  if (!Array.isArray(p.routine)) return false;
  if (!Array.isArray(p.products)) return false;
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
  const request = validated as GeminiHairRecsRequest;

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
    contents: [{ parts: [{ text: buildHairPrompt(request) }] }],
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
  let parsed: GeminiHairRecsResponse;
  try {
    parsed = JSON.parse(cleaned) as GeminiHairRecsResponse;
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
