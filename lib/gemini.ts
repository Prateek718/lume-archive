// Gemini 2.5 Flash-Lite — vision analysis of the user's face photo.
// Returns structured JSON with face shape, skin type, scores, etc.

import type { Scan } from '../types';
import type {
  MatchedProduct,
  Recommendations,
  HairProfile,
  HairRecommendations,
  BeardGoal,
} from '../types';
import { isBaldProfile } from '../types';

// Canonical category enum — the Gemini prompts must emit one of these values
// for the `category` field on every routine step + product. Keep in sync with
// constants/productConstants.ts CANONICAL_CATEGORIES.
const CANONICAL_CATEGORY_LIST = [
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
  beardGoal:       BeardGoal | null,
): string {

  // Pre-selected categories from the scoring engine — Gemini writes a
  // user-specific clinical reasoning sentence for each.
  const matchedSection = matchedProducts.length > 0
    ? `Ingredient categories pre-selected for this user:\n${
        matchedProducts.map(p =>
          `- Category: ${p.category}${p.actives && p.actives.length > 0 ? ` (actives: ${p.actives.join(', ')})` : ''}`
        ).join('\n')
      }\n\nFor each category above, write a one-sentence clinical reason tying the category to this specific user's scan observations. Do not name a brand or a specific product.`
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

  // Beard goal context — drives which beard steps appear.
  const beardGoalCtx = beardGoal
    ? `\nBeard goal: ${beardGoal}`
    : `\nBeard goal: clean_simple (default — user has not yet set a goal)`;

  return `You are Lumé — a clinical skin advisor writing prescriptions, not generic recommendations.
Each routine step is a prescription tied to a specific observation in the user's scan. Reasoning must reference what was actually detected, not generic copy.

Gender: ${gender}${ageCtx}${undertoneCtx}${beardGoalCtx}
Face analysis: ${JSON.stringify(analysis)}

${matchedSection}

CANONICAL CATEGORY ENUM — every "category" field on every step and product MUST be one of:
${CANONICAL_CATEGORY_LIST}

Use these IDs verbatim. Do NOT invent new categories. Do NOT use synonyms ("gel moisturiser", "vitamin c") — emit the canonical ID ("moisturizer", "serum_vitamin_c").

EDITORIAL RULES — apply to every field:
- Never begin a field with "Your", "With your", "For your", or any phrase that names a user trait. The app already knows these.
- Use imperative voice for actionable fields. "Do X" — not "You should do X."
- Every field is a single idea.
- advice: max 2 sentences. The FIRST SENTENCE must stand alone as a 1-line preview.
- why (on beard_styles): max 18 words, one sentence, imperative.
- Frame fixed traits as assets, never flaws.
- step_id values must match the documented format EXACTLY. They are stable keys for adherence tracking.

═══════════════════════════════════════════════════════════════
SKIN ROUTINE — variable length, prescription style
═══════════════════════════════════════════════════════════════

Output a single \`steps\` array (NOT separate morning/evening). Each step has a time_of_day array indicating which slots it applies to.

ALWAYS-PRESENT STEPS (3 total):
1. skin_cleanse  → label "Cleanse",   time_of_day ["am","pm"], category "face_cleanser"
2. skin_moisturize → label "Moisturize", time_of_day ["am","pm"], category "moisturizer"
3. skin_protect  → label "Protect",   time_of_day ["am"],      category "spf_sunscreen"

OPTIONAL TREAT STEPS — insert 0, 1, or 2 based on detected concerns:

  step_id: skin_treat_1 (and skin_treat_2 if a second active is needed)
  label: "Treat"
  target_concern: REQUIRED (e.g. "acne", "hyperpigmentation", "fine_lines", "dehydration", "dark_circles")

Insert ONE Treat step (skin_treat_1) if the user has a single primary concern needing active treatment.
Insert TWO Treat steps (skin_treat_1 + skin_treat_2) ONLY if the user has TWO distinct concerns needing different actives that cannot share a slot (e.g. salicylic acid for acne in AM + retinol for fine lines in PM).

TIME-OF-DAY for actives:
- vitamin C, niacinamide, salicylic acid → AM-friendly (time_of_day ["am"] or ["am","pm"])
- retinol → PM ONLY (time_of_day ["pm"])
- AHA exfoliants → PM ONLY (time_of_day ["pm"])
- hyaluronic acid → either (time_of_day ["am","pm"])
- eye cream → time_of_day ["pm"] (single Treat slot)

ORDER FIELD: 1=skin_cleanse, 2=skin_treat_1, 3=skin_treat_2, 4=skin_moisturize, 5=skin_protect.

NEVER add retinol if age_range is '18-25' or unset.

CLINICAL_REASONING — REQUIRED on every skin step:
Tie the reasoning to THIS USER'S specific observations from the scan. Reference detected zones, concerns, or skin attributes you observed. Do NOT use generic copy.

  Bad (generic):  "Niacinamide is great for oily skin."
  Good (clinical): "Your T-zone shows excess sebum and visible enlarged pores. Niacinamide regulates sebum and reduces pore appearance over 8 weeks."
  Bad:  "Sunscreen prevents sun damage."
  Good: "Fitzpatrick IV skin in tropical climate is highly susceptible to PIH. SPF 50 mineral filter blocks UV without irritating sensitive zones."

Step shape (skin):
{
  "step_id":           "skin_cleanse" | "skin_treat_1" | "skin_treat_2" | "skin_moisturize" | "skin_protect",
  "label":             "Cleanse" | "Treat" | "Moisturize" | "Protect",
  "time_of_day":       ["am"] | ["pm"] | ["am","pm"],
  "order":             1 | 2 | 3 | 4 | 5,
  "target_concern":    "<concern>" (REQUIRED for Treat steps, omit otherwise),
  "category":          one of the CANONICAL CATEGORY ENUM values,
  "clinical_reasoning": "1–2 sentences tied to this user's scan",
  "product":           generic descriptor (e.g. "Niacinamide serum")
}

═══════════════════════════════════════════════════════════════
BEARD ROUTINE (men only)
═══════════════════════════════════════════════════════════════

If beard_density is "none" → omit beard section entirely (return null).

Otherwise, generate steps based on beard_goal:

  beard_goal = clean_simple:
    Steps: [beard_wash]

  beard_goal = healthy_groomed:
    Steps: [beard_wash, beard_oil]
    beard_oil category: beard_oil with conditioning actives (argan, jojoba, sandalwood)

  beard_goal = growing_thickening:
    Steps: [beard_wash, beard_oil]
    beard_oil should target growth — note in clinical_reasoning that it focuses on follicle stimulation (redensyl, biotin)

  beard_goal = styled:
    Steps: [beard_wash, beard_oil, beard_balm]

If beard_goal is unset or null, default to clean_simple (single beard_wash step) — the app will regenerate once the user sets their goal.

Beard step shape (similar to skin, but cadence-driven):
{
  "step_id":            "beard_wash" | "beard_oil" | "beard_balm",
  "label":              "Cleanse" | "Nourish" | "Shape",
  "time_of_day":        ["am"] | ["pm"] | ["am","pm"],
  "order":              1 | 2 | 3,
  "category":           "beard_wash" | "beard_oil" | "beard_balm",
  "clinical_reasoning": "1–2 sentences tied to this user's beard observations",
  "product":            generic descriptor,
  "cadence":            "daily" | "every_wash" | "weekly" (optional)
}

beard_styles: 2-3 RECOMMENDED styles only.
Each: { "name", "why" (max 18 words), "maintenance": "low"|"medium"|"high" }

═══════════════════════════════════════════════════════════════
MAKEUP RULES (women only)
═══════════════════════════════════════════════════════════════

Base: include ONLY if hyperpigmentation or uneven_texture detected
Brow pencil: ONLY if brow_condition is sparse or ungroomed
Concealer: ONLY if dark_circles detected
Lip: always include 1 lip product (undertone matched)
MAX 3 products total

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

Return ONLY valid JSON. No markdown, no fences, no preamble. Match this shape exactly:

{
  "skin": {
    "advice": "max 2 sentences, first sentence stands alone, imperative",
    "steps": [
      {
        "step_id": "skin_cleanse",
        "label": "Cleanse",
        "time_of_day": ["am","pm"],
        "order": 1,
        "category": "face_cleanser",
        "clinical_reasoning": "Tied to this user's observed skin condition.",
        "product": "Gel cleanser"
      },
      {
        "step_id": "skin_treat_1",
        "label": "Treat",
        "time_of_day": ["am"],
        "order": 2,
        "target_concern": "acne",
        "category": "serum_niacinamide",
        "clinical_reasoning": "Tied to acne observations seen in scan.",
        "product": "Niacinamide serum"
      },
      {
        "step_id": "skin_moisturize",
        "label": "Moisturize",
        "time_of_day": ["am","pm"],
        "order": 4,
        "category": "moisturizer",
        "clinical_reasoning": "Tied to this user's hydration needs.",
        "product": "Gel moisturiser"
      },
      {
        "step_id": "skin_protect",
        "label": "Protect",
        "time_of_day": ["am"],
        "order": 5,
        "category": "spf_sunscreen",
        "clinical_reasoning": "Tied to this user's photodamage risk.",
        "product": "Sunscreen SPF 50"
      }
    ]
  },
  "beard": {
    "advice": "max 2 sentences, imperative",
    "steps": [
      {
        "step_id": "beard_wash",
        "label": "Cleanse",
        "time_of_day": ["am"],
        "order": 1,
        "category": "beard_wash",
        "clinical_reasoning": "Tied to this user's beard observations.",
        "product": "Beard wash"
      }
    ],
    "beard_styles": [
      { "name": "Short boxed beard", "why": "Trim edges sharply to frame a round face.", "maintenance": "medium" }
    ]
  },
  "makeup": {
    "advice": "max 2 sentences, imperative",
    "techniques": ["technique 1", "technique 2"]
  },
  "products": [
    {
      "category": "face_cleanser",
      "name": "Gel cleanser",
      "brand": "category",
      "reason": "1 sentence personalised reason for this category, clinical voice",
      "match_score": 85
    }
  ]
}

Notes:
- products.name and products.brand MUST be generic category descriptors. Always set products.brand to the literal string "category".
- beard is null if gender is woman OR beard_density is "none".
- makeup is null if gender is man.
- skin.steps array must contain at least skin_cleanse, skin_moisturize, skin_protect. Treat steps are optional based on concerns detected.`;
}

