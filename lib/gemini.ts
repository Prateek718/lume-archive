// Gemini 2.5 Flash-Lite — vision analysis of the user's face photo.
// Returns structured JSON with face shape, skin type, scores, etc.

import type { Scan } from '../types';
import type {
  MatchedProduct,
  Recommendations,
  HairProfile,
  HairRecommendations,
} from '../types';
import { isBaldProfile } from '../types';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY!;

const MODEL_VISION = 'gemini-2.5-pro';
const MODEL_TEXT   = 'gemini-2.5-flash';
const ENDPOINT      = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_VISION}:generateContent?key=${API_KEY}`;
const ENDPOINT_TEXT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEXT}:generateContent?key=${API_KEY}`;

// Retry wrapper — retries on 503 (overloaded) and 429 (rate limit).
// Delay grows linearly with each attempt: 2s, 4s, 6s, ...
async function fetchWithRetry(
  url:     string,
  options: RequestInit,
  retries: number = 3,
  delayMs: number = 2000,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url, options);

    // Retry on 503 (overloaded) and 429 (rate limit)
    if (
      (response.status === 503 || response.status === 429)
      && attempt < retries
    ) {
      console.warn(
        `[gemini] ${response.status} on attempt ${attempt}/${retries}` +
        ` — retrying in ${delayMs * attempt}ms`,
      );
      await new Promise(r => setTimeout(r, delayMs * attempt));
      continue;
    }
    return response;
  }
  // Final attempt
  return fetch(url, options);
}

// What we get back from Gemini (a subset of the Scan type).
export type GeminiAnalysis = Pick<
  Scan,
  | 'face_shape'
  | 'skin_type'
  | 'skin_concerns'
  | 'beard_density'
  | 'beard_condition'
  | 'brow_condition'
  | 'undereye'
  | 'score_skin'
  | 'score_beard'
  | 'score_makeup'
  | 'fitzpatrick_scale'
  | 'skin_tone'
  | 'skin_undertone'
> & {
  confidence?: {
    face_shape?:     number;
    hair_texture?:   number;
    skin_undertone?: number;
  };
  alternatives?: {
    face_shape?:     string | null;
    hair_texture?:   string | null;
    skin_undertone?: string | null;
  };
};

