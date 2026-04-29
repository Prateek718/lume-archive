// Hair recommendations call (Gemini 2.5 Flash). Phase 6.2: moved from
// lib/gemini.ts into the per-section folder. Hair is generated separately
// from the scan-driven trio (skin/beard/makeup) — it lives at the user
// level and only regenerates when the hair_profile changes.

import type { HairProfile, HairRecommendations, MatchedProduct } from '../../types';
import { isBaldProfile } from '../../types';
import { logUsage } from '../geminiUsage';
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

// ═══════════════════════════════════════════════════════════════════════════════
// HAIR RECS PROMPT
// ═══════════════════════════════════════════════════════════════════════════════
function buildHairRecsPrompt(
  profile:         HairProfile,
  faceShape:       string | null,
  gender:          string,
  city:            string | null,
  budget:          string,
  matchedProducts: MatchedProduct[],
): string {
  const bald = isBaldProfile(profile);

  const washLabel: Record<string, string> = {
    daily:            'Daily',
    every_2_3_days:   'Every 2–3 days',
    once_a_week:      'Once a week',
    less_than_weekly: 'Less than once a week',
  };

  const userCtx = bald
    ? [
        'Hair length: Bald / Shaved',
        `Scalp type: ${profile.scalp_type}`,
        profile.scalp_concern ? `Scalp concern: ${profile.scalp_concern}` : null,
        faceShape ? `Face shape: ${faceShape}` : null,
        city ? `City: ${city} — factor in local climate, humidity, and pollution.` : null,
        budget === 'affordable'
          ? 'Budget: Affordable — recommend products under ₹500'
          : 'Budget: Premium — recommend products ₹500 and above',
        `Gender: ${gender}`,
      ].filter(Boolean).join('\n')
    : [
        `Hair length: ${profile.hair_length ?? 'not specified'}`,
        `Scalp type: ${profile.scalp_type}`,
        `Primary concern: ${Array.isArray(profile.primary_concern) && profile.primary_concern.length > 0 ? profile.primary_concern.join(', ') : 'none'}`,
        `Hair texture: ${profile.texture ?? 'not specified'}`,
        `Wash frequency: ${profile.wash_frequency ? (washLabel[profile.wash_frequency] ?? profile.wash_frequency) : 'not specified'}`,
        `Oils hair regularly: ${profile.oils_regularly != null ? (profile.oils_regularly ? 'Yes' : 'No') : 'not specified'}`,
        `Chemical treatments: ${profile.chemically_treated ?? 'none'}`,
        faceShape ? `Face shape: ${faceShape}` : null,
        city ? `City: ${city} — factor in local climate, humidity, and pollution.` : null,
        budget === 'affordable'
          ? 'Budget: Affordable — recommend products under ₹500'
          : 'Budget: Premium — recommend products ₹500 and above',
        `Gender: ${gender}`,
      ].filter(Boolean).join('\n');

  const matchedSection = matchedProducts.length > 0
    ? `Ingredient categories pre-selected for this user:\n${matchedProducts.map(p =>
        `- ${p.category}${p.actives && p.actives.length > 0 ? ` (actives: ${p.actives.join(', ')})` : ''}`
      ).join('\n')}\n\nFor each, write a one-sentence personalised reason referencing their ${
        bald ? 'scalp type and concern' : 'scalp type, concern, hair texture, wash frequency, and oiling habit'
      }. Describe the category only — do not name a brand.`
    : '';

  const hairExample = `
FEW-SHOT — oily scalp, medium length, dandruff, wavy, washes every 2-3 days, Delhi:

{
  "advice": "Lead with a ketoconazole shampoo twice a week — dandruff is a fungal story, not a dryness one, and zinc pyrithione alone will plateau. Condition through the mid-lengths only to keep the roots from re-oiling by day two.",
  "styles": ["Curtain bangs", "Shag haircut", "Textured layers"],
  "styles_detailed": [
    { "name": "Curtain bangs",    "why": "Frame the face without adding weight to already-dense mid-lengths.",       "maintenance": "medium", "climate_note": "Delhi winter dryness can flatten the fringe — air-dry, don't blow-dry." },
    { "name": "Shag haircut",     "why": "Remove bulk from the ends to let the wave pattern show.",                  "maintenance": "low",    "climate_note": null },
    { "name": "Textured layers",  "why": "Dry-cut layers carry the natural wave through medium length.",             "maintenance": "low",    "climate_note": "Low-product style for Delhi summer heat." }
  ],
  "condition_explanation": "Oily scalp washed every 2-3 days accumulates enough sebum to feed Malassezia, which drives the visible flakes. The wave pattern on medium hair hides oily roots for about a day before flattening.",
  "routine": [
    { "step_id": "hair_shampoo",     "label": "Cleanse",   "product": "Anti-dandruff shampoo", "category": "hair_shampoo",     "cadence": "every_wash", "level": "simple",   "order": 1, "clinical_reasoning": "Oily scalp with active dandruff in Delhi's dry winter. Ketoconazole 2% targets the fungal root of the flakes without over-stripping." },
    { "step_id": "hair_conditioner", "label": "Condition", "product": "Lightweight conditioner", "category": "hair_conditioner", "cadence": "every_wash", "level": "simple",   "order": 2, "clinical_reasoning": "Wavy mid-lengths dehydrate faster than the roots. A silicone-free lightweight conditioner on lengths only keeps the scalp from re-oiling by day two." },
    { "step_id": "hair_oil",         "label": "Nourish",   "product": "Scalp oil",              "category": "hair_oil",         "cadence": "weekly",     "level": "balanced", "order": 3, "clinical_reasoning": "Once-weekly rosemary-infused oil stimulates circulation without overloading the already-oily scalp." }
  ],
  "products": [
    { "category": "hair_shampoo",     "name": "Anti-dandruff shampoo",   "brand": "category", "reason": "Ketoconazole 2% dissolves Malassezia on an oily, flaky scalp. Key ingredient: Ketoconazole — shuts down the fungus driving the flakes.", "match_score": 92 },
    { "category": "hair_conditioner", "name": "Lightweight conditioner", "brand": "category", "reason": "Silicone-free formula for wavy mid-lengths that need hydration without buildup. Key ingredient: Glycerin — humectant for wave definition in dry Delhi air.", "match_score": 80 }
  ]
}`;

  if (bald) {
    return `${VOICE_ANCHOR}

This user is bald or keeps their head shaved. Focus entirely on scalp health, not hair styling.

${userCtx}

${matchedSection}

${EDITORIAL_RULES}

step_id — required on every routine step. Canonical IDs only:
  hair_shampoo, hair_conditioner, hair_oil, hair_serum, hair_mask

cadence — required on every routine step, one of: "every_wash" | "weekly" | "monthly".

CANONICAL CATEGORY ENUM — every "category" field must be one of:
${CANONICAL_CATEGORY_LIST}

clinical_reasoning — REQUIRED on every step. 1-2 sentences tying the step to this user's specific scalp observations. Never generic.

Return ONLY valid JSON matching this shape exactly:
{
  "advice": "max 2 sentences, first stands alone as preview, imperative",
  "styles": [],
  "styles_detailed": [],
  "condition_explanation": "max 2 sentences explaining why this scalp needs this care",
  "routine": [
    { "step_id": "hair_shampoo",     "label": "Cleanse", "product": "Gentle scalp shampoo", "category": "hair_shampoo",     "cadence": "every_wash", "level": "simple",   "order": 1, "clinical_reasoning": "..." },
    { "step_id": "hair_conditioner", "label": "Hydrate", "product": "Scalp moisturiser",    "category": "hair_conditioner", "cadence": "every_wash", "level": "simple",   "order": 2, "clinical_reasoning": "..." },
    { "step_id": "hair_serum",       "label": "Treat",   "product": "Scalp serum",          "category": "hair_serum",       "cadence": "weekly",     "level": "full",     "order": 4, "clinical_reasoning": "..." }
  ],
  "products": [
    { "category": "<canonical>", "name": "<generic descriptor>", "brand": "category", "reason": "one sentence, clinical voice, end with 'Key ingredient: <ingredient> — <8-word benefit>'", "match_score": <integer 60-100> }
  ]
}

products.name is a generic category descriptor. products.brand is ALWAYS the literal string "category".
styles and styles_detailed must both be empty arrays — no hairstyles for a bald user.
routine: exactly 3 steps for scalp care. Use generic product category names only.
${hairExample}`.trim();
  }

  const womanStyles = 'Bob cut, Lob haircut, Pixie cut, Bangs, Shag haircut, Wolf cut, Blunt cut, Curtain bangs, Butterfly haircut, Bixie cut, French bob, Balayage, Updo, Bun, Ponytail, Beach waves, Feathered hair, Wedge haircut, Layer haircut, Razor cut, Textured layers';
  const manStyles   = 'Undercut, Crew cut, Pompadour, Quiff, Caesar cut, Ivy League haircut, Side part, Comb over, Buzz cut, Man bun, Mohawk, Faux hawk, Taper fade, Afro, Dreadlocks, Cornrows, Curtain haircut, Edgar cut, Wolf cut, Shag haircut';

  const isWoman = gender === 'woman' || gender === 'women' || gender === 'female';

  return `${VOICE_ANCHOR}

${userCtx}

${matchedSection}

${EDITORIAL_RULES}

STYLE LIST — suggest exactly 3 styles ONLY from this list:
${isWoman ? womanStyles : manStyles}

Never return men's styles for a woman user. Never mix men and women styles. Never invent style names not in the list.

step_id — required on every routine step. Canonical IDs only:
  hair_shampoo, hair_conditioner, hair_oil, hair_serum, hair_mask

cadence — required on every routine step, one of: "every_wash" | "weekly" | "monthly".

CANONICAL CATEGORY ENUM — every "category" field must be one of:
${CANONICAL_CATEGORY_LIST}

clinical_reasoning — REQUIRED on every step. 1-2 sentences tying the step to this user's specific hair/scalp observations. Never generic.

HAIR PRODUCTS — two-layer framework (max 3 products total):

FOUNDATION (always):
  1. shampoo
     - scalp_type = oily   → clarifying
     - scalp_type = dry    → moisturising sulphate-free
     - scalp_type = normal → balanced
     - primary_concern includes "dandruff" → REPLACE with anti_dandruff (ketoconazole or zinc pyrithione)
  2. conditioner
     - hair_length = very_short OR buzz_cut → SKIP
     - texture = straight  → lightweight
     - texture = wavy      → moisturising
     - texture = curly/coily → deep conditioning
     - chemically_treated != none → colour_safe

TREATMENT (only if concern exists):
  primary_concern includes "hairfall": ADD scalp_serum. Note in reason: "Hairfall persisting 3+ months despite a good routine needs a trichologist."
  primary_concern includes "frizz":    ADD leave_in_conditioner or hair_serum (argan). Note in reason: "In ${city ?? 'your city'} humidity this manages frizz — it will not eliminate it."
  primary_concern includes "damage" OR chemically_treated != none: ADD hair_mask (weekly). Note: "Use once a week — daily masks cause protein overload."
  scalp_type = dry: ADD scalp_oil (lightweight, 1x per week). Note: "Daily oiling blocks follicles — 1x per week is enough."

styles_detailed — return 2-3 RECOMMENDED styles only. No "avoid" entries. Each:
  { "name": "<named haircut from the style list>", "why": "max 18 words, imperative, no trait-naming opening", "maintenance": "low"|"medium"|"high", "climate_note": "..." or null }

Return ONLY valid JSON matching this shape exactly:
{
  "advice": "max 2 sentences, first stands alone, imperative",
  "styles": ["Style 1", "Style 2", "Style 3"],
  "styles_detailed": [ ... ],
  "condition_explanation": "max 2 sentences explaining why this hair needs this care",
  "routine": [
    { "step_id": "hair_shampoo",     "label": "Cleanse",   "product": "Shampoo",     "category": "hair_shampoo",     "cadence": "every_wash", "level": "simple",   "order": 1, "clinical_reasoning": "..." },
    { "step_id": "hair_conditioner", "label": "Condition", "product": "Conditioner", "category": "hair_conditioner", "cadence": "every_wash", "level": "simple",   "order": 2, "clinical_reasoning": "..." },
    { "step_id": "hair_oil",         "label": "Nourish",   "product": "Hair oil",    "category": "hair_oil",         "cadence": "weekly",     "level": "balanced", "order": 3, "clinical_reasoning": "..." }
  ],
  "products": [
    { "category": "<canonical>", "name": "<generic descriptor>", "brand": "category", "reason": "one sentence, end with 'Key ingredient: <ingredient> — <8-word benefit>'", "match_score": <integer 60-100> }
  ]
}

products.name is a generic descriptor. products.brand is ALWAYS "category". Use 'Shampoo' not 'Anti-dandruff Shampoo'; use 'Hair oil' not 'Argan Oil Treatment'.
routine: 3-4 steps. Use generic product category names only.
${hairExample}`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// getHairRecommendationsFromGemini
// ═══════════════════════════════════════════════════════════════════════════════
export async function getHairRecommendationsFromGemini(
  profile:         HairProfile,
  faceShape:       string | null,
  gender:          string,
  city:            string | null,
  budget:          string,
  matchedProducts: MatchedProduct[],
  options?: {
    onPartial?: (partial: Partial<HairRecommendations>) => void;
    scanId?:    string | null;
  },
): Promise<HairRecommendations> {
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
      console.warn(`[gemini hair_recs] retry attempt 2/2 after ${RETRY_BACKOFF_MS}ms (finish_reason: ${lastFinishReason ?? 'unknown'})`);
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
    }

    try {
      const body: RequestInit = {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: buildHairRecsPrompt(profile, faceShape, gender, city, budget, matchedProducts),
            }],
          }],
          generationConfig: {
            temperature:     0,
            maxOutputTokens: 8192,
          },
        }),
      };

      const onPartialText = options?.onPartial
        ? (accumulated: string) => {
            const maybe = tryParsePartialJson(accumulated);
            if (maybe && typeof maybe === 'object') {
              options.onPartial!(maybe as Partial<HairRecommendations>);
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
          `Gemini hair response was truncated — increase maxOutputTokens. Last 100 chars: ${text.slice(-100)}`,
        );
      }

      const parsed = JSON.parse(text) as HairRecommendations;

      void logUsage({
        callType:     'hair_recs',
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
      console.warn(`[gemini hair_recs] attempt ${attempt} failed: ${msg} (finish_reason: ${lastFinishReason ?? 'unknown'})`);

      // Decide whether retry could plausibly help. If not, fall through to
      // exhausted-failure path immediately.
      if (attempt === 1) {
        if (!shouldRetry(err, lastFinishReason)) {
          console.warn(`[gemini hair_recs] failure is deterministic — not retrying`);
          break;
        }
        didRetry = true;
        continue;
      }
      // Attempt 2 failed — fall through.
    }
  }

  const exhaustedMsg = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[gemini hair_recs EXHAUSTED]`, JSON.stringify({
    attempts:             didRetry ? 2 : 1,
    last_error:           exhaustedMsg,
    last_finish_reason:   lastFinishReason ?? 'unknown',
    last_safety_ratings:  lastSafetyRatings ?? null,
    last_response_length: lastRawResponse.length,
    last_response_tail:   lastRawResponse.slice(-500),
    scan_id:              options?.scanId ?? null,
  }, null, 2));

  void logUsage({
    callType:     'hair_recs',
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
