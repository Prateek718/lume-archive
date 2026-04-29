// Beard recommendations call (Gemini 2.5 Flash). Phase 6.2 split.
// Produces only the beard slice: advice, beard_shape_intro (or null), routine
// steps (beard_wash / beard_oil / beard_balm), and 2-3 recommended styles.

import type { BeardGoal, BeardRecommendation } from '../../types';
import { logUsage } from '../geminiUsage';
import {
  ENDPOINT_TEXT_STREAM,
  RETRY_BACKOFF_MS,
  shouldRetry,
  MODEL_TEXT,
  VOICE_ANCHOR,
  EDITORIAL_RULES,
  CANONICAL_CATEGORY_LIST,
  faceShapeProse,
  streamGeminiSSE,
  tryParsePartialJson,
} from './shared';
import type { GeminiAnalysis } from './vision';

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════
function buildBeardPrompt(
  analysis:  GeminiAnalysis,
  beardGoal: BeardGoal | null,
): string {
  const beardBlock = `
BEARD ROUTINE.

Pick steps from these stable step_ids ONLY: beard_wash, beard_oil, beard_balm.
Each step needs: { step_id, label, product (generic descriptor), order, clinical_reasoning }.

Steps + emphasis depend on beard_goal:
  fuller   → [beard_wash, beard_oil]
             Conditioning + volumising oils (argan, jojoba). Reasoning should
             frame patience honestly — beard fullness is largely genetic; the oil
             keeps existing hairs healthy and the skin underneath calm so growth
             that does happen is supported. Do NOT promise new follicle growth.
  sharper  → [beard_wash, beard_oil, beard_balm]
             Balm carries the styling/edge-shaping reasoning. Mention shaping
             with a comb or trimmer for the line work — products alone do not
             make edges sharp.
  shorter  → [beard_wash]
             Minimal routine. Light wash 2-3× a week, optional lightweight oil
             if skin is dry. Frame as low-maintenance upkeep.
  longer   → [beard_wash, beard_oil]
             Conditioning oil to keep length soft and reduce breakage as it
             grows. Reasoning should set patience (length takes months) and
             advise against frequent trimming.
  none     → [beard_wash]
             Default maintenance only. Wash + optional light oil if dry.

beard_styles: 2-3 RECOMMENDED styles only. No "avoid" entries.
Each: { "name", "why" (max 18 words, imperative, no trait-naming opening), "maintenance": "low"|"medium"|"high" }

beard_shape_intro: Optional. 1-2 sentence personalized bridge connecting scan
observations to the suggested beard shape. Example: "Given the patchiness on
your cheeks and the clean line of your jaw, here's a shape that suits you."
Sets up the suggestion without revealing the suggestion itself. Reference
scan-specific traits (density, patchiness, jaw, etc.) but NOT face_shape directly.

Rules for beard_shape_intro:
  - 1-2 sentences max, ~140 chars total.
  - References specifics from analysis (beard_density, zones with patchiness, etc.).
  - Does NOT mention face_shape categorically (oval, round, square, heart, oblong, diamond, triangle).
  - Voice: editorial, sets up a suggestion that hasn't been revealed yet.
  - End with "...here's a shape that suits you." or a similar transitional phrase.
  - If you cannot ground it in specific scan traits without naming face_shape, return null.

clinical_reasoning — REQUIRED on every step. 1-2 sentences tying the step to
beard_density, beard_condition, or zones from the analysis. Never generic.
`;

  const schemaBlock = `
OUTPUT JSON SHAPE (return ONLY valid JSON, no markdown, no preamble):
{
  "advice":             "max 2 sentences, first stands alone as preview, imperative",
  "beard_shape_intro":  "1-2 sentence bridge or null",
  "steps": [
    { "step_id": "beard_wash" | "beard_oil" | "beard_balm", "label": "...", "product": "...", "order": 1|2|3, "category": "<canonical>", "clinical_reasoning": "..." }
  ],
  "beard_styles": [
    { "name": "...", "why": "max 18 words", "maintenance": "low"|"medium"|"high" }
  ]
}`;

  const beardExample = `
FEW-SHOT — medium-density beard, beard_goal "sharper":

{
  "advice": "Sharpen the lines first — the cheeks are full enough that a defined edge does most of the work. Wash, condition, then shape with balm before any trim.",
  "beard_shape_intro": "Given the medium density across the cheeks and the clean line of your jaw, here's a shape that suits you.",
  "steps": [
    { "step_id": "beard_wash", "label": "Wash",   "product": "Beard wash",  "category": "beard_wash", "order": 1, "clinical_reasoning": "Medium density traps sebum at the skin underneath. A weekly beard-specific wash keeps the skin calm without stripping the hair." },
    { "step_id": "beard_oil",  "label": "Nourish","product": "Beard oil",   "category": "beard_oil",  "order": 2, "clinical_reasoning": "Argan-based oil softens medium-density hair and conditions the underlying skin so the line work reads cleaner." },
    { "step_id": "beard_balm", "label": "Style",  "product": "Beard balm",  "category": "beard_balm", "order": 3, "clinical_reasoning": "A light beard balm holds shape across the cheek line. Pair with a comb or trimmer once a week — products alone do not sharpen edges." }
  ],
  "beard_styles": [
    { "name": "Defined corporate beard", "why": "Crisp cheek line and a square jaw line read intentional in any setting.", "maintenance": "medium" },
    { "name": "Short stubble fade",      "why": "Faded jaw line softens the corner without losing definition.",            "maintenance": "low" }
  ]
}`;

  return `${VOICE_ANCHOR}

${EDITORIAL_RULES}

USER CONTEXT:
beard_goal: ${beardGoal ?? 'none (default — light maintenance only)'}
Analysis JSON: ${JSON.stringify(analysis)}

CANONICAL CATEGORY ENUM — every "category" field must be one of:
${CANONICAL_CATEGORY_LIST}

step_id values are stable keys for adherence tracking — they must match the documented format EXACTLY.
${beardBlock}
${schemaBlock}
${beardExample}
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// getBeardRecommendations
// ═══════════════════════════════════════════════════════════════════════════════
export async function getBeardRecommendations(
  analysis:  GeminiAnalysis,
  beardGoal: BeardGoal | null,
  options?: {
    onPartial?: (partial: Partial<BeardRecommendation>) => void;
    scanId?:    string | null;
  },
): Promise<BeardRecommendation> {
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
      console.warn(`[gemini beard_recs] retry attempt 2/2 after ${RETRY_BACKOFF_MS}ms (finish_reason: ${lastFinishReason ?? 'unknown'})`);
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
    }

    try {
      const body: RequestInit = {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: buildBeardPrompt(analysis, beardGoal) }],
          }],
          generationConfig: {
            temperature:     0,
            // Bumped from 2000 — observed MAX_TOKENS at 996 tokens. Beard
            // output: advice + beard_shape_intro + 3 steps with
            // clinical_reasoning + 2-3 beard_styles ≈ 1500-2500 tokens.
            // 4096 gives 1.6x buffer.
            maxOutputTokens: 4096,
          },
        }),
      };

      const onPartialText = options?.onPartial
        ? (accumulated: string) => {
            const maybe = tryParsePartialJson(accumulated);
            if (maybe && typeof maybe === 'object') {
              options.onPartial!(maybe as Partial<BeardRecommendation>);
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
          `Gemini beard response was truncated — increase maxOutputTokens. Last 100 chars: ${text.slice(-100)}`,
        );
      }

      const parsed = JSON.parse(text) as BeardRecommendation;

      // Sanitize beard_shape_intro — null it out if missing/blank, or if it
      // names a categorical face_shape (which the prompt explicitly forbids).
      const intro = parsed.beard_shape_intro;
      if (typeof intro !== 'string' || intro.trim().length === 0) {
        parsed.beard_shape_intro = null;
      } else if (faceShapeProse().test(intro)) {
        parsed.beard_shape_intro = null;
      } else {
        parsed.beard_shape_intro = intro.trim();
      }

      void logUsage({
        callType:     'beard_recs',
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
      console.warn(`[gemini beard_recs] attempt ${attempt} failed: ${msg} (finish_reason: ${lastFinishReason ?? 'unknown'})`);

      // Decide whether retry could plausibly help. If not, fall through to
      // exhausted-failure path immediately.
      if (attempt === 1) {
        if (!shouldRetry(err, lastFinishReason)) {
          console.warn(`[gemini beard_recs] failure is deterministic — not retrying`);
          break;
        }
        didRetry = true;
        continue;
      }
      // Attempt 2 failed — fall through.
    }
  }

  const exhaustedMsg = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[gemini beard_recs EXHAUSTED]`, JSON.stringify({
    attempts:             didRetry ? 2 : 1,
    last_error:           exhaustedMsg,
    last_finish_reason:   lastFinishReason ?? 'unknown',
    last_safety_ratings:  lastSafetyRatings ?? null,
    last_response_length: lastRawResponse.length,
    last_response_tail:   lastRawResponse.slice(-500),
    scan_id:              options?.scanId ?? null,
  }, null, 2));

  void logUsage({
    callType:     'beard_recs',
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