function buildPrompt(
  gender:              string,
  city:                string | null,
  budget:              string,
  previousScanSummary: string | null,
  ageRange?:           string | null,
): string {

  const climateContext = city
    ? `The user is based in ${city}. Factor in the local climate, humidity, pollution levels, and UV index when assessing skin condition and recommending care. For example: high humidity cities like Mumbai → oiliness and fungal concerns. Dry cities like Delhi in winter → dehydration and barrier damage. High UV cities → pigmentation and photoageing.`
    : `No city provided. Use general Indian climate assumptions — moderate humidity, high UV, moderate pollution.`;

  const previousContext = previousScanSummary
    ? `Previous scan summary: ${previousScanSummary}
Compare current observations against this. Note improvements or regressions. If a concern has resolved, acknowledge it. If a new concern has appeared, flag it.`
    : `This is the user's first scan. No previous context available.`;

  const ageContext = ageRange
    ? `Age range: ${ageRange} — factor age into skin ageing signs, hormonal concerns, and routine complexity recommendations.`
    : '';

  return `
You are a clinical skin analyst with expertise in Indian skin tones, dermatology, and facial assessment. Analyse this face photo with the precision of a dermatologist.

USER CONTEXT:
Gender: ${gender}
${ageContext ? ageContext + '\n' : ''}${climateContext}
${previousContext}

CLINICAL ANALYSIS INSTRUCTIONS:

Step 1 — OBSERVE before classifying.
Look carefully at specific skin zones:
- T-zone (forehead, nose, chin)
- Cheeks and temples
- Periorbital area (around the eyes)
- Jawline and neck
- Lip area and perioral zone

Note texture, shine, pores, tone, and any lesions per zone.

Step 2 — CLASSIFY from observations, not assumptions.
Do not assume skin type from gender or age.
Classify based only on what you can see:

Oily: visible shine across T-zone AND cheeks, enlarged pores, potential comedones
Dry: visible flaking, tight texture, dull finish, fine surface lines from dehydration
Combination: shine confined to T-zone only, normal to dry cheeks
Normal: even texture, no significant shine, no flaking, even tone
Sensitive: visible redness, reactive patches, surface capillaries, uneven flushing

Step 3 — IDENTIFY specific concerns.
Only flag concerns you can actually see evidence of. Do not infer concerns from skin type alone.

Concern definitions:
- acne: visible active pimples, pustules, papules, or nodules — NOT just pores
- dryness: visible flaking, rough texture, or tight-looking skin surface
- oiliness: visible sebum shine, especially outside T-zone
- dark_circles: visible periorbital darkening or discolouration
- uneven_texture: visible bumps, roughness, enlarged pores, or surface irregularity
- dehydration: skin looks dull and lacklustre, fine surface lines, no plumpness — distinct from dryness (can occur in oily skin)
- hyperpigmentation: visible dark spots, post-acne marks, melasma, or uneven tone

Step 4 — CLASSIFY Fitzpatrick skin tone.
Assess the user's skin tone on the Fitzpatrick scale (1–6):
1 = Very fair, always burns, never tans (rare in India)
2 = Fair, usually burns, sometimes tans
3 = Medium, sometimes burns, always tans
4 = Olive/light brown, rarely burns, always tans (most common in urban India)
5 = Brown, very rarely burns, tans deeply (common across India)
6 = Dark brown/black, never burns, tans deeply (common in South India and other regions)

Indian skin is predominantly IV–VI. Return the integer (1–6) and a short plain-English label.

Step 5 — ASSESS SKIN UNDERTONE.
Warm: golden/peachy/yellow hue, golden jaw — most common in Indian skin.
Cool: pink/rosy/bluish hue, pink-flushed cheeks, blue veins if visible.
Neutral: balanced beige, no dominance.
For Indian skin (IV–VI), warm and neutral are most common. Do not default to cool without clear visual evidence.

Step 6 — ASSESS care evidence.
Score based ONLY on visible care effort:
- Skin: evidence of cleansing routine, hydration, sun protection (no visible sun damage lines), active skincare
- Beard (men only): shape definition, edge clarity, length consistency, cleanliness
- Brow/makeup (women only): brow definition, shape, visible care or product use

SCORING (care evidence only, not genetics):
85-100: exceptional routine evident
70-84: good routine
50-69: basic care
<50: minimal routine
Never penalise fixed traits — score effort only.

${gender === 'woman'
  ? `WOMEN-SPECIFIC ASSESSMENT:
Beard fields (beard_density, beard_condition) must be null.

Assess brow_condition carefully:
- well_defined: clear shape, defined arch, filled or naturally full
- sparse: gaps visible, thin or over-plucked
- ungroomed: no visible shaping effort
- over_plucked: clearly too thin for face

Assess undereye carefully:
- dark_circles: visible periorbital darkening or discolouration
- puffiness: visible swelling or bags
- normal: no significant concern

score_makeup: brow definition + skin base quality + presentation readiness (0-100).`
  : `MEN-SPECIFIC: Assess beard_density and beard_condition carefully. Note edge definition and beard care evidence. Brow_condition and undereye must be null.`
}

CONFIDENCE RULES (applies to TRAIT fields only — face_shape, skin_undertone):
- confidence reflects how clearly the photo supports your classification of a TRAIT (bone structure, undertone). Lighting, angle, and partial occlusion reduce confidence.
- If the face is genuinely borderline between two categories (e.g. oval/round), return confidence 0.55–0.70 and name the second category in alternatives.
- If the trait is unambiguous, return confidence ≥ 0.85 and alternatives: null.
- Never invent confidence. If unsure, return 0.5.
- Confidence applies to TRAITS only. State fields (skin_concerns, condition, density, scores) are direct observations and DO NOT get confidence scores.

Return ONLY a valid JSON object.
No markdown, no code fences, no explanation.
No text before or after the JSON.

Return exactly this structure:
{
  "face_shape": one of ["oval","round","square","heart","oblong","diamond"],
  "skin_type": one of ["oily","dry","combination","normal","sensitive"],
  "skin_concerns": array of zero or more from ["acne","dryness","oiliness","dark_circles","uneven_texture","dehydration","hyperpigmentation"],
  "beard_density": one of ["none","light","medium","heavy"] or null if gender is woman,
  "beard_condition": one of ["well_groomed","needs_shaping","patchy","untrimmed"] or null if gender is woman,
  "brow_condition": one of ["well_defined","sparse","ungroomed","over_plucked"] or null if gender is man,
  "undereye": one of ["dark_circles","puffiness","normal"] or null if gender is man,
  "fitzpatrick_scale": integer 1–6,
  "skin_tone": one of ["Very fair","Fair","Medium","Olive","Brown","Dark brown"],
  "skin_undertone": one of ["warm","cool","neutral"],
  "score_skin": integer 0-100,
  "score_beard": integer 0-100 or null if woman,
  "score_makeup": integer 0-100 or null if man,
  "confidence": {
    "face_shape": number 0.0–1.0,
    "skin_undertone": number 0.0–1.0
  },
  "alternatives": {
    "face_shape": one of the face_shape values (second-best choice if within ~15% of top pick) OR null,
    "skin_undertone": one of the undertone values OR null
  }
}

Example — unambiguous classification:
  "face_shape": "oval", "confidence": { "face_shape": 0.92, "skin_undertone": 0.88 },
  "alternatives": { "face_shape": null, "skin_undertone": null }

Example — borderline between two categories:
  "face_shape": "oval", "confidence": { "face_shape": 0.62, "skin_undertone": 0.80 },
  "alternatives": { "face_shape": "round", "skin_undertone": null }
`.trim();
}