export async function getRecommendationsFromGemini(
  gender:          string,
  analysis:        GeminiAnalysis,
  matchedProducts: MatchedProduct[],
  ageRange:        string | null,
  beardGoal:       BeardGoal | null = null,
): Promise<Recommendations> {
  const recsStart = Date.now();
  const response = await fetchWithRetry(ENDPOINT_TEXT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: buildRecsPrompt(gender, analysis, matchedProducts, ageRange, beardGoal) }],
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

  // The app's scoring engine picks the actual products downstream; Gemini
  // describes the ingredient CATEGORY, not a specific product or brand.
  const matchedSection = matchedProducts.length > 0
    ? `Ingredient categories pre-selected for this user:\n${matchedProducts.map(p =>
        `- Category: ${p.category}${p.actives && p.actives.length > 0 ? ` (actives: ${p.actives.join(', ')})` : ''}`
      ).join('\n')}\n\nFor each category above, write a one-sentence personalised reason referencing their specific ${
        bald ? 'scalp type and scalp concern' : 'scalp type, concern, hair texture, wash frequency, and oiling habit'
      }. Describe the category only — do not name a brand or specific product.`
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

step_id FORMAT — required on every routine step. Use ONLY these canonical IDs:
  hair_shampoo, hair_conditioner, hair_oil, hair_serum, hair_mask

