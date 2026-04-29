// Shared utilities for the Gemini pipelines.
// Constants, helpers, streaming, palette lookup, and editorial copy rules
// are kept here so each per-section prompt module stays focused on its
// own schema and few-shot examples.

import type { Undertone, DepthTier } from '../../types';
import type { ModelName } from '../geminiUsage';

// ── Endpoints & model IDs ─────────────────────────────────────────────────────
export const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY!;

export const MODEL_VISION: ModelName = 'gemini-2.5-pro';
export const MODEL_TEXT:   ModelName = 'gemini-2.5-flash';

export const ENDPOINT             = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_VISION}:generateContent?key=${API_KEY}`;
export const ENDPOINT_TEXT        = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEXT}:generateContent?key=${API_KEY}`;
export const ENDPOINT_TEXT_STREAM = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEXT}:streamGenerateContent?alt=sse&key=${API_KEY}`;

// ── Outer retry budget ────────────────────────────────────────────────────────
// Outer retry budget: at most ONE retry, only when the failure could
// plausibly recover. Determined by error classification (see shouldRetry
// helper below). Replaces Phase 6.1's blanket 3-attempt loop, which wasted
// compute on deterministic Gemini-side failures (MAX_TOKENS, SAFETY).
export const RETRY_BACKOFF_MS = 1500;

// Classify whether a failure is plausibly transient and worth one retry.
// Returns true ONLY for genuinely transient failure modes:
//   - HTTP 5xx / 429 / network errors (server-side or transport)
//   - JSON parse failure with no finish_reason (suggests transport truncation)
//
// Returns false for deterministic Gemini-side failures:
//   - finish_reason: MAX_TOKENS  (output cap exceeded — same call, same result)
//   - finish_reason: SAFETY      (safety filter — same content rejected again)
//   - finish_reason: RECITATION  (recitation filter — same content rejected)
//   - finish_reason: BLOCKLIST   (blocked — same content blocked)
//   - finish_reason: STOP with JSON parse failure (malformed prompt, retry won't help)
//
// Schema validation failures after successful parse are NEVER retried — those
// are prompt issues, not transport issues.
export function shouldRetry(
  err:           unknown,
  finishReason:  string | null,
): boolean {
  // Deterministic Gemini-side failures — never retry.
  if (finishReason === 'MAX_TOKENS' ||
      finishReason === 'SAFETY'     ||
      finishReason === 'RECITATION' ||
      finishReason === 'BLOCKLIST') {
    return false;
  }

  const msg = err instanceof Error ? err.message : String(err);

  // HTTP server errors and rate limits — transient.
  if (/Gemini.*error.*5\d\d/.test(msg) || /Gemini.*error.*429/.test(msg)) {
    return true;
  }

  // Network failures (no HTTP response) — transient.
  if (msg.includes('Network request failed') ||
      msg.includes('fetch failed')           ||
      msg.includes('network')) {
    return true;
  }

  // JSON parse failures — retry regardless of finish_reason. Gemini at
  // temperature=0 has minor tokenization stochasticity that occasionally
  // produces malformed characters in prose strings (e.g. unescaped quotes,
  // bad escape sequences). Retry usually succeeds. Real-world: Phase 6.2
  // testing hit "Unexpected character: e" on STOP-completed response;
  // a retry would have succeeded.
  if (msg.includes('JSON Parse') || msg.includes('JSON.parse')) {
    return true;
  }

  // Empty response — retry once. Could be transport hiccup.
  if (msg.includes('empty response') || msg.includes('Gemini returned empty')) {
    return true;
  }

  // Everything else (including STOP+parse_fail, schema validation, empty
  // response with completed finish_reason) is deterministic. Don't retry.
  return false;
}

// ── Canonical category enum ───────────────────────────────────────────────────
// Must stay in sync with constants/productConstants.ts CANONICAL_CATEGORIES.
// These values are stable keys — changing them breaks adherence tracking.
export const CANONICAL_CATEGORY_LIST = [
  'face_cleanser',
  'moisturizer',
  'serum_niacinamide',
  'serum_hyaluronic_acid',
  'serum_vitamin_c',
  'serum_retinol',
  'serum_salicylic_acid',
  'serum_azelaic_acid',
  'serum_brightening',
  'serum_soothing',
  'spf_sunscreen',
  'toner',
  'eye_cream',
  'face_mask',
  'face_oil',
  'face_gel',
  'beard_wash',
  'beard_oil',
  'beard_balm',
  'hair_shampoo',
  'hair_conditioner',
  'hair_oil',
  'hair_serum',
  'hair_mask',
  'brow_pencil',
  'concealer',
  'foundation_base',
  'bb_cream',
].join(', ');

// ═══════════════════════════════════════════════════════════════════════════════
// PALETTE SWATCHES — static lookup, not Gemini-generated
// ═══════════════════════════════════════════════════════════════════════════════
export const PALETTE_SWATCHES: Record<string, string[]> = {
  // WARM
  'warm-fair':         ['#f5d4b8', '#e8b48a', '#d19073', '#b8753f', '#8c5a2f', '#e8c9a8'],
  'warm-light_medium': ['#e8b48a', '#d19073', '#b8753f', '#c88960', '#8c5a2f', '#e0b59c'],
  'warm-medium':       ['#d19073', '#b8532f', '#8c4e3a', '#c68c6b', '#6b4a3a', '#e0b59c'],
  'warm-tan':          ['#b8753f', '#8c4e3a', '#6b3a28', '#a16a4a', '#7a3a20', '#c28968'],
  'warm-deep':         ['#6b3a28', '#4a2818', '#3a1e12', '#854a34', '#2a1208', '#a06a4e'],

  // COOL
  'cool-fair':         ['#f0d0d0', '#e5b5b5', '#d19595', '#c88080', '#a05050', '#f5e0e0'],
  'cool-light_medium': ['#e5b5b5', '#d19595', '#b87070', '#c88080', '#905050', '#e8c8c8'],
  'cool-medium':       ['#b87070', '#9e5858', '#7a4040', '#a86060', '#60302c', '#c89090'],
  'cool-tan':          ['#9e5858', '#7a4040', '#60302c', '#8c4840', '#4a2420', '#a86868'],
  'cool-deep':         ['#60302c', '#4a2420', '#321810', '#7a3a34', '#1f0c08', '#8e5048'],

  // NEUTRAL
  'neutral-fair':         ['#f0d8c5', '#e0c0a5', '#c89878', '#b08560', '#8c6848', '#e8ccb5'],
  'neutral-light_medium': ['#e0c0a5', '#c89878', '#b08560', '#a07858', '#805838', '#d8b89a'],
  'neutral-medium':       ['#c89878', '#a87858', '#805838', '#b08868', '#604828', '#d0a888'],
  'neutral-tan':          ['#a87858', '#805838', '#604828', '#906850', '#402818', '#b09078'],
  'neutral-deep':         ['#604828', '#402818', '#2c1808', '#805040', '#18100c', '#907060'],
};

export function fitzpatrickToDepthTier(fitzpatrick: number | null | undefined): DepthTier | null {
  if (fitzpatrick == null) return null;
  if (fitzpatrick <= 2)   return 'fair';
  if (fitzpatrick === 3)  return 'light_medium';
  if (fitzpatrick === 4)  return 'medium';
  if (fitzpatrick === 5)  return 'tan';
  if (fitzpatrick === 6)  return 'deep';
  return null;
}

export function getPaletteSwatches(
  undertone:   Undertone | null | undefined,
  fitzpatrick: number | null | undefined,
): string[] | null {
  const tier = fitzpatrickToDepthTier(fitzpatrick);
  if (!undertone || !tier) return null;
  return PALETTE_SWATCHES[`${undertone}-${tier}`] ?? null;
}

// Re-export type aliases for callers that don't want to import from types/ twice.
export type { Undertone, DepthTier };

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE ANCHOR + EDITORIAL RULES — shared across every prompt
// ═══════════════════════════════════════════════════════════════════════════════
export const VOICE_ANCHOR = `You are Lumé — an unhurried, editorial observer of Indian skin and faces. Your tone is that of a thoughtful print magazine, not a dermatology dashboard. You notice specifics before you classify. You frame observations as traits to work with, not flaws to fix. You never use the words "prescription," "AI," or marketing superlatives like "amazing" or "perfect." Your writing has quiet authority — confident enough to be specific, humble enough to acknowledge limits.`;

export const EDITORIAL_RULES = `Voice rules, apply to every text field:

1. Never begin a field with "Your", "With your", "For your", or any phrase naming a user trait. The app already knows.

2. Imperative voice for actionable copy. "Do X" not "You should do X."

3. Every field carries one idea. If two ideas compete, pick the stronger. Compression beats completeness.

4. advice: max 2 sentences. The FIRST sentence must stand alone as a preview.

5. clinical_reasoning: 1-2 sentences tied to this user's specific observations. Never generic. Reference zones, concerns, or traits you can see evidence of in the analysis JSON. If the user is in Mumbai, say Mumbai. If they have mild dehydration in the cheeks, say that.

6. Bad phrases that must never appear: "prescription", "amazing", "perfect", "holy grail", "life-changing", "game-changer", "miracle", "secret", "hack". Reject AI-sounding language. Reject superlatives.

7. Frame fixed traits as assets. Oval face is a gift, not a condition. Warm undertone is a palette, not a limitation.

8. Concerns are observations, not problems. "Dehydration is asking for attention" not "You have a dehydration problem."`;

// ── Ordinal + cardinal helpers ────────────────────────────────────────────────
// Used to build observation.title / issue_label deterministically rather than
// asking the model to format scan numbers.
export function ordinal(n: number): string {
  if (n === 1) return 'first';
  if (n === 2) return 'second';
  if (n === 3) return 'third';
  if (n === 4) return 'fourth';
  if (n === 5) return 'fifth';
  return `${n}th`;
}

export function cardinal(n: number): string {
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (n === 3) return 'three';
  if (n === 4) return 'four';
  if (n === 5) return 'five';
  return String(n);
}

// Detects sentences that name a categorical face shape. Used as defense in
// depth in observation cleanup — the prompt already forbids it but the model
// occasionally leaks one through.
export function faceShapeProse(): RegExp {
  return /\b(oval|round|square|heart|oblong|diamond|triangle)[\s-]+(face|facial|shape)\b/i;
}

export function stripFaceShapeSentences(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const cleaned = sentences.filter(s => !faceShapeProse().test(s));
  return cleaned.join(' ').replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING + JSON HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export interface StreamResult {
  text:           string;
  inputTokens:    number;
  outputTokens:   number;
  finishReason:   string | null;
  safetyRatings:  unknown | null;
}

// Attempts a streaming read via response.body.getReader. If the RN runtime
// doesn't expose a reader, falls back to a single text() read and parses the
// SSE frames from the buffered body. Returns accumulated text + token totals.
export async function streamGeminiSSE(
  url:           string,
  body:          RequestInit,
  onPartialText?: (accumulated: string) => void,
): Promise<StreamResult> {
  // Phase 6.2 — plain fetch. The Phase 6.1 outer retry loop (each call's
  // attempt loop) handles 503/429 by catching the thrown error and retrying.
  const response = await fetch(url, body);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini streaming error ${response.status}: ${error}`);
  }

  let accumulated      = '';
  let inputTokens      = 0;
  let outputTokens     = 0;
  let lastFinishReason: string | null = null;
  let lastSafetyRatings: unknown | null = null;

  const processLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('data:')) return;
    const jsonStr = trimmed.replace(/^data:\s*/, '');
    if (!jsonStr || jsonStr === '[DONE]') return;
    try {
      const evt = JSON.parse(jsonStr);
      const textDelta = evt?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof textDelta === 'string') {
        accumulated += textDelta;
        if (onPartialText) onPartialText(accumulated);
      }
      const usage = evt?.usageMetadata;
      if (usage) {
        inputTokens  = usage.promptTokenCount     ?? inputTokens;
        outputTokens = usage.candidatesTokenCount ?? outputTokens;
      }
      const finishReason = evt?.candidates?.[0]?.finishReason;
      if (finishReason) lastFinishReason = finishReason;
      const safety = evt?.candidates?.[0]?.safetyRatings;
      if (safety) lastSafetyRatings = safety;
    } catch (err) {
      console.warn('[gemini] Failed to parse SSE frame:', jsonStr.slice(0, 100), err);
    }
  };

  const reader = (response as unknown as { body?: { getReader?: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } }).body?.getReader?.();

  if (reader && typeof TextDecoder !== 'undefined') {
    const decoder = new TextDecoder();
    let buffer = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        processLine(line);
      }
    }
    if (buffer.trim().length > 0) processLine(buffer);
  } else {
    // RN fetch fallback: full-buffer read + per-line parse.
    const full = await response.text();
    const lines = full.split('\n');
    for (const line of lines) processLine(line);
  }

  const stripped = accumulated
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace  = stripped.lastIndexOf('}');
  const cleaned    = firstBrace !== -1 && lastBrace !== -1
    ? stripped.slice(firstBrace, lastBrace + 1)
    : stripped;

  return {
    text:          cleaned,
    inputTokens,
    outputTokens,
    finishReason:  lastFinishReason,
    safetyRatings: lastSafetyRatings,
  };
}

// Extract the largest valid JSON object from a possibly-truncated buffer.
// Returns null if no balanced object can be parsed.
export function tryParsePartialJson(raw: string): unknown | null {
  const stripped = raw
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  const first = stripped.indexOf('{');
  if (first === -1) return null;
  let depth = 0;
  let inString = false;
  let escape   = false;
  let lastClose = -1;
  for (let i = first; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { lastClose = i; break; }
    }
  }
  if (lastClose === -1) return null;
  try {
    return JSON.parse(stripped.slice(first, lastClose + 1));
  } catch {
    return null;
  }
}

// Strip markdown fences and narrow to the outermost JSON object.
export function cleanJsonResponse(raw: string): string {
  const stripped = raw
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace  = stripped.lastIndexOf('}');
  return firstBrace !== -1 && lastBrace !== -1
    ? stripped.slice(firstBrace, lastBrace + 1)
    : stripped;
}