// Pass the base64-encoded image string (no data URI prefix) plus user context.
// Returns the parsed analysis object from Gemini.
export async function analyseWithGemini(
  base64Image:         string,
  city:                string | null,
  gender:              string,
  budget:              string,
  previousScanSummary: string | null,
  ageRange?:           string | null,
): Promise<GeminiAnalysis> {
  const visionStart = Date.now();
  const response = await fetchWithRetry(ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data:       base64Image,
            },
          },
          { text: buildPrompt(gender, city, budget, previousScanSummary, ageRange) },
        ],
      }],
      generationConfig: {
        temperature:     0,    // deterministic output — we want consistent JSON
        maxOutputTokens: 2500,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${error}`);
  }

  const json = await response.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  console.log('[gemini] Raw length:', text.length, 'First 100:', text.slice(0, 100));

  // Strip any accidental markdown code fences before parsing
  const stripped = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  // Extract just the JSON object — ignores any preamble or postamble text
  const firstBrace = stripped.indexOf('{');
  const lastBrace  = stripped.lastIndexOf('}');
  const cleaned = firstBrace !== -1 && lastBrace !== -1
    ? stripped.slice(firstBrace, lastBrace + 1)
    : stripped;

  console.log('[gemini] Raw response text:', cleaned.slice(0, 500));

  if (!cleaned.includes('{')) {
    throw new Error(
      `Gemini vision returned no JSON. Response: ${cleaned.slice(0, 200)}`,
    );
  }

  try {
    console.log('[gemini] Attempting to parse response');
    const result = JSON.parse(cleaned) as GeminiAnalysis;
    console.log('[gemini] Parsed result:', JSON.stringify(result).slice(0, 300));
    console.log('[gemini vision] tokens used:',
      json?.usageMetadata?.candidatesTokenCount,
      '/ input:',
      json?.usageMetadata?.promptTokenCount);
    console.log('[gemini vision] duration:', Date.now() - visionStart, 'ms');
    return result;
  } catch (error: unknown) {
    console.error('[gemini] Parse CRASH:', error instanceof Error ? error.stack : String(error));
    throw new Error(`Gemini returned invalid JSON: ${cleaned}`);
  }
}

// ── Grooming recommendations (text-only, Gemini 2.5 Flash) ────────────────────

function buildRecsPrompt(
  gender:          string,
  analysis:        GeminiAnalysis,
  matchedProducts: MatchedProduct[],
  ageRange:        string | null,
): string {

  const matchedSection = matchedProducts.length > 0
    ? `Matched products for this user:\n${
        matchedProducts.map(p =>
          `- Category: ${p.category}\n  Product: ${p.name} by ${p.brand}\n  Description: ${p.why_good}`
        ).join('\n')
      }\n\nFor each matched product, write a personalised reason (1 sentence) explaining why it suits this specific user — their skin type, concerns, city climate. Describe the actual product, not an imagined ideal.`
    : '';

  const undertoneCtx = gender === 'woman' && analysis.skin_undertone
    ? `\nSkin undertone: ${analysis.skin_undertone}
Fitzpatrick scale: ${analysis.fitzpatrick_scale ?? 'not assessed'}
Makeup shade guidance:
- Warm undertone → peachy/golden nudes, warm reds
- Cool undertone → mauve/pink nudes, berry shades
- Neutral → classic nudes, true reds
Foundation family: Fitzpatrick 1-2 = fair, 3 = light-medium, 4-5 = medium-tan, 6 = deep`
    : '';

  const ageCtx = ageRange
    ? `\nAge range: ${ageRange}`
    : '';

  return `You are Lumé, an expert skin and care advisor.
Gender: ${gender}${ageCtx}${undertoneCtx}
Face analysis: ${JSON.stringify(analysis)}

${matchedSection}

EDITORIAL RULES — apply to every field:
- Never begin a field with "Your", "With your", "For your", or any phrase that names a user trait (face shape, skin type, texture, density, condition). The app already knows these.
- Use imperative voice for actionable fields (advice, why). "Do X" — not "You should do X" or "X is recommended."
- Return only what to do. Do NOT include avoid or not_recommended items. Absence communicates negative recommendation.
- Every field is a single idea. If you have two reasons, pick the stronger one.
- advice: max 2 sentences. The FIRST SENTENCE must stand alone as a 1-line preview — it is rendered without the second sentence on the recommendations card.
- why (on beard_styles): max 18 words, one sentence, imperative.
    Good: "Keep length at the chin to lengthen a round face."
    Bad:  "With your round face, keeping length at the chin will help."
- Frame fixed traits (face shape, features) as assets, never flaws.
- For dark circles: "Brighten the under-eye area..." not "you have dark circles."
- step_id values must match the documented format EXACTLY. The app uses them as stable keys across scans to track adherence over time — if the format drifts, tracking breaks.

step_id FORMAT — required on every routine step:
  Skin morning: "skin_am_<category>"
  Skin evening: "skin_pm_<category>"
  Beard:        "beard_<category>"
  <category> for skin: one of cleanse, toner, serum, treatment, moisturize, spf
  <category> for beard: one of wash, oil, balm, comb
  Use "serum" for niacinamide / vitamin C / HA. Use "treatment" for retinol / AHA / eye cream.

SKIN ROUTINE RULES:

Build the morning and evening routine based
on the two-layer framework below.
The routine is a structured checklist —
short labels only, no advice in steps.

Each step: { "step_id": "skin_am_<cat>" | "skin_pm_<cat>", "label": "1-2 words", "product": "1-4 words", "order": integer }

FOUNDATION steps (always include):
Morning:
  order 1: { step_id "skin_am_cleanse", label "Cleanse", product by skin_type:
    oily/acne → Salicylic cleanser
    dry → Cream cleanser
    sensitive → Gentle cleanser
    normal/combination → Gel cleanser }
  order 2: { step_id "skin_am_spf", label "Protect", product "Sunscreen SPF 50" } (MORNING ONLY)

Evening:
  order 1: { step_id "skin_pm_cleanse", label "Cleanse", product: same type as morning }
  Last order: { step_id "skin_pm_moisturize", label "Nourish", product:
    oily → Gel moisturiser
    dry → Cream moisturiser
    normal/combination → Lightweight moisturiser
    sensitive → Fragrance-free moisturiser }

Moisturiser (Nourish step):
Always include in BOTH morning and evening.
Type by skin:
  oily/combination → Gel moisturiser
  dry → Cream moisturiser
  normal → Lightweight moisturiser
  sensitive → Fragrance-free moisturiser

Skipping moisturiser causes oily skin to
produce more sebum — always include it.

Morning order: Cleanse → treatments →
Moisturise → Protect
Evening order: Cleanse → treatments →
Moisturise

TREATMENT steps (add only if concern detected):
For each concern, add ONE step:

  oiliness OR acne detected:
    Morning order 3: { step_id "skin_am_serum", label "Balance", product "Niacinamide serum" }

  dark_circles detected:
    Evening, second-to-last order: { step_id "skin_pm_treatment", label "Eye care", product "Eye cream" }

  dark_spots OR hyperpigmentation detected:
    Morning order 3 (or 4 if niacinamide present):
    { step_id "skin_am_serum", label "Brighten", product "Vitamin C serum" }

  dehydration detected:
    Morning after cleanse: { step_id "skin_am_serum", label "Hydrate", product "HA serum" }

  uneven_texture detected AND no retinol:
    Evening, before moisturiser: { step_id "skin_pm_treatment", label "Renew", product "AHA exfoliant" }
    Add note "2-3x/week" to product field

  fine_lines detected AND age_range is
  '26-35' or older:
    Evening, before moisturiser: { step_id "skin_pm_treatment", label "Renew", product "Retinol" }
    Add note "2-3x/week" to product field
    NEVER add retinol if age_range is '18-25'
    or age_range is not set

SERUM LIMIT: Maximum ONE serum per routine.
If multiple serums are indicated by concerns,
choose the MOST IMPACTFUL one only:

Priority order for oily/combination skin:
  1. Niacinamide serum (oiliness/acne)
  2. Vitamin C serum (hyperpigmentation)
  — never both simultaneously

Priority for dry skin:
  1. Hyaluronic acid serum (dehydration)
  2. Vitamin C serum (hyperpigmentation)
  — never both simultaneously

If the user has both oiliness AND
hyperpigmentation: recommend niacinamide
only — it also helps with pigmentation
over time.

Exception: if ONLY hyperpigmentation is
detected with no oiliness or acne →
then vitamin C serum is appropriate.

TONER RULE:
Include toner ONLY if:
  - skin_type is oily OR acne-prone AND
  - no niacinamide serum is being added
In that case: add after cleanse, morning only:
  { "step_id": "skin_am_toner", "label": "Tone", "product": "BHA toner", "order": 2 }
  Then renumber subsequent steps.

In all other cases: do NOT include toner.
No toner for dry, normal, sensitive skin.
No toner if niacinamide serum is present.

STEP COUNT RULES:
Morning: minimum 2 steps (cleanse + SPF),
  maximum 4 steps total.
Evening: minimum 2 steps (cleanse + moisturiser),
  maximum 4 steps total.
Never exceed 4 steps in any single routine.
Never exceed 5 unique product categories total.

BEARD RULES:
beard_density = stubble or none:
  No beard products. beard.routine = []

beard_density = medium or heavy:
  Always: { step_id "beard_wash", label "Cleanse", product "Beard wash" }
        + { step_id "beard_oil",  label "Nourish", product "Beard oil"  }
  Add { step_id "beard_balm", label "Shape", product "Beard balm" } ONLY if beard_condition = needs_shaping
  Add anti-dandruff wash ONLY if dandruff detected (still step_id "beard_wash")
  MAX 3 products

beard_styles: return 2-3 RECOMMENDED styles ONLY.
  Do NOT return avoid or not_recommended entries — omitting a style is how you communicate "don't do this".
  Each entry: { "name": "<style name>", "why": "<max 18 words, imperative, no trait-naming openings>", "maintenance": "low" | "medium" | "high" }

MAKEUP RULES (women only):
Base: include ONLY if hyperpigmentation
  or uneven_texture detected
Brow pencil: ONLY if brow_condition is
  sparse or ungroomed
Concealer: ONLY if dark_circles detected
Lip: always include 1 lip product
  (undertone matched)
MAX 3 products total

Return ONLY valid JSON, no markdown, no fences:
{
  "skin": {
    "advice": "max 2 sentences, first sentence stands alone as preview, imperative",
    "routine": {
      "morning": [
        { "step_id": "skin_am_cleanse", "label": "Cleanse", "product": "Gel cleanser",      "order": 1 },
        { "step_id": "skin_am_spf",     "label": "Protect", "product": "Sunscreen SPF 50", "order": 2 }
      ],
      "evening": [
        { "step_id": "skin_pm_cleanse",    "label": "Cleanse", "product": "Gel cleanser",    "order": 1 },
        { "step_id": "skin_pm_moisturize", "label": "Nourish", "product": "Gel moisturiser", "order": 2 }
      ]
    }
  },
  "beard": {
    "advice": "max 2 sentences, first sentence stands alone as preview, imperative",
    "routine": [
      { "step_id": "beard_wash", "label": "Cleanse", "product": "Beard wash", "order": 1 },
      { "step_id": "beard_oil",  "label": "Nourish", "product": "Beard oil",  "order": 2 }
    ],
    "beard_styles": [
      { "name": "Short boxed beard", "why": "Trim edges sharply to frame a round face.", "maintenance": "medium" }
    ]
  },
  "makeup": {
    "advice": "max 2 sentences, first sentence stands alone as preview, imperative",
    "techniques": ["technique 1", "technique 2"]
  },
  "products": [
    {
      "category": "face_cleanser",
      "name": "exact product name",
      "brand": "exact brand",
      "reason": "1 sentence personalised reason",
      "match_score": 85
    }
  ]
}

Note: beard is null if gender is woman.
Note: makeup is null if gender is man.
Note: routine arrays show ONLY the steps
that apply to this user — not a fixed template.
The example above shows minimum steps.
Add treatment steps based on concerns detected.`;
}

export async function getRecommendationsFromGemini(
  gender:          string,
  analysis:        GeminiAnalysis,
  matchedProducts: MatchedProduct[],
  ageRange:        string | null,
): Promise<Recommendations> {
  const recsStart = Date.now();
  const response = await fetchWithRetry(ENDPOINT_TEXT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: buildRecsPrompt(gender, analysis, matchedProducts, ageRange) }],
      }],
      generationConfig: {
        temperature:     0,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini recommendations API error ${response.status}: ${error}`);
  }

  const json = await response.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (!text) throw new Error('Gemini returned empty response');

  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  if (!cleaned.endsWith('}')) {
    throw new Error(
      `Gemini response was truncated — increase maxOutputTokens. ` +
      `Last 100 chars: ${cleaned.slice(-100)}`,
    );
  }

  try {
    const result = JSON.parse(cleaned) as Recommendations;
    console.log('[gemini recs] tokens used:',
      json?.candidates?.[0]?.usageMetadata?.candidatesTokenCount ??
      json?.usageMetadata?.candidatesTokenCount,
      '/ input:',
      json?.candidates?.[0]?.usageMetadata?.promptTokenCount ??
      json?.usageMetadata?.promptTokenCount);
    console.log('[gemini recs] duration:', Date.now() - recsStart, 'ms');
    return result;
  } catch (e) {
    throw new Error(
      `Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`,
    );
  }
}