cadence — required on every routine step, one of:
  "every_wash" | "weekly" | "monthly"

CANONICAL CATEGORY ENUM — every "category" field must be one of:
${CANONICAL_CATEGORY_LIST}

clinical_reasoning — REQUIRED on every step. 1-2 sentences tying the step to this user's specific scalp/hair observations. Not generic copy.

Return ONLY a valid JSON object with no markdown, no code fences, no explanation, matching this exact structure:
{
  "advice": "max 2 sentences, first sentence stands alone as preview, imperative",
  "styles": [],
  "styles_detailed": [],
  "condition_explanation": "max 2 sentences, no trait-naming openings",
  "routine": [
    { "step_id": "hair_shampoo",     "label": "Cleanse", "product": "Gentle scalp shampoo", "category": "hair_shampoo",     "cadence": "every_wash", "level": "simple",   "order": 1, "clinical_reasoning": "Tied to this user's scalp condition." },
    { "step_id": "hair_conditioner", "label": "Hydrate", "product": "Scalp moisturiser",    "category": "hair_conditioner", "cadence": "every_wash", "level": "simple",   "order": 2, "clinical_reasoning": "Tied to this user's hydration needs." },
    { "step_id": "hair_serum",       "label": "Treat",   "product": "Scalp serum",          "category": "hair_serum",       "cadence": "weekly",     "level": "full",     "order": 4, "clinical_reasoning": "Tied to this user's primary scalp concern." }
  ],
  "products": [
    {
      "category": "scalp_serum",
      "name": "Scalp serum",
      "brand": "category",
      "reason": "personalised one sentence referencing scalp type and concern",
      "match_score": <integer 60-100>
    }
  ]
}

