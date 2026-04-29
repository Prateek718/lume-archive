// Makeup recommendations call (Gemini 2.5 Flash). Phase 6.2 split.
// Produces only the makeup slice: advice, techniques, palette (or null
// when undertone/Fitzpatrick is missing).

import type { MakeupRecommendation } from '../../types';
import { logUsage } from '../geminiUsage';
import {
  ENDPOINT_TEXT_STREAM,
  RETRY_BACKOFF_MS,
  shouldRetry,
  MODEL_TEXT,
  VOICE_ANCHOR,
  EDITORIAL_RULES,
  fitzpatrickToDepthTier,
  getPaletteSwatches,
  streamGeminiSSE,
  tryParsePartialJson,
} from './shared';
import type { GeminiAnalysis } from './vision';

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════
function buildMakeupPrompt(analysis: GeminiAnalysis): string {
  const makeupBlock = `
MAKEUP OUTPUT — single-screen layout.

If analysis includes fitzpatrick_scale and skin_undertone, produce a \`palette\` object:
  - undertone:    echo from analysis ("warm" | "cool" | "neutral")
  - depth_tier:   derived from Fitzpatrick (handled in code — set to "medium" as a placeholder, it will be overwritten)
  - hero_line:    max 5 words, pattern "A {warmth}, {depth} palette." e.g. "A warm, medium palette."
  - trait_chips:  exactly 3 short tags, lowercase, 2-3 words each. [undertone label, depth label, flattering family]
  - prose:        2-3 sentences. First states the palette's character. Second names 2-3 families that harmonise. Optional third names what to avoid. Imperative, no trait-naming openings.
  - swatches:     EXACTLY 6 swatch objects covering a useful palette spread. Each object MUST have:
      - hex:          a 7-char "#RRGGBB" string. Hex must read true to the named category — foundation/concealer should sit in skin-tone family for the user's depth and undertone, lip in red/brown/pink family, blush in peach/rose family, eye/highlighter/bronzer in their natural family.
      - category:     one of "foundation" | "lip" | "blush" | "eye" | "highlighter" | "bronzer". Include a foundation and a lip in every palette; pick the other 4 from across the categories so the strip reads varied (do NOT return six lipsticks). A typical mix: 1 foundation, 1 concealer-or-bronzer, 1 blush, 1-2 lip, 1-2 eye/highlighter.
      - name:         3-5 words, searchable on Nykaa. Pattern: "{Warmth} {Family} {Category}" — e.g. "Warm Beige Foundation", "Terracotta Brick Lipstick", "Peach Rose Blush". Avoid brand names.
      - description:  2-3 sentences, italic-serif body voice. Why THIS shade flatters THIS user's undertone+depth. Reference the undertone/family explicitly. No clinical jargon.
      - search_query: a Nykaa-friendly search string. Pattern: "{name} india" — e.g. "warm beige foundation india", "terracotta brick lipstick india". Lowercase. Used to deep-link to Nykaa search.
  - shade_families: four strings, each 10-15 words:
      foundation: descriptor pointing at shade codes to look for (e.g. "W3 or warm medium golden").
      lip:        warm vs cool family guidance.
      blush:      warm vs cool family guidance.
      concealer:  one shade lighter than foundation, undertone-matched.

If either fitzpatrick_scale or skin_undertone is missing, set palette: null.

techniques: 2 short, concrete techniques — imperative voice, no trait-naming openings.
`;

  const schemaBlock = `
OUTPUT JSON SHAPE (return ONLY valid JSON, no markdown, no preamble):
{
  "advice":     "max 2 sentences, first stands alone as preview, imperative",
  "techniques": ["...", "..."],
  "palette":    { ... } | null
}`;

  const makeupExample = `
FEW-SHOT — warm, medium palette makeup output:

{
  "advice": "Lead with the undertone — warmth harmonises with the skin, coolness fights it. Keep every shade in the warm family and the whole look reads intentional.",
  "techniques": ["Tap cream products on with fingers for a lived-in finish", "Set only the T-zone, leave cheeks dewy"],
  "palette": {
    "undertone":  "warm",
    "depth_tier": "medium",
    "hero_line":  "A warm, medium palette.",
    "trait_chips": ["warm undertone", "medium depth", "yellow-gold flatters"],
    "prose": "The palette reads warm — gold, peach, brick, terracotta. Cool pinks and silvers fight this undertone and flatten the face. Keep every product in the warm family and the look self-harmonises.",
    "swatches": [
      { "hex": "#C58A6E", "category": "foundation",  "name": "Warm Medium Foundation",   "description": "A warm-medium base that matches the undertone without going pink. Sits true on the skin and disappears at the jawline.",                              "search_query": "warm medium foundation w3 india" },
      { "hex": "#A05A3D", "category": "bronzer",     "name": "Warm Terracotta Bronzer",  "description": "A red-brown bronze that warms the temples and cheekbones without going orange. Skip cool taupe — it goes ashy on this undertone.",                       "search_query": "warm terracotta bronzer india" },
      { "hex": "#E08F77", "category": "blush",       "name": "Peach Rose Blush",         "description": "Peach-rose lifts the warm undertone and reads natural in daylight. Mauves and cool pinks fight the warmth and flatten the cheek.",                          "search_query": "peach rose blush india" },
      { "hex": "#9C3A2D", "category": "lip",         "name": "Terracotta Brick Lipstick","description": "Brick terracotta is the workhorse — warm, grown-up, photographs well. Avoid blue-based reds and cool berries; they fight this skin.",                  "search_query": "terracotta brick lipstick india" },
      { "hex": "#B86A4E", "category": "lip",         "name": "Caramel Nude Lipstick",    "description": "A warm caramel nude for everyday — sits one shade richer than the lip's natural colour. Cool nudes turn grey on warm skin.",                                "search_query": "caramel nude lipstick india" },
      { "hex": "#D9A87A", "category": "highlighter", "name": "Champagne Gold Highlighter","description": "Champagne-gold flatters the warm undertone on the high cheekbone. Silver and pearl-white highlighters look chalky against this depth.",                  "search_query": "champagne gold highlighter india" }
    ],
    "shade_families": {
      "foundation": "Warm-toned bases. Look for W3 or 'warm medium golden' in any brand's range. Skip cool or pink labels.",
      "lip":        "Warm brick, terracotta, brown-red, caramel. Skip cool berry, plum, blue-based red.",
      "blush":      "Peach, coral, warm rose. Skip mauve and cool pink — they fight the warm undertone.",
      "concealer":  "One shade lighter than foundation, matched to warm undertone. A cool concealer on warm skin reads grey."
    }
  }
}`;

  return `${VOICE_ANCHOR}

${EDITORIAL_RULES}

USER CONTEXT:
Analysis JSON: ${JSON.stringify(analysis)}
${makeupBlock}
${schemaBlock}
${makeupExample}
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// getMakeupRecommendations
// ═══════════════════════════════════════════════════════════════════════════════
export async function getMakeupRecommendations(
  analysis:  GeminiAnalysis,
  options?: {
    onPartial?: (partial: Partial<MakeupRecommendation>) => void;
    scanId?:    string | null;
  },
): Promise<MakeupRecommendation> {
  const start      = Date.now();
  let inputTokens  = 0;
  let outputTokens = 0;

  let lastError:         unknown = null;
  let lastRawResponse    = '';
  let lastFinishReason:  string | null = null;
  let lastSafetyRatings: unknown | null = null;
  let didRetry          = false;

  // At most TWO attempts: initial + at most one conditional retry.
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      console.warn(`[gemini makeup_recs] retry attempt 2/2 after ${RETRY_BACKOFF_MS}ms (finish_reason: ${lastFinishReason ?? 'unknown'})`);
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
    }

    try {
      const body: RequestInit = {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: buildMakeupPrompt(analysis) }],
          }],
          generationConfig: {
            temperature:     0,
            // Makeup palette is the largest of the three sections (six swatches
            // with prose) — give it more headroom than skin/beard.
            maxOutputTokens: 3500,
          },
        }),
      };

      const onPartialText = options?.onPartial
        ? (accumulated: string) => {
            const maybe = tryParsePartialJson(accumulated);
            if (maybe && typeof maybe === 'object') {
              options.onPartial!(maybe as Partial<MakeupRecommendation>);
            }
          }
        : undefined;

      const { text, inputTokens: it, outputTokens: ot, finishReason, safetyRatings } =
        await streamGeminiSSE(ENDPOINT_TEXT_STREAM, body, onPartialText);
      inputTokens      += it;
      outputTokens     += ot;
      lastFinishReason  = finishReason ?? lastFinishReason;
      lastSafetyRatings = safetyRatings ?? lastSafetyRatings;

      if (!text) throw new Error('Gemini returned empty response');

      lastRawResponse = text;

      if (!text.endsWith('}')) {
        throw new Error(
          `Gemini makeup response was truncated — increase maxOutputTokens. Last 100 chars: ${text.slice(-100)}`,
        );
      }

      const parsed = JSON.parse(text) as MakeupRecommendation;

      // Validate palette swatches. New schema: 6 MakeupSwatch objects
      // ({hex, category, name, description, search_query}). If invalid, fall
      // back to the static hex lookup.
      if (parsed.palette) {
        const tier = fitzpatrickToDepthTier(analysis.fitzpatrick_scale);
        const raw = (parsed.palette as { swatches?: unknown }).swatches;
        const objectsValid =
          Array.isArray(raw) &&
          raw.length === 6 &&
          raw.every(
            (s: unknown) =>
              !!s &&
              typeof s === 'object' &&
              typeof (s as { hex?: unknown }).hex === 'string' &&
              typeof (s as { category?: unknown }).category === 'string' &&
              typeof (s as { name?: unknown }).name === 'string' &&
              typeof (s as { description?: unknown }).description === 'string' &&
              typeof (s as { search_query?: unknown }).search_query === 'string',
          );

        if (objectsValid) {
          parsed.palette = {
            ...parsed.palette,
            depth_tier: tier ?? parsed.palette.depth_tier,
          };
        } else {
          const fallback = getPaletteSwatches(
            parsed.palette.undertone,
            analysis.fitzpatrick_scale,
          );
          if (fallback) {
            parsed.palette = {
              ...parsed.palette,
              depth_tier: tier ?? parsed.palette.depth_tier,
              swatches: fallback,
            };
          } else {
            parsed.palette = null;
          }
        }
      }

      void logUsage({
        callType:     'makeup_recs',
        model:        MODEL_TEXT,
        inputTokens,
        outputTokens,
        durationMs:   Date.now() - start,
        success:      true,
        scanId:       options?.scanId ?? null,
      });

      return parsed;
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[gemini makeup_recs] attempt ${attempt} failed: ${msg} (finish_reason: ${lastFinishReason ?? 'unknown'})`);

      // Decide whether retry could plausibly help. If not, fall through to
      // exhausted-failure path immediately.
      if (attempt === 1) {
        if (!shouldRetry(err, lastFinishReason)) {
          console.warn(`[gemini makeup_recs] failure is deterministic — not retrying`);
          break;
        }
        didRetry = true;
        continue;
      }
      // Attempt 2 failed — fall through.
    }
  }

  const exhaustedMsg = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[gemini makeup_recs EXHAUSTED]`, JSON.stringify({
    attempts:             didRetry ? 2 : 1,
    last_error:           exhaustedMsg,
    last_finish_reason:   lastFinishReason ?? 'unknown',
    last_safety_ratings:  lastSafetyRatings ?? null,
    last_response_length: lastRawResponse.length,
    last_response_tail:   lastRawResponse.slice(-500),
    scan_id:              options?.scanId ?? null,
  }, null, 2));

  void logUsage({
    callType:     'makeup_recs',
    model:        MODEL_TEXT,
    inputTokens,
    outputTokens,
    durationMs:   Date.now() - start,
    success:      false,
    errorMessage: exhaustedMsg,
    scanId:       options?.scanId ?? null,
  });
  throw lastError instanceof Error ? lastError : new Error(exhaustedMsg);
}
