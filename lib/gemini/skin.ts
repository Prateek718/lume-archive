// Skin recommendations call (Gemini 2.5 Flash). Phase 6.2 split:
// observation moved to vision; this prompt now produces only the skin
// routine + advice + routine_note, keeping the JSON small.

import type { MatchedProduct, SkinRecommendation, RoutineStep } from '../../types';
import { logUsage } from '../geminiUsage';
import { normalizeConcern } from '../../constants/concerns';
import {
  ENDPOINT_TEXT_STREAM,
  RETRY_BACKOFF_MS,
  shouldRetry,
  MODEL_TEXT,
  VOICE_ANCHOR,
  EDITORIAL_RULES,
  CANONICAL_CATEGORY_LIST,
  streamGeminiSSE,
  tryParsePartialJson,
} from './shared';
import type { GeminiAnalysis } from './vision';

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════
function buildSkinPrompt(
  analysis:        GeminiAnalysis,
  matchedProducts: MatchedProduct[],
  ageRange:        string | null,
): string {
  const matchedSection = matchedProducts.length > 0
    ? `Ingredient categories pre-selected for this user:\n${
        matchedProducts.map(p =>
          `- ${p.category}${p.actives && p.actives.length > 0 ? ` (actives: ${p.actives.join(', ')})` : ''}`
        ).join('\n')
      }\n\nFor each, write a one-sentence clinical reason tying the category to this user's specific observations. Do not name a brand or specific product.`
    : '';

  const ageCtx = ageRange ? `\nAge range: ${ageRange}` : '';

  const skinBlock = `
SKIN ROUTINE — variable length.

Emit a single \`steps\` array (not separate morning/evening). Each step carries a time_of_day array.

ALWAYS-PRESENT STEPS (3 total):
  1. skin_cleanse    → label "Cleanse",    time_of_day ["am","pm"], category "face_cleanser"
  2. skin_moisturize → label "Moisturize", time_of_day ["am","pm"], category "moisturizer"
  3. skin_protect    → label "Protect",    time_of_day ["am"],      category "spf_sunscreen"

OPTIONAL TREAT STEPS — insert 0, 1, or 2 based on detected concerns. Each Treat step requires target_concern.
  Insert ONE (skin_treat_1) for a single primary concern.
  Insert TWO (skin_treat_1 + skin_treat_2) ONLY if two concerns need different actives that can't share a slot (e.g. salicylic acid AM + retinol PM).

TARGET CONCERNS — canonical enum, emit exact strings only:
  acne | oiliness | dehydration | dryness | sensitivity | uneven_texture | fine_lines |
  dullness | hyperpigmentation | uneven_tone | dark_circles | puffiness | dandruff |
  oily_scalp | dry_scalp | itchy_scalp | hair_fall | frizz | damage | dullness_hair |
  patchiness | rough_texture | itchiness_beard

Never emit synonyms like "post-acne marks", "sebum regulation", "skin thinning". Use canonical form.
Catalog scoring relies on exact string equality.

TIME-OF-DAY for actives:
  vitamin C, niacinamide, salicylic acid → ["am"] or ["am","pm"]
  retinol, AHA                           → ["pm"]
  hyaluronic acid                        → ["am","pm"]
  eye cream                              → ["pm"]

ORDER: 1=cleanse, 2=treat_1, 3=treat_2, 4=moisturize, 5=protect.

Never add retinol if age_range is '18-25' or unset.

SEVERITY ↔ INTENSITY mapping — read analysis.skin_concerns_detailed:
  mild        → gentler active, lower concentration, framed as maintenance
  moderate    → standard concentration, framed as consistent use over 8 weeks
  significant → stronger concentration or combined actives, framed with a realistic timeline and a suggestion to consult a dermatologist if no change in 12 weeks

clinical_reasoning — REQUIRED on every step. Reference the zones, severity, or traits from analysis. Never generic. Examples:
  Bad:  "Niacinamide is great for oily skin."
  Good: "Moderate T-zone oiliness with visible enlarged pores. Niacinamide regulates sebum and tightens pore appearance over 8 weeks of daily use."
  Bad:  "Sunscreen prevents sun damage."
  Good: "Fitzpatrick IV skin in Mumbai humidity is highly susceptible to PIH. Mineral SPF 50 blocks UV without occluding T-zone pores."

Step shape:
{
  "step_id":           "skin_cleanse" | "skin_treat_1" | "skin_treat_2" | "skin_moisturize" | "skin_protect",
  "label":             "Cleanse" | "Treat" | "Moisturize" | "Protect",
  "time_of_day":       ["am"] | ["pm"] | ["am","pm"],
  "order":             1 | 2 | 3 | 4 | 5,
  "target_concern":    "<concern>"           (REQUIRED for Treat steps, omit otherwise),
  "category":          one of the CANONICAL CATEGORY ENUM values,
  "clinical_reasoning": "1-2 sentences tied to this user's scan",
  "product":           generic descriptor (e.g. "Niacinamide serum")
}

ROUTINE NOTE (routine_note) — REQUIRED. A single editorial meta-observation
about the shape of the routine itself, rendered as a pulled quote in the UI.
Rules:
  - Voice: editorial, meta, observational — like an editor's footnote on the plan.
  - Length: 2-3 sentences, max ~160 characters total.
  - Can use first-person narrator voice sparingly ("we") — but NEVER "your" or "you".
  - Reads at a level above the individual steps: observes the approach, does not
    repeat what individual steps already say.
  - No medical claims. No trait-naming openings.
  - Examples of the register:
      "Keep it short. Five steps, done consistently, will outperform twelve steps done some of the time."
      "Layer slowly. Vitamin C wants a clean canvas; everything else follows."
      "Less, but every day. A routine you skip is not really a routine."
      "The order matters more than the ingredients. Build up from thin to thick."
`;

  const schemaBlock = `
OUTPUT JSON SHAPE (return ONLY valid JSON, no markdown, no preamble):
{
  "advice":       "max 2 sentences, first stands alone as preview, imperative",
  "routine_note": "2-3 sentences, max ~160 chars, editorial meta-observation. No 'your' or 'you'.",
  "steps":        [ ... ]
}`;

  const skinExample = `
FEW-SHOT — skin routine for combination skin with moderate dehydration (cheeks) + mild hyperpigmentation:

{
  "advice": "Lead with hydration — the cheeks show moderate surface lines, and plumping that barrier unlocks everything else. Layer a brightening active before the moisturiser to start softening the post-acne marks.",
  "routine_note": "Keep it short. Four steps, done consistently, will outperform twelve steps done some of the time.",
  "steps": [
    { "step_id": "skin_cleanse",   "label": "Cleanse",    "time_of_day": ["am","pm"], "order": 1, "category": "face_cleanser",          "clinical_reasoning": "Combination skin with a moderately dehydrated barrier on the cheeks. A low-pH gel cleanser lifts oil from the T-zone without stripping the cheeks.", "product": "Low-pH gel cleanser" },
    { "step_id": "skin_treat_1",   "label": "Treat",      "time_of_day": ["am"],      "order": 2, "target_concern": "hyperpigmentation", "category": "serum_vitamin_c",        "clinical_reasoning": "Two post-acne marks on the right cheek, rated mild. Vitamin C 10% nudges pigment turnover without provoking the already-dehydrated barrier.",           "product": "Vitamin C serum (10%)" },
    { "step_id": "skin_moisturize","label": "Moisturize", "time_of_day": ["am","pm"], "order": 4, "category": "moisturizer",            "clinical_reasoning": "Moderate fine surface lines on the cheeks. A hyaluronic-rich gel cream seals water into the stratum corneum through the day.",                    "product": "Hyaluronic gel cream" },
    { "step_id": "skin_protect",   "label": "Protect",    "time_of_day": ["am"],      "order": 5, "category": "spf_sunscreen",          "clinical_reasoning": "Fitzpatrick IV in Mumbai — high PIH risk on any unprotected pigment. SPF 50 with iron oxides shields visible light too.",                      "product": "Mineral SPF 50" }
  ]
}`;

  return `${VOICE_ANCHOR}

${EDITORIAL_RULES}

USER CONTEXT:${ageCtx}
Analysis JSON: ${JSON.stringify(analysis)}

${matchedSection}

CANONICAL CATEGORY ENUM — every "category" field on every step MUST be one of:
${CANONICAL_CATEGORY_LIST}
Use these IDs verbatim. Never invent new categories or use synonyms.

step_id values are stable keys for adherence tracking — they must match the documented format EXACTLY.
${skinBlock}
${schemaBlock}
${skinExample}
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// getSkinRecommendations — focused skin call. Returns SkinRecommendation only.
// ═══════════════════════════════════════════════════════════════════════════════
export async function getSkinRecommendations(
  analysis:        GeminiAnalysis,
  matchedProducts: MatchedProduct[],
  ageRange:        string | null,
  options?: {
    onPartial?: (partial: Partial<SkinRecommendation>) => void;
    scanId?:    string | null;
  },
): Promise<SkinRecommendation> {
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
      console.warn(`[gemini skin_recs] retry attempt 2/2 after ${RETRY_BACKOFF_MS}ms (finish_reason: ${lastFinishReason ?? 'unknown'})`);
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
    }

    try {
      const body: RequestInit = {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: buildSkinPrompt(analysis, matchedProducts, ageRange),
            }],
          }],
          generationConfig: {
            temperature:     0,
            // Bumped from 2500 — observed real-world MAX_TOKENS truncation on
            // rescans with rich previous-scan context. Skin output: advice +
            // routine_note + up to 5 steps with full clinical_reasoning ≈
            // 3500-4500 tokens. 6144 gives 1.5x buffer.
            maxOutputTokens: 6144,
          },
        }),
      };

      const onPartialText = options?.onPartial
        ? (accumulated: string) => {
            const maybe = tryParsePartialJson(accumulated);
            if (maybe && typeof maybe === 'object') {
              options.onPartial!(maybe as Partial<SkinRecommendation>);
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
          `Gemini skin response was truncated — increase maxOutputTokens. Last 100 chars: ${text.slice(-100)}`,
        );
      }

      const parsed = JSON.parse(text) as SkinRecommendation;

      // Normalize target_concern on every step to the canonical enum.
      // Catalog scoring relies on exact string equality against CANONICAL_CONCERNS;
      // an un-normalizable value would silently miss the +15 target-match boost,
      // so drop the field in that case rather than let a mystery string through.
      const normalizeSteps = (steps: RoutineStep[] | undefined) => {
        if (!steps) return;
        for (const step of steps) {
          if (!step.target_concern) continue;
          const raw = step.target_concern;
          const normalized = normalizeConcern(raw);
          if (normalized) {
            step.target_concern = normalized;
          } else {
            console.warn(`[gemini skin] unrecognised target_concern "${raw}" — dropping`);
            delete step.target_concern;
          }
        }
      };
      normalizeSteps(parsed.steps);

      // Fallback for routine_note — derive from first sentence of advice.
      if (!parsed.routine_note || !parsed.routine_note.trim()) {
        const advice = parsed.advice ?? '';
        const firstSentence = advice.match(/^[^.!?]*[.!?]/)?.[0]?.trim();
        parsed.routine_note = firstSentence && firstSentence.length > 0
          ? firstSentence
          : 'A short, consistent routine beats a long inconsistent one.';
      }

      void logUsage({
        callType:     'skin_recs',
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
      console.warn(`[gemini skin_recs] attempt ${attempt} failed: ${msg} (finish_reason: ${lastFinishReason ?? 'unknown'})`);

      // Decide whether retry could plausibly help. If not, fall through to
      // exhausted-failure path immediately.
      if (attempt === 1) {
        if (!shouldRetry(err, lastFinishReason)) {
          console.warn(`[gemini skin_recs] failure is deterministic — not retrying`);
          break;
        }
        didRetry = true;
        continue;
      }
      // Attempt 2 failed — fall through.
    }
  }

  const exhaustedMsg = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[gemini skin_recs EXHAUSTED]`, JSON.stringify({
    attempts:             didRetry ? 2 : 1,
    last_error:           exhaustedMsg,
    last_finish_reason:   lastFinishReason ?? 'unknown',
    last_safety_ratings:  lastSafetyRatings ?? null,
    last_response_length: lastRawResponse.length,
    last_response_tail:   lastRawResponse.slice(-500),
    scan_id:              options?.scanId ?? null,
  }, null, 2));

  void logUsage({
    callType:     'skin_recs',
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