// ── Hair recommendations (text-only, Gemini 2.5 Flash) ────────────────────────

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
        city ? `City: ${city} — factor in local climate, humidity, and pollution when recommending` : null,
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
        `Current wash frequency: ${profile.wash_frequency ? (washLabel[profile.wash_frequency] ?? profile.wash_frequency) : 'not specified'}`,
        `Oils hair regularly: ${profile.oils_regularly != null ? (profile.oils_regularly ? 'Yes' : 'No') : 'not specified'}`,
        `Chemical treatments: ${profile.chemically_treated ?? 'none'}`,
        faceShape ? `Face shape: ${faceShape}` : null,
        city ? `City: ${city} — factor in local climate, humidity, and pollution when recommending` : null,
        budget === 'affordable'
          ? 'Budget: Affordable — recommend products under ₹500'
          : 'Budget: Premium — recommend products ₹500 and above',
        `Gender: ${gender}`,
      ].filter(Boolean).join('\n');

  const matchedSection = matchedProducts.length > 0
    ? `Matched ${bald ? 'scalp care' : 'hair'} products for this user:\n${matchedProducts.map(p =>
        `- Category: ${p.category}\n  Product: ${p.name} by ${p.brand}\n  Description: ${p.why_good}`
      ).join('\n')}\n\nFor each matched product, write a personalised reason referencing their specific ${
        bald ? 'scalp type and scalp concern' : 'scalp type, concern, hair texture, wash frequency, and oiling habit'
      }. The reason must describe the actual product shown.`
    : '';

  if (bald) {
    return `You are Lumé, an expert scalp care advisor. This user is bald or keeps their head shaved. Focus entirely on scalp health — not hair styling. Be specific and practical.

${userCtx}

${matchedSection}

EDITORIAL RULES — apply to every field:
- Never begin a field with "Your", "With your", "For your", or any phrase that names a user trait (scalp type, concern, face shape). The app already knows these.
- Use imperative voice for actionable fields (advice, condition_explanation). "Do X" — not "You should do X" or "X is recommended."
- Return only what to do. Do NOT return "avoid" or "not_recommended" entries. Absence communicates negative recommendation.
- Every field is a single idea. If two reasons exist, pick the stronger one.
- advice: max 2 sentences. The FIRST SENTENCE must stand alone as a 1-line preview — it is rendered without the second sentence on the recommendations card.
- condition_explanation: max 2 sentences. State why this scalp needs this care — no trait-naming openings.
- step_id values must match the documented format EXACTLY. The app uses them as stable keys across scans to track adherence over time.

step_id FORMAT — required on every routine step:
  hair_<category> where <category> is one of:
    shampoo, condition, mask, oil, serum, scalp_treatment

cadence — required on every routine step, one of:
  "every_wash" | "weekly" | "monthly"

Return ONLY a valid JSON object with no markdown, no code fences, no explanation, matching this exact structure:
{
  "advice": "max 2 sentences, first sentence stands alone as preview, imperative",
  "styles": [],
  "styles_detailed": [],
  "condition_explanation": "max 2 sentences, no trait-naming openings",
  "routine": [
    { "step_id": "hair_shampoo",         "label": "Cleanse", "product": "Gentle scalp shampoo", "cadence": "every_wash", "level": "simple",   "order": 1 },
    { "step_id": "hair_condition",       "label": "Hydrate", "product": "Scalp moisturiser",    "cadence": "every_wash", "level": "simple",   "order": 2 },
    { "step_id": "hair_scalp_treatment", "label": "Protect", "product": "SPF 50 sunscreen",     "cadence": "every_wash", "level": "balanced", "order": 3 },
    { "step_id": "hair_scalp_treatment", "label": "Treat",   "product": "Scalp serum",          "cadence": "weekly",     "level": "full",     "order": 4 }
  ],
  "products": [
    {
      "category": "scalp_serum",
      "name": "exact product name as provided above",
      "brand": "exact brand as provided above",
      "reason": "personalised one sentence referencing scalp type and concern",
      "match_score": <integer 60-100>
    }
  ]
}

styles: Must be an empty array — do NOT suggest hair styles for bald users.
styles_detailed: Must be an empty array.
routine: Exactly 4 steps tailored for scalp care. Every step MUST have step_id and cadence. Use generic product category names only.
CRITICAL: routine step product fields must use generic names only. Use 'Shampoo' not 'Anti-dandruff Shampoo'. Use 'Hair oil' not 'Argan Oil Treatment'. Use 'Hair serum' not 'Hydrating Shine Serum'.
Generic category names: shampoo → 'Shampoo', conditioner → 'Conditioner', hair oil → 'Hair oil', hair serum → 'Hair serum', scalp serum → 'Scalp serum', hair mask → 'Hair mask', leave-in conditioner → 'Leave-in conditioner'
products: One entry per matched product provided above. Use the exact category, name, and brand as given. 90-100: directly addresses scalp concern. 75-89: secondary benefit. 60-74: general maintenance. For every product reason, end with exactly one sentence starting with 'Key ingredient:' Name the single hero ingredient most relevant to this user's scalp concern and explain what it does in 8 words or fewer. Good: 'Key ingredient: Salicylic acid — dissolves the flakes causing your dandruff.' 'Key ingredient: Tea tree oil — fights fungal buildup on your scalp.' Maximum 2 sentences total per reason.`;
  }

  const womanStyles = 'Bob cut, Lob haircut, Pixie cut, Bangs, Shag haircut, Wolf cut, Blunt cut, Curtain bangs, Butterfly haircut, Bixie cut, French bob, Balayage, Updo, Bun, Ponytail, Beach waves, Feathered hair, Wedge haircut, Layer haircut, Razor cut, Textured layers';
  const manStyles   = 'Undercut, Crew cut, Pompadour, Quiff, Caesar cut, Ivy League haircut, Side part, Comb over, Buzz cut, Man bun, Mohawk, Faux hawk, Taper fade, Afro, Dreadlocks, Cornrows, Curtain haircut, Edgar cut, Wolf cut, Shag haircut';

  const isWoman = gender === 'woman' || gender === 'women' || gender === 'female';

  return `You are Lumé, an expert hair advisor. Based on this hair profile, give personalised recommendations. Be specific.

${userCtx}

${matchedSection}

${isWoman
  ? `Suggest 3 styles ONLY from this list: ${womanStyles}`
  : `Suggest 3 styles ONLY from this list: ${manStyles}`
}
The user's gender is: ${gender}
Return ONLY styles from the correct list above.
Never return men's styles for a woman user.
Never return women's styles for a man user.
Never mix men and women styles. Never invent style names not in the list.

EDITORIAL RULES — apply to every field:
- Never begin a field with "Your", "With your", "For your", or any phrase that names a user trait (face shape, texture, length, scalp type, concern). The app already knows these.
- Use imperative voice for actionable fields (advice, why, condition_explanation). "Do X" — not "You should do X" or "X is recommended."
- Return only what to do. Do NOT return "avoid" or "not_recommended" styles. Absence communicates negative recommendation.
- Every field is a single idea. If two reasons exist, pick the stronger one.
- advice: max 2 sentences. The FIRST SENTENCE must stand alone as a 1-line preview — it is rendered without the second sentence on the recommendations card.
- why (on styles_detailed): max 18 words, one sentence, imperative.
    Good: "Keep length around the jaw to lengthen a round face."
    Bad:  "With your round face, keeping length around the jaw will balance it."
- condition_explanation: max 2 sentences. State why this hair needs this care — no trait-naming openings.
- step_id values must match the documented format EXACTLY. The app uses them as stable keys across scans.

step_id FORMAT — required on every routine step:
  hair_<category> where <category> is one of:
    shampoo, condition, mask, oil, serum, scalp_treatment

cadence — required on every routine step, one of:
  "every_wash" | "weekly" | "monthly"

Return ONLY a valid JSON object with no markdown, no code fences, no explanation, matching this exact structure:
{
  "advice": "max 2 sentences, first sentence stands alone as preview, imperative",
  "styles": ["Exact Style Name 1", "Exact Style Name 2", "Exact Style Name 3"],
  "styles_detailed": [
    { "name": "Curtain haircut", "why": "Soften a sharp jaw with face-framing length.", "maintenance": "low",  "climate_note": "Works well in Mumbai humidity with low product." },
    { "name": "Textured crop",   "why": "Lift volume to balance a long forehead.",       "maintenance": "low",  "climate_note": null }
  ],
  "condition_explanation": "max 2 sentences explaining why this hair needs this care",
  "routine": [
    { "step_id": "hair_shampoo",   "label": "Cleanse",   "product": "Shampoo",     "cadence": "every_wash", "level": "simple",   "order": 1 },
    { "step_id": "hair_condition", "label": "Condition", "product": "Conditioner", "cadence": "every_wash", "level": "simple",   "order": 2 },
    { "step_id": "hair_oil",       "label": "Nourish",   "product": "Hair oil",    "cadence": "weekly",     "level": "balanced", "order": 3 },
    { "step_id": "hair_serum",     "label": "Smooth",    "product": "Hair serum",  "cadence": "every_wash", "level": "full",     "order": 4 }
  ],
  "products": [
    {
      "category": "shampoo",
      "name": "exact product name as provided above",
      "brand": "exact brand as provided above",
      "reason": "personalised one sentence referencing scalp type, concern, or texture",
      "match_score": <integer 60-100>
    }
  ]
}

routine: Exactly 4 steps. Every step MUST have step_id and cadence. simple=Cleanse+Condition (order 1-2), balanced=Nourish (order 3), full=Smooth (order 4). Use generic product category names only.
CRITICAL: routine step product fields must use generic names only. Use 'Shampoo' not 'Anti-dandruff Shampoo'. Use 'Hair oil' not 'Argan Oil Treatment'. Use 'Hair serum' not 'Hydrating Shine Serum'.
Generic category names: shampoo → 'Shampoo', conditioner → 'Conditioner', hair oil → 'Hair oil', hair serum → 'Hair serum', scalp serum → 'Scalp serum', hair mask → 'Hair mask', leave-in conditioner → 'Leave-in conditioner'

cadence GUIDANCE:
  hair_shampoo, hair_condition, hair_serum → "every_wash"
  hair_oil, hair_mask, hair_scalp_treatment → "weekly" (rarely "monthly")

HAIR PRODUCTS — two-layer framework:

FOUNDATION (always):
1. shampoo
   - scalp_type = oily → clarifying
   - scalp_type = dry → moisturising sulphate-free
   - scalp_type = normal → balanced
   - primary_concern = dandruff →
     REPLACE with anti_dandruff shampoo
     (ketoconazole or zinc pyrithione)

2. conditioner
   - hair_length = very_short OR buzz_cut → SKIP
   - texture = straight → lightweight
   - texture = wavy → moisturising
   - texture = curly OR coily → deep conditioning
   - chemically_treated != none → colour_safe

TREATMENT (only if concern exists):
  primary_concern = dandruff:
    shampoo already swapped above
    No additional products needed

  primary_concern = hairfall:
    ADD scalp_serum (biotin or minoxidil-adjacent)
    Note in reason: 'Hairfall persisting 3+ months
    despite a good routine needs a trichologist.'

  primary_concern = frizz:
    ADD leave_in_conditioner or hair_serum (argan)
    Note in reason: 'In [city] humidity this
    manages frizz — it will not eliminate it.'

  primary_concern = damage OR
  chemically_treated != none:
    ADD hair_mask (weekly only)
    Note: 'Use once a week — daily masks
    cause protein overload.'

  scalp_type = dry:
    ADD scalp_oil (lightweight, 1x per week)
    Note in reason: 'Daily oiling blocks
    follicles — 1x per week is enough.'

  No concerns:
    2 products only (shampoo + conditioner).

MAX 3 hair products total.

HAIRSTYLE RECOMMENDATIONS:

Return styles_detailed array using:
  face_shape, hair_length, texture,
  primary_concern, gender, city

Return ONLY 2-3 RECOMMENDED styles. Do NOT return avoid or not_recommended entries — omitting a style is how you communicate "don't do this".

Each entry:
{
  "name": "specific named haircut",
  "why": "max 18 words, one sentence, imperative, no trait-naming openings",
  "maintenance": "low" | "medium" | "high",
  "climate_note": "..." or null
}

Examples of climate_note:
  'Works well in Mumbai humidity — low product needed'
  'High maintenance in Delhi winter dryness'
  null (if no relevant climate consideration)

Styles must be specific named haircuts from the
list above — not generic advice. E.g. 'Curtain haircut',
'Textured crop', 'Wolf cut', 'French crop',
not 'short hair works for you'.`;
}

export async function getHairRecommendationsFromGemini(
  profile:         HairProfile,
  faceShape:       string | null,
  gender:          string,
  city:            string | null,
  budget:          string,
  matchedProducts: MatchedProduct[],
): Promise<HairRecommendations> {
  const response = await fetchWithRetry(ENDPOINT_TEXT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: buildHairRecsPrompt(profile, faceShape, gender, city, budget, matchedProducts) }],
      }],
      generationConfig: {
        temperature:     0,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini hair recommendations API error ${response.status}: ${error}`);
  }

  const json = await response.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (!text) throw new Error('Gemini returned empty response');

  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  if (!cleaned.endsWith('}')) {
    throw new Error(
      `Gemini response was truncated — increase maxOutputTokens. ` +
      `Last 100 chars: ${cleaned.slice(-100)}`,
    );
  }

  try {
    return JSON.parse(cleaned) as HairRecommendations;
  } catch (e) {
    throw new Error(
      `Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`,
    );
  }
}