products.name and products.brand MUST be generic category descriptors (e.g.
"Scalp serum", "Gentle shampoo", "Hair oil"). Do NOT name a specific brand
or product — the app's scoring engine picks the actual product from the
catalogue. Always set products.brand to the literal string "category".

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

step_id FORMAT — required on every routine step. Use ONLY these canonical IDs:
  hair_shampoo, hair_conditioner, hair_oil, hair_serum, hair_mask

cadence — required on every routine step, one of:
  "every_wash" | "weekly" | "monthly"

CANONICAL CATEGORY ENUM — every "category" field must be one of:
${CANONICAL_CATEGORY_LIST}

clinical_reasoning — REQUIRED on every step. 1-2 sentences tying the step to this user's specific hair/scalp observations. Not generic copy.

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
    { "step_id": "hair_shampoo",     "label": "Cleanse",   "product": "Shampoo",     "category": "hair_shampoo",     "cadence": "every_wash", "level": "simple",   "order": 1, "clinical_reasoning": "Tied to this user's scalp type and concern." },
    { "step_id": "hair_conditioner", "label": "Condition", "product": "Conditioner", "category": "hair_conditioner", "cadence": "every_wash", "level": "simple",   "order": 2, "clinical_reasoning": "Tied to this user's hair texture and length." },
    { "step_id": "hair_oil",         "label": "Nourish",   "product": "Hair oil",    "category": "hair_oil",         "cadence": "weekly",     "level": "balanced", "order": 3, "clinical_reasoning": "Tied to this user's hydration needs." },
    { "step_id": "hair_serum",       "label": "Smooth",    "product": "Hair serum",  "category": "hair_serum",       "cadence": "every_wash", "level": "full",     "order": 4, "clinical_reasoning": "Tied to this user's primary concern." }
  ],
  "products": [
    {
      "category": "shampoo",
      "name": "Shampoo",
      "brand": "category",
      "reason": "personalised one sentence referencing scalp type, concern, or texture",
      "match_score": <integer 60-100>
    }
  ]
}

products.name and products.brand MUST be generic category descriptors (e.g.
"Shampoo", "Hair oil", "Leave-in conditioner"). Do NOT name a specific
brand or product — the app's scoring engine picks the actual product from
the catalogue. Always set products.brand to the literal string "category".

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
