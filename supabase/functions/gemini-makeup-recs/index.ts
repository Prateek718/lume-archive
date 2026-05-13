// gemini-makeup-recs — Phase XIII-b edge function.
//
// POST-only, JWT-authenticated. Routes the makeup recommendation call
// (gemini-2.5-flash) through the server.
//
// Pattern mirrors gemini-delta-commentary:
//   1. Method check (POST only)
//   2. Decode caller JWT → user_id
//   3. Parse + validate body shape
//   4. Per-user-per-24h quota check (fail closed)
//   5. Build makeup prompt server-side
//   6. callGeminiWithRetry (two attempts)
//   7. Parse + schema sanity check (502 on failure, no partials)
//   8. Palette validation: if Gemini returned 6 well-formed swatch objects
//      keep them; if not, fall back to the static PALETTE_SWATCHES hex strip;
//      if even that fails (no undertone or no fitzpatrick), set palette: null.
//      Always overwrite depth_tier from fitzpatrick_scale so the client never
//      depends on Gemini classifying depth correctly.
//   9. Fire-and-forget gemini_usage insert via EdgeRuntime.waitUntil
//  10. Return GeminiMakeupRecsResponse
//
// See docs/phase-xiii-architecture.md §1.4, §3 item 7, §7.2, §8.1, §9, §13.

import "@supabase/functions-js/edge-runtime.d.ts";

import type {
  GeminiMakeupRecsRequest,
  GeminiMakeupRecsResponse,
  GeminiVisionResponse,
  MakeupPalette,
} from "../_shared/types.ts";
import { buildMakeupPrompt } from "../_shared/prompts.ts";
import {
  cleanJsonResponse,
  fitzpatrickToDepthTier,
  getPaletteSwatches,
} from "../_shared/helpers.ts";
import { callGeminiWithRetry } from "../_shared/gemini-client.ts";
import { logUsage } from "../_shared/cost-tracking.ts";
import { checkQuota } from "../_shared/quota.ts";

const CALL_TYPE      = "makeup_recs" as const;
const MODEL          = "gemini-2.5-flash" as const;
const MAX_OUT_TOKENS = 6144;
const QUOTA_CEILING  = 10;

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
  const a = v as Record<string, unknown>;
  // Permissive — only require the fields the makeup prompt actually reads.
  return (
    "skin_undertone" in a &&
    "fitzpatrick_scale" in a
  );
}

function validateRequest(body: unknown): GeminiMakeupRecsRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "body_must_be_object" };
  const b = body as Record<string, unknown>;

  if (!isVisionResponse(b.analysis)) return { error: "analysis_invalid" };
  if (b.scanId != null && typeof b.scanId !== "string") {
    return { error: "scanId_must_be_string_or_null" };
  }

  return {
    analysis: b.analysis as GeminiVisionResponse,
    scanId:   (b.scanId as string | null | undefined) ?? null,
  };
}

function passesSchemaSanity(p: GeminiMakeupRecsResponse): boolean {
  if (typeof p.advice !== "string" || !p.advice.trim()) return false;
  if (!Array.isArray(p.techniques)) return false;
  if (p.palette !== null && (typeof p.palette !== "object")) return false;
  return true;
}

// Mirrors lib/gemini/makeup.ts:172-212 verbatim. If Gemini returned six
// well-formed swatch objects keep them; otherwise fall back to the static
// PALETTE_SWATCHES hex strip; if even that fails (undertone or fitzpatrick
// absent) set palette to null. depth_tier is overwritten from the user's
// fitzpatrick_scale on every code path so the client never depends on
// Gemini classifying depth correctly.
function normalisePalette(
  palette: MakeupPalette | null,
  fitzpatrick: number | null | undefined,
): MakeupPalette | null {
  if (!palette) return null;

  const tier = fitzpatrickToDepthTier(fitzpatrick);
  const raw = (palette as { swatches?: unknown }).swatches;
  const objectsValid =
    Array.isArray(raw) &&
    raw.length === 6 &&
    raw.every(
      (s: unknown) =>
        !!s &&
        typeof s === "object" &&
        typeof (s as { hex?: unknown }).hex === "string" &&
        typeof (s as { category?: unknown }).category === "string" &&
        typeof (s as { name?: unknown }).name === "string" &&
        typeof (s as { description?: unknown }).description === "string" &&
        typeof (s as { search_query?: unknown }).search_query === "string",
    );

  if (objectsValid) {
    return {
      ...palette,
      depth_tier: tier ?? palette.depth_tier,
    };
  }

  const fallback = getPaletteSwatches(palette.undertone, fitzpatrick);
  if (fallback) {
    return {
      ...palette,
      depth_tier: tier ?? palette.depth_tier,
      swatches:   fallback,
    };
  }

  return null;
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
  const request = validated as GeminiMakeupRecsRequest;

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
    contents: [{ parts: [{ text: buildMakeupPrompt(request) }] }],
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
  let parsed: GeminiMakeupRecsResponse;
  try {
    parsed = JSON.parse(cleaned) as GeminiMakeupRecsResponse;
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

  // ─── Palette post-processing (§3 item 7) ────────────────────────────────
  parsed.palette = normalisePalette(parsed.palette, request.analysis.fitzpatrick_scale);

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
