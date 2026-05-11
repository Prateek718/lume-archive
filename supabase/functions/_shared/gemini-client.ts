// Server-side Gemini client. Single source of retry logic per §9 of the
// architecture doc. Two attempts max, classified by shouldRetry. Never logs
// the URL or full prompt — only token counts + finish_reason.

import type { ModelName } from "./types.ts";

export interface GeminiCallResult {
  text:          string;
  inputTokens:   number;
  outputTokens: number;
  finishReason:  string | null;
  safetyRatings: unknown | null;
}

// Classify whether a failure is plausibly transient and worth one retry.
// Mirrors lib/gemini/shared.ts:40-84 verbatim. Returns true ONLY for
// transient failures; deterministic Gemini-side stops (MAX_TOKENS, SAFETY,
// RECITATION, BLOCKLIST) are never retried.
export function shouldRetry(
  err:          unknown,
  finishReason: string | null,
): boolean {
  if (
    finishReason === "MAX_TOKENS" ||
    finishReason === "SAFETY"     ||
    finishReason === "RECITATION" ||
    finishReason === "BLOCKLIST"
  ) {
    return false;
  }

  const msg = err instanceof Error ? err.message : String(err);

  if (/Gemini.*error.*5\d\d/.test(msg) || /Gemini.*error.*429/.test(msg)) {
    return true;
  }
  if (
    msg.includes("Network request failed") ||
    msg.includes("fetch failed")           ||
    msg.includes("network")
  ) {
    return true;
  }
  if (msg.includes("JSON Parse") || msg.includes("JSON.parse")) {
    return true;
  }
  if (msg.includes("empty response") || msg.includes("Gemini returned empty")) {
    return true;
  }

  return false;
}

// Single non-streaming :generateContent call. Throws on non-2xx or empty
// response. Carries finishReason on thrown errors so callers (and retries)
// can classify.
export async function callGemini(
  model:           ModelName,
  body:            object,
  _maxOutputTokens: number,
): Promise<GeminiCallResult> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set in function environment");
  }

  // Build URL via searchParams so the key is never interpolated into a
  // string that could later be logged. (§13.2)
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  );
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 500)}`);
  }

  const json = await response.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const inputTokens   = json?.usageMetadata?.promptTokenCount     ?? 0;
  const outputTokens  = json?.usageMetadata?.candidatesTokenCount ?? 0;
  const finishReason  = json?.candidates?.[0]?.finishReason       ?? null;
  const safetyRatings = json?.candidates?.[0]?.safetyRatings      ?? null;

  if (!text || !text.includes("{")) {
    const err: Error & { finishReason?: string | null } = new Error(
      `Gemini returned empty or non-JSON response (finish_reason: ${finishReason ?? "unknown"})`,
    );
    err.finishReason = finishReason;
    throw err;
  }

  return { text, inputTokens, outputTokens, finishReason, safetyRatings };
}

// Two-attempt loop with jittered backoff. Re-attempts only if shouldRetry
// returns true for the first failure.
export async function callGeminiWithRetry(
  model:           ModelName,
  body:            object,
  maxOutputTokens: number,
): Promise<GeminiCallResult> {
  let lastErr:          unknown = null;
  let lastFinishReason: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      const backoff = 1500 + Math.floor(Math.random() * 500) - 250;
      await new Promise((r) => setTimeout(r, backoff));
    }
    try {
      return await callGemini(model, body, maxOutputTokens);
    } catch (err) {
      lastErr = err;
      lastFinishReason = (err as { finishReason?: string | null }).finishReason ?? null;
      if (attempt === 1 && !shouldRetry(err, lastFinishReason)) break;
    }
  }

  const finalErr = lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr));
  (finalErr as Error & { finishReason?: string | null }).finishReason = lastFinishReason;
  throw finalErr;
}
