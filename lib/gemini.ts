// Gemini pipelines — vision (skin/face) + text (skin/beard/makeup recs, hair recs).
// Rewritten 2026-04-23: editorial "Lumé" voice, severity on concerns,
// care_categories conditionals, static palette swatch lookup, streaming on
// recommendation calls, token/cost logging.

import type {
  Scan,
  MatchedProduct,
  Recommendations,
  HairProfile,
  HairRecommendations,
  BeardGoal,
  SkinConcernObservation,
  Undertone,
  DepthTier,
} from '../types';
import { isBaldProfile } from '../types';
import { logUsage, type ModelName } from './geminiUsage';
import { normalizeConcern } from '../constants/concerns';

// ── Canonical category enum ───────────────────────────────────────────────────
// Must stay in sync with constants/productConstants.ts CANONICAL_CATEGORIES.
// These values are stable keys — changing them breaks adherence tracking.
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

// ── Endpoints & model IDs ─────────────────────────────────────────────────────
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY!;

const MODEL_VISION: ModelName = 'gemini-2.5-pro';
const MODEL_TEXT:   ModelName = 'gemini-2.5-flash';

const ENDPOINT              = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_VISION}:generateContent?key=${API_KEY}`;
const ENDPOINT_TEXT         = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEXT}:generateContent?key=${API_KEY}`;
const ENDPOINT_TEXT_STREAM  = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_TEXT}:streamGenerateContent?alt=sse&key=${API_KEY}`;

// ── Retry wrapper ─────────────────────────────────────────────────────────────
async function fetchWithRetry(
  url:     string,
  options: RequestInit,
  retries: number = 3,
  delayMs: number = 2000,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url, options);
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
  return fetch(url, options);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PALETTE SWATCHES — static lookup, not Gemini-generated
// ═══════════════════════════════════════════════════════════════════════════════
// Six hand-tuned hex values per undertone × depth tier combination.
// Tiers derived from Fitzpatrick scale:
//   fair         = 1-2
//   light_medium = 3
//   medium       = 4 (most common in urban India)
//   tan          = 5
//   deep         = 6
//
// Key format `${undertone}-${tier}`. If we can't classify, return null and
// the screen falls back to prose only.
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
// GEMINI ANALYSIS TYPE — what the vision call returns
// ═══════════════════════════════════════════════════════════════════════════════
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
  skin_concerns_detailed?: SkinConcernObservation[];
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

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE ANCHOR + EDITORIAL RULES — shared across every prompt
// ═══════════════════════════════════════════════════════════════════════════════
const VOICE_ANCHOR = `You are Lumé — an unhurried, editorial observer of Indian skin and faces. Your tone is that of a thoughtful print magazine, not a dermatology dashboard. You notice specifics before you classify. You frame observations as traits to work with, not flaws to fix. You never use the words "prescription," "AI," or marketing superlatives like "amazing" or "perfect." Your writing has quiet authority — confident enough to be specific, humble enough to acknowledge limits.`;

const EDITORIAL_RULES = `Voice rules, apply to every text field:

1. Never begin a field with "Your", "With your", "For your", or any phrase naming a user trait. The app already knows.

2. Imperative voice for actionable copy. "Do X" not "You should do X."

3. Every field carries one idea. If two ideas compete, pick the stronger. Compression beats completeness.

4. advice: max 2 sentences. The FIRST sentence must stand alone as a preview.

5. clinical_reasoning: 1-2 sentences tied to this user's specific observations. Never generic. Reference zones, concerns, or traits you can see evidence of in the analysis JSON. If the user is in Mumbai, say Mumbai. If they have mild dehydration in the cheeks, say that.

6. Bad phrases that must never appear: "prescription", "amazing", "perfect", "holy grail", "life-changing", "game-changer", "miracle", "secret", "hack". Reject AI-sounding language. Reject superlatives.

7. Frame fixed traits as assets. Oval face is a gift, not a condition. Warm undertone is a palette, not a limitation.

8. Concerns are observations, not problems. "Dehydration is asking for attention" not "You have a dehydration problem."`;

// ═══════════════════════════════════════════════════════════════════════════════
// VISION PROMPT — analyseWithGemini
// ═══════════════════════════════════════════════════════════════════════════════
function buildVisionPrompt(
  gender:              string,
  city:                string | null,
  careCategories:      string[],
  ageRange:            string | null | undefined,
  previousScanSummary: string | null | undefined,
): string {
  const wantsMakeup = careCategories.includes('makeup');
  const wantsBeard  = careCategories.includes('beard');

  const climateContext = city
    ? `The user is based in ${city}. Factor in local climate, humidity, pollution, and UV when assessing skin condition. High humidity cities like Mumbai accelerate oiliness and fungal concerns. Dry winters in Delhi drive dehydration and barrier damage. High UV regions drive pigmentation and photoageing.`
    : `No city provided. Use general Indian climate assumptions — moderate humidity, high UV, moderate pollution.`;

  const previousContext = previousScanSummary
    ? `Previous scan summary: ${previousScanSummary}\nCompare current observations against this. Note improvements or regressions. If a concern has resolved, acknowledge it. If a new concern has appeared, flag it.`
    : `This is the user's first scan. No previous context available.`;

  const ageContext = ageRange
    ? `Age range: ${ageRange} — factor age into skin ageing signs and routine complexity.`
    : '';

  // ── Fitzpatrick + undertone block — conditional on makeup ──────────────────
  const fitzpatrickBlock = wantsMakeup
    ? `Step 4 — CLASSIFY Fitzpatrick skin tone (1–6). Indian skin is predominantly IV–VI.
  1 = Very fair, always burns, never tans (rare in India)
  2 = Fair, usually burns, sometimes tans
  3 = Medium, sometimes burns, always tans
  4 = Olive/light brown, rarely burns, always tans (most common in urban India)
  5 = Brown, very rarely burns, tans deeply
  6 = Dark brown/black, never burns, tans deeply

Step 5 — ASSESS SKIN UNDERTONE.
  warm    = golden/peachy/yellow hue, golden jaw — most common in Indian skin
  cool    = pink/rosy/bluish hue, pink-flushed cheeks
  neutral = balanced beige, no dominance
Do not default to cool without clear visual evidence.`
    : `Makeup analysis is not needed for this user. Do not assess Fitzpatrick scale or undertone. Omit fitzpatrick_scale, skin_tone, and skin_undertone from the output.`;

  // ── Score fields — conditional on categories ──────────────────────────────
  const scoreInstructions = [
    `score_skin (always required): integer 0-100, based on visible care effort only (routine evidence, hydration, sun protection).`,
    wantsBeard ? `score_beard (required): integer 0-100, based on visible beard care effort (edge definition, length consistency, cleanliness).` : null,
    wantsMakeup ? `score_makeup (required): integer 0-100, based on brow definition + skin base quality + presentation readiness.` : null,
    `Never penalise fixed traits — score effort only.`,
  ].filter(Boolean).join('\n  ');

  // ── Gender-specific fields ────────────────────────────────────────────────
  const genderBlock = gender === 'woman'
    ? `WOMEN-SPECIFIC:
  beard_density, beard_condition must be null.
  brow_condition: "well_defined" | "sparse" | "ungroomed" | "over_plucked"
  undereye:       "dark_circles" | "puffiness" | "normal"`
    : `MEN-SPECIFIC:
  brow_condition and undereye must be null.
  beard_density:   "none" | "light" | "medium" | "heavy"
  beard_condition: "well_groomed" | "needs_shaping" | "patchy" | "untrimmed"`;

  // ── Severity definitions ──────────────────────────────────────────────────
  const severityBlock = `Step 3b — ASSIGN SEVERITY to each concern. Severity is based on visible extent, not clinical inference. One of "mild" | "moderate" | "significant". Also record zones (e.g. ["t_zone","cheeks"]) and a short notes string describing the evidence.

acne:
  mild        = 1-3 visible spots, localized to one zone
  moderate    = 4-8 spots OR multiple zones affected
  significant = 9+ spots OR nodular/cystic presentations

dehydration:
  mild        = subtle dullness, no surface lines
  moderate    = visible fine surface lines when skin moves in the image
  significant = deep fine-line patterns, crepey texture across cheeks

hyperpigmentation:
  mild        = 1-2 faint spots OR subtle unevenness
  moderate    = multiple spots OR clear zone-level unevenness
  significant = widespread melasma-pattern pigmentation OR deeply pigmented post-acne marks

dark_circles:
  mild        = faint periorbital shadow
  moderate    = clear darkening, noticeable but not dramatic
  significant = deep periorbital darkness, obvious at first glance

uneven_texture:
  mild        = slight bumps or pore visibility in T-zone
  moderate    = visible roughness across multiple zones
  significant = prominent textural irregularity, crepey or cobblestone patterns

oiliness:
  mild        = T-zone shine only
  moderate    = T-zone plus cheek shine
  significant = overall facial shine including jawline

dryness:
  mild        = localized flaking OR tight appearance in one zone
  moderate    = flaking across cheeks OR visible tightness in multiple zones
  significant = widespread flaking, visibly parched texture`;

  // ── Output schema fields — dynamically built from careCategories ──────────
  const schemaLines: (string | null)[] = [
    `"face_shape": one of ["oval","round","square","heart","oblong","diamond"]`,
    `"skin_type": one of ["oily","dry","combination","normal","sensitive"]`,
    `"skin_concerns": array of concern names (subset of acne, dryness, oiliness, dark_circles, uneven_texture, dehydration, hyperpigmentation) — mirror names from skin_concerns_detailed`,
    `"skin_concerns_detailed": array of objects { "concern": string, "severity": "mild"|"moderate"|"significant", "zones": string[] (optional), "notes": string (optional), "display_label": string (REQUIRED — 2-5 words, sentence case, context-aware) }`,
    gender === 'woman'
      ? `"beard_density": null, "beard_condition": null`
      : `"beard_density": one of ["none","light","medium","heavy"]\n  "beard_condition": one of ["well_groomed","needs_shaping","patchy","untrimmed"]`,
    gender === 'woman'
      ? `"brow_condition": one of ["well_defined","sparse","ungroomed","over_plucked"]\n  "undereye": one of ["dark_circles","puffiness","normal"]`
      : `"brow_condition": null, "undereye": null`,
    wantsMakeup ? `"fitzpatrick_scale": integer 1–6` : null,
    wantsMakeup ? `"skin_tone": one of ["Very fair","Fair","Medium","Olive","Brown","Dark brown"]` : null,
    wantsMakeup ? `"skin_undertone": one of ["warm","cool","neutral"]` : null,
    `"score_skin": integer 0-100`,
    wantsBeard  ? `"score_beard": integer 0-100` : null,
    wantsMakeup ? `"score_makeup": integer 0-100` : null,
    `"confidence": { "face_shape": number 0.0–1.0${wantsMakeup ? `, "skin_undertone": number 0.0–1.0` : ''} }`,
    `"alternatives": { "face_shape": a second-best choice OR null${wantsMakeup ? `, "skin_undertone": one of undertone values OR null` : ''} }`,
  ].filter((s): s is string => Boolean(s));

  return `${VOICE_ANCHOR}

USER CONTEXT:
Gender: ${gender}
${ageContext ? ageContext + '\n' : ''}${climateContext}
${previousContext}

Care categories selected: ${careCategories.join(', ') || 'skin'}

CLINICAL OBSERVATION — move through these steps in order.

Step 1 — OBSERVE before classifying. Look carefully at specific zones: T-zone, cheeks and temples, periorbital area, jawline, lip area. Note texture, shine, pores, tone, and any lesions per zone.

Step 2 — CLASSIFY skin_type from observations, not assumptions. Do not assume skin type from gender or age.
  oily        = visible shine across T-zone AND cheeks, enlarged pores
  dry         = visible flaking, tight texture, dull finish
  combination = shine confined to T-zone only, normal to dry cheeks
  normal      = even texture, no shine, no flaking
  sensitive   = visible redness, reactive patches, surface capillaries

Step 3 — IDENTIFY specific concerns. Only flag concerns you can see evidence of. Do not infer from skin type alone.
  acne              = visible active pimples, pustules, papules, or nodules — not just pores
  dryness           = visible flaking, rough texture, or tight-looking skin surface
  oiliness          = visible sebum shine, especially outside T-zone
  dark_circles      = visible periorbital darkening or discolouration
  uneven_texture    = visible bumps, roughness, enlarged pores, or surface irregularity
  dehydration       = dull, lacklustre, fine surface lines — distinct from dryness
  hyperpigmentation = visible dark spots, post-acne marks, melasma, or uneven tone

${severityBlock}

DISPLAY LABEL RULES (skin_concerns_detailed[].display_label):
- 2-5 words, sentence case. This string is shown to users directly.
- Context-aware: combine severity + zone cues from the same object. Examples:
    "dehydration" + mild                       → "Mild dehydration"
    "dehydration" + moderate + ["cheeks"]      → "Dehydration · cheeks"
    "hyperpigmentation" + mild + ["cheeks"]    → "Post-acne marks · cheeks"
    "hyperpigmentation" + moderate             → "Uneven tone"
    "dark_circles" + mild                      → "Early dark circles"
    "dark_circles" + moderate                  → "Dark circles"
    "uneven_texture" + mild + ["t_zone"]       → "Rough texture · t-zone"
    "oiliness" + significant                   → "Persistent oiliness"
    "acne" + moderate + ["jawline"]            → "Breakouts · jawline"
- NEVER use medical-sounding terms in display_label: "hyperpigmentation", "sebum", "comedones", "periorbital", "erythema". Users see this text directly.
- Zone chips inside display_label should read naturally ("cheeks", "t-zone", "jawline") — not the underscored enum ("t_zone").
- Keep it short enough to fit on one line next to the severity dots.

${fitzpatrickBlock}

Step 6 — ASSESS care evidence.
  ${scoreInstructions}
  85-100 = exceptional routine evident
  70-84  = good routine
  50-69  = basic care
  <50    = minimal routine

${genderBlock}

CONFIDENCE RULES (TRAIT fields only — face_shape${wantsMakeup ? ', skin_undertone' : ''}):
- confidence reflects how clearly the photo supports your classification of a TRAIT. Lighting, angle, and partial occlusion reduce confidence.
- Borderline between two categories → 0.55–0.70 and name the second category in alternatives.
- Unambiguous → ≥ 0.85 and alternatives: null.
- State fields (skin_concerns, density, scores) are direct observations and do not get confidence.

FEW-SHOT EXAMPLES (follow the shape exactly):

Example A — woman in Mumbai, skin+hair+makeup selected:
{
  "face_shape": "oval",
  "skin_type": "combination",
  "skin_concerns": ["dehydration", "hyperpigmentation"],
  "skin_concerns_detailed": [
    { "concern": "dehydration", "severity": "moderate", "zones": ["cheeks"], "notes": "fine surface lines visible when skin moves", "display_label": "Dehydration · cheeks" },
    { "concern": "hyperpigmentation", "severity": "mild", "zones": ["cheeks"], "notes": "two post-acne marks on right cheek", "display_label": "Post-acne marks · cheeks" }
  ],
  "fitzpatrick_scale": 4,
  "skin_tone": "Olive",
  "skin_undertone": "warm",
  "score_skin": 72,
  "score_makeup": 68,
  "brow_condition": "well_defined",
  "undereye": "normal",
  "confidence": { "face_shape": 0.88, "skin_undertone": 0.82 },
  "alternatives": { "face_shape": null, "skin_undertone": null }
}

Example B — man in Delhi, skin+hair+beard selected (no makeup → no Fitzpatrick):
{
  "face_shape": "square",
  "skin_type": "oily",
  "skin_concerns": ["acne", "oiliness"],
  "skin_concerns_detailed": [
    { "concern": "acne", "severity": "moderate", "zones": ["t_zone", "jawline"], "notes": "five active spots across T-zone, two on jawline", "display_label": "Breakouts · jawline" },
    { "concern": "oiliness", "severity": "moderate", "zones": ["t_zone", "cheeks"], "display_label": "Oiliness across face" }
  ],
  "beard_density": "medium",
  "beard_condition": "needs_shaping",
  "score_skin": 61,
  "score_beard": 55,
  "confidence": { "face_shape": 0.75 },
  "alternatives": { "face_shape": "oblong" }
}

Return ONLY a valid JSON object. No markdown, no code fences, no preamble, no explanation.

Return exactly these fields:
{
  ${schemaLines.join(',\n  ')}
}`.trim();
}

// ── analyseWithGemini ─────────────────────────────────────────────────────────
export async function analyseWithGemini(
  base64Image:          string,
  city:                 string | null,
  gender:               string,
  careCategories:       string[],
  ageRange?:            string | null,
  previousScanSummary?: string | null,
  scanId?:              string | null,
): Promise<GeminiAnalysis> {
  const visionStart = Date.now();
  let inputTokens   = 0;
  let outputTokens  = 0;

  try {
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
            { text: buildVisionPrompt(gender, city, careCategories, ageRange, previousScanSummary) },
          ],
        }],
        generationConfig: {
          temperature:     0,
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
    inputTokens  = json?.usageMetadata?.promptTokenCount     ?? 0;
    outputTokens = json?.usageMetadata?.candidatesTokenCount ?? 0;

    const stripped = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const firstBrace = stripped.indexOf('{');
    const lastBrace  = stripped.lastIndexOf('}');
    const cleaned    = firstBrace !== -1 && lastBrace !== -1
      ? stripped.slice(firstBrace, lastBrace + 1)
      : stripped;

    if (!cleaned.includes('{')) {
      throw new Error(`Gemini vision returned no JSON. Response: ${cleaned.slice(0, 200)}`);
    }

    const parsed = JSON.parse(cleaned) as GeminiAnalysis;

    // Backward compat: derive legacy skin_concerns[] from the new detailed array.
    if (parsed.skin_concerns_detailed && parsed.skin_concerns_detailed.length > 0) {
      parsed.skin_concerns = parsed.skin_concerns_detailed.map(o => o.concern);

      // Synthesize display_label for any entry that Gemini forgot to emit one for.
      // Falls back to a human-readable title-cased version of the canonical concern id.
      for (const c of parsed.skin_concerns_detailed) {
        if (!c.display_label || !c.display_label.trim()) {
          c.display_label = c.concern
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
      }
    }

    void logUsage({
      callType:     'vision',
      model:        MODEL_VISION,
      inputTokens,
      outputTokens,
      durationMs:   Date.now() - visionStart,
      success:      true,
      scanId:       scanId ?? null,
    });

    return parsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    void logUsage({
      callType:     'vision',
      model:        MODEL_VISION,
      inputTokens,
      outputTokens,
      durationMs:   Date.now() - visionStart,
      success:      false,
      errorMessage: msg,
      scanId:       scanId ?? null,
    });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STREAMING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

interface StreamResult {
  text:         string;
  inputTokens:  number;
  outputTokens: number;
}

// Attempts a streaming read via response.body.getReader. If the RN runtime
// doesn't expose a reader, falls back to a single text() read and parses the
// SSE frames from the buffered body. Returns accumulated text + token totals.
async function streamGeminiSSE(
  url:         string,
  body:        RequestInit,
  onPartialText?: (accumulated: string) => void,
): Promise<StreamResult> {
  const response = await fetchWithRetry(url, body);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini streaming error ${response.status}: ${error}`);
  }

  let accumulated  = '';
  let inputTokens  = 0;
  let outputTokens = 0;

  // Process one SSE line: "data: {...}". Gemini's streamGenerateContent emits
  // single-newline-delimited frames, so we operate per-line, not per-frame.
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
    } catch (err) {
      console.warn('[gemini recs] Failed to parse SSE frame:', jsonStr.slice(0, 100), err);
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
    // NOTE: React Native's built-in fetch does not reliably expose response.body.getReader().
    // On device, this fallback branch always runs. onPartial fires once at end, not progressively.
    // True token-by-token streaming would require expo-fetch streaming, a native SSE module, or XHR
    // polyfill. Logged as future enhancement — not worth investing before v1 launch. Cost logging
    // and output parsing are unaffected.
    //
    // Fallback: RN fetch without streaming body. Read the full text and parse
    // each SSE line in one go. Still hits the streamGenerateContent endpoint
    // so we get consistent usage metadata.
    const full = await response.text();
    const lines = full.split('\n');
    for (const line of lines) processLine(line);
  }

  // Strip markdown code fences Gemini sometimes wraps the JSON in, then narrow
  // to the outermost { ... } so the caller can JSON.parse directly.
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

  return { text: cleaned, inputTokens, outputTokens };
}

// Extract the largest valid JSON object from a possibly-truncated buffer.
// Returns null if no balanced object can be parsed.
function tryParsePartialJson(raw: string): unknown | null {
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

// ═══════════════════════════════════════════════════════════════════════════════
// SKIN / BEARD / MAKEUP RECS PROMPT
// ═══════════════════════════════════════════════════════════════════════════════
// Ordinal + cardinal helpers for the observation's title and issue label.
// Kept in JS (not prompt rules) so output shape is deterministic.
function ordinal(n: number): string {
  if (n === 1) return 'first';
  if (n === 2) return 'second';
  if (n === 3) return 'third';
  if (n === 4) return 'fourth';
  if (n === 5) return 'fifth';
  return `${n}th`;
}

function cardinal(n: number): string {
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (n === 3) return 'three';
  if (n === 4) return 'four';
  if (n === 5) return 'five';
  return String(n);
}

function buildSkinRecsPrompt(
  gender:          string,
  analysis:        GeminiAnalysis,
  matchedProducts: MatchedProduct[],
  careCategories:  string[],
  ageRange:        string | null,
  beardGoal:       BeardGoal | null,
  scanNumber:      number,
  includeMakeup:   boolean,
): string {
  const wantsSkin   = true;                                     // always on
  // includeMakeup is the caller-supplied gate: true only when the user has
  // makeup in care_categories AND we've decided to regenerate this scan
  // (first scan, or undertone/depth_tier/fitzpatrick has shifted).
  const wantsMakeup = includeMakeup && careCategories.includes('makeup') && gender === 'woman';
  const wantsBeard  =
    careCategories.includes('beard') &&
    gender !== 'woman' &&
    !!analysis.beard_density &&
    analysis.beard_density !== 'none';

  const matchedSection = matchedProducts.length > 0
    ? `Ingredient categories pre-selected for this user:\n${
        matchedProducts.map(p =>
          `- ${p.category}${p.actives && p.actives.length > 0 ? ` (actives: ${p.actives.join(', ')})` : ''}`
        ).join('\n')
      }\n\nFor each, write a one-sentence clinical reason tying the category to this user's specific observations. Do not name a brand or specific product.`
    : '';

  const beardGoalCtx = wantsBeard
    ? `\nBeard goal: ${beardGoal ?? 'none (default — light maintenance only)'}`
    : '';

  const ageCtx = ageRange ? `\nAge range: ${ageRange}` : '';

  // ── Skin section (always present) ─────────────────────────────────────────
  const skinBlock = `
SKIN ROUTINE — variable length.

Emit a single \`skin.steps\` array (not separate morning/evening). Each step carries a time_of_day array.

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

Step shape (skin):
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

ROUTINE NOTE (skin.routine_note) — REQUIRED. A single editorial meta-observation
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

  // ── Beard section — only when requested ───────────────────────────────────
  // beard_goal taxonomy (user-facing, stored verbatim in DB):
  //   fuller   → user wants to fill in cheeks/sides
  //   sharper  → user wants cleaner edges and jawline definition
  //   shorter  → user wants a neat, professional, low-maintenance look
  //   longer   → user wants to grow length out
  //   none     → no particular goal; default light maintenance
  const beardBlock = wantsBeard
    ? `
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
`
    : '';

  // ── Makeup section — only when requested ──────────────────────────────────
  const makeupBlock = wantsMakeup
    ? `
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
`
    : '';

  // ── Observation section — emitted FIRST so it streams first ──────────────
  const observationTitle      = `A ${ordinal(scanNumber)} observation.`;
  const observationIssueLabel = `Issue ${cardinal(scanNumber)} · cover`;

  const observationBlock = `
OBSERVATION — the editorial first-reveal shown immediately after the scan.
This section MUST appear FIRST in the JSON output (before skin, beard, makeup, products) so it streams first and the user sees it while the rest generates.

Three insights, always. Narrate the scan in editorial order:

  01 — Start positive. What's working? What's healthy? Lead with genuine strength.
       Example headlines: "Mostly well", "Healthy foundation", "A balanced start"

  02 — Main friction. The single most important concern. If multiple concerns
       exist, pick the one with highest severity + clearest path to improvement.
       Example headlines: "A little thirsty" (dehydration), "Oil is louder"
       (oiliness), "Shadow returns" (dark circles)

  03 — Secondary observation OR forward-looking note. A second concern, a
       positive trajectory comment, or a nod to what the routine will address.
       Example headlines: "Pores speak up", "Scalp needs attention", "Ready for texture work"

HEADLINE RULES:
  - 2-4 words.
  - No "Your".
  - No sentence-enders (no periods, no exclamations).
  - Words that stand as editorial magazine section titles.

BODY RULES:
  - 1-2 sentences. Max 150 characters total.
  - Tied to specific observations in the analysis JSON (zones, severity, traits).
  - Use severity language gently — "mild dehydration is the single friction point" not "you have significant dehydration".
  - No clinical jargon:
      "sebum regulation"  → say "oil settles"
      "barrier function"  → say "skin holding strong"
      "hyperpigmentation" → say "uneven tone" or "tone patches"
  - Voice anchor for observation: thoughtful print magazine profile of the
    person's skin. Each insight is a short paragraph of consequence, not a
    diagnostic note.

TRAIT CHIPS — 4-7 short lowercase descriptors, drawn from analysis JSON +
hair_profile (if provided) + care_categories scope. Sources per chip type:
  - Skin   (always):                   "<type> skin"              e.g. "oily skin", "combination skin"
  - Tone   (only if makeup selected):  "<undertone> <depth> tone" e.g. "warm medium tone"
  - Hair   (only if hair_profile):     "<texture> <length> hair"  e.g. "wavy medium hair", or "bald" if bald
  - Scalp  (only if hair_profile):     "<scalp_type> scalp"       e.g. "oily scalp"
  - Beard  (only if beard_density present and not 'none'): "<density>-density beard"

Never include trait chips for categories the user did not select. A woman with
skin+hair+makeup gets no beard chip. A man with skin+hair+beard but no hair
profile passed in gets no hair/scalp chips.

EXCLUSIONS — face_shape is INTERNAL-ONLY and must NEVER surface in observation output:
  - Do NOT include face_shape in trait_chips (e.g. no "oval face", "oblong face",
    "round face", "square face", "heart face", "diamond face", "triangle face").
  - Do NOT include face_shape in any insight headline ("01", "02", "03").
  - Do NOT include face_shape in any insight body. Never write "oval face",
    "your oblong face shape", "round facial shape", "heart-shaped face",
    or any phrase that names a categorical face shape.
  - Do NOT include face_shape in the dek.
  - Face shape drives hair/beard/makeup recommendations internally but is NOT
    surfaced to the user as a descriptor — users disagree with categorical
    face-shape labels and it erodes trust.
  - If you want to reference structural proportions, use descriptive language
    instead: "balanced proportions", "even structure", "strong jawline",
    "defined cheekbones". These describe observed features without assigning
    a category.

TITLE + ISSUE LABEL are computed for you — use these EXACT strings:
  observation.title       = "${observationTitle}"
  observation.issue_label = "${observationIssueLabel}"

Do not invent or modify them. Copy them verbatim.

DEK — one line, italic voice, 6-10 words. Examples of the register:
  "What we saw, in three short movements."
  "Three observations, read in order."
  "A quiet reading, in three parts."
Pick one that fits this scan's tone. No trait-naming openings.
`;

  // ── Output JSON schema ────────────────────────────────────────────────────
  const schemaBlock = `
OUTPUT JSON SHAPE (return ONLY valid JSON, no markdown, no preamble):
{
  "observation": {
    "title":       "${observationTitle}",
    "issue_label": "${observationIssueLabel}",
    "dek":         "italic-voice sub-title, 6-10 words",
    "insights": [
      { "number": "01", "headline": "2-4 words", "body": "1-2 sentences, max 150 chars" },
      { "number": "02", "headline": "2-4 words", "body": "1-2 sentences, max 150 chars" },
      { "number": "03", "headline": "2-4 words", "body": "1-2 sentences, max 150 chars" }
    ],
    "trait_chips": ["oily skin", "..."]
  },
  "skin": {
    "advice":       "max 2 sentences, first stands alone as preview, imperative",
    "routine_note": "2-3 sentences, max ~160 chars, editorial meta-observation. No 'your' or 'you'.",
    "steps":        [ ... ]
  },
  ${wantsBeard  ? '"beard":  { "advice": "...", "beard_shape_intro": "1-2 sentence bridge or null", "steps": [ ... ], "beard_styles": [ ... ] },' : '"beard":  null,'}
  ${wantsMakeup ? '"makeup": { "advice": "...", "techniques": [ ... ], "palette": { ... } | null },' : '"makeup": null,'}
  "products": [
    { "category": "<canonical enum>", "name": "<generic descriptor>", "brand": "category", "reason": "one sentence, clinical voice", "match_score": <integer 60-100> }
  ]
}

observation MUST be the first key in the JSON (it streams first).
products.name is a generic descriptor. products.brand is ALWAYS the literal string "category".`;

  // ── Few-shot examples ─────────────────────────────────────────────────────
  const skinExample = `
FEW-SHOT — skin routine for combination skin with moderate dehydration (cheeks) + mild hyperpigmentation:

"skin": {
  "advice": "Lead with hydration — the cheeks show moderate surface lines, and plumping that barrier unlocks everything else. Layer a brightening active before the moisturiser to start softening the post-acne marks.",
  "routine_note": "Keep it short. Four steps, done consistently, will outperform twelve steps done some of the time.",
  "steps": [
    { "step_id": "skin_cleanse",   "label": "Cleanse",    "time_of_day": ["am","pm"], "order": 1, "category": "face_cleanser",          "clinical_reasoning": "Combination skin with a moderately dehydrated barrier on the cheeks. A low-pH gel cleanser lifts oil from the T-zone without stripping the cheeks.", "product": "Low-pH gel cleanser" },
    { "step_id": "skin_treat_1",   "label": "Treat",      "time_of_day": ["am"],      "order": 2, "target_concern": "hyperpigmentation", "category": "serum_vitamin_c",        "clinical_reasoning": "Two post-acne marks on the right cheek, rated mild. Vitamin C 10% nudges pigment turnover without provoking the already-dehydrated barrier.",           "product": "Vitamin C serum (10%)" },
    { "step_id": "skin_moisturize","label": "Moisturize", "time_of_day": ["am","pm"], "order": 4, "category": "moisturizer",            "clinical_reasoning": "Moderate fine surface lines on the cheeks. A hyaluronic-rich gel cream seals water into the stratum corneum through the day.",                    "product": "Hyaluronic gel cream" },
    { "step_id": "skin_protect",   "label": "Protect",    "time_of_day": ["am"],      "order": 5, "category": "spf_sunscreen",          "clinical_reasoning": "Fitzpatrick IV in Mumbai — high PIH risk on any unprotected pigment. SPF 50 with iron oxides shields visible light too.",                      "product": "Mineral SPF 50" }
  ]
}`;

  const observationExample = `

FEW-SHOT — observation for a man in Kolkata, skin+hair+beard, oily skin with moderate oiliness, dark circles, medium beard (scan number 1):

"observation": {
  "title": "A first observation.",
  "issue_label": "Issue one · cover",
  "dek": "What we saw, in three short movements.",
  "insights": [
    {
      "number": "01",
      "headline": "Healthy foundation",
      "body": "Skin structure reads well — balanced proportions, even tone across the forehead. The fundamentals are here; this is an easy base to work with."
    },
    {
      "number": "02",
      "headline": "Oil is louder",
      "body": "T-zone and cheeks show moderate shine, amplified by Kolkata's humidity. Regulating this is the first move."
    },
    {
      "number": "03",
      "headline": "Shadow returns",
      "body": "Periorbital darkening, a few shades deeper than surrounding skin. Consistent sleep and a targeted treatment will soften it."
    }
  ],
  "trait_chips": ["oily skin", "medium-density beard"]
}
`;

  const makeupExample = wantsMakeup ? `

FEW-SHOT — warm, medium palette makeup output:

"makeup": {
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
}` : '';

  return `${VOICE_ANCHOR}

${EDITORIAL_RULES}

USER CONTEXT:
Gender: ${gender}${ageCtx}${beardGoalCtx}
Care categories: ${careCategories.join(', ')}
Analysis JSON: ${JSON.stringify(analysis)}

${matchedSection}

CANONICAL CATEGORY ENUM — every "category" field on every step and product MUST be one of:
${CANONICAL_CATEGORY_LIST}
Use these IDs verbatim. Never invent new categories or use synonyms.

step_id values are stable keys for adherence tracking — they must match the documented format EXACTLY.
${observationBlock}${skinBlock}${beardBlock}${makeupBlock}
${schemaBlock}
${observationExample}${skinExample}${makeupExample}
`.trim();
}

// ── getRecommendationsFromGemini ──────────────────────────────────────────────
export async function getRecommendationsFromGemini(
  gender:          string,
  analysis:        GeminiAnalysis,
  matchedProducts: MatchedProduct[],
  careCategories:  string[],
  ageRange:        string | null,
  beardGoal:       BeardGoal | null = null,
  scanNumber:      number = 1,
  options?: {
    onPartial?:     (partial: Partial<Recommendations>) => void;
    scanId?:        string | null;
    includeMakeup?: boolean;
  },
): Promise<Recommendations> {
  // Default to true preserves prior behaviour for any caller that hasn't
  // been updated yet (e.g. refreshRecommendations, gemini-test screen).
  const includeMakeup = options?.includeMakeup ?? true;
  const start       = Date.now();
  let inputTokens   = 0;
  let outputTokens  = 0;

  try {
    const body: RequestInit = {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: buildSkinRecsPrompt(gender, analysis, matchedProducts, careCategories, ageRange, beardGoal, scanNumber, includeMakeup),
          }],
        }],
        generationConfig: {
          temperature:     0,
          // Headroom for skin + beard sections plus optional makeup; bump if
          // a future field push causes truncation.
          maxOutputTokens: 6144,
        },
      }),
    };

    const onPartialText = options?.onPartial
      ? (accumulated: string) => {
          const maybe = tryParsePartialJson(accumulated);
          if (maybe && typeof maybe === 'object') {
            options.onPartial!(maybe as Partial<Recommendations>);
          }
        }
      : undefined;

    const { text, inputTokens: it, outputTokens: ot } =
      await streamGeminiSSE(ENDPOINT_TEXT_STREAM, body, onPartialText);
    inputTokens  = it;
    outputTokens = ot;

    if (!text) throw new Error('Gemini returned empty response');

    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    if (!cleaned.endsWith('}')) {
      throw new Error(
        `Gemini response was truncated — increase maxOutputTokens. Last 100 chars: ${cleaned.slice(-100)}`,
      );
    }

    const parsed = JSON.parse(cleaned) as Recommendations;

    // Defense in depth: strip any face-shape chip Gemini emitted despite the
    // prompt rule. face_shape drives recommendations internally; surfacing it
    // as a chip erodes trust when users disagree with the classification.
    const FACE_SHAPE_PATTERNS = /\b(oval|round|square|heart|oblong|diamond|triangle)\s+face\b/i;
    if (parsed.observation?.trait_chips) {
      parsed.observation.trait_chips = parsed.observation.trait_chips.filter(
        chip => !FACE_SHAPE_PATTERNS.test(chip),
      );
    }

    // Defense in depth (prose): strip any sentence that names a categorical
    // face shape from insight bodies and the dek. The prompt forbids this but
    // Gemini still leaks it occasionally — same trust concern as the trait_chips.
    // Non-global regex so .test() is stateless; fresh each call.
    const faceShapeProse = () =>
      /\b(oval|round|square|heart|oblong|diamond|triangle)[\s-]+(face|facial|shape)\b/i;
    const stripFaceShapeSentences = (text: string): string => {
      const sentences = text.split(/(?<=[.!?])\s+/);
      const cleaned = sentences.filter(s => !faceShapeProse().test(s));
      return cleaned.join(' ').replace(/\s+/g, ' ').trim();
    };
    if (parsed.observation?.insights) {
      for (const insight of parsed.observation.insights) {
        if (insight.body && faceShapeProse().test(insight.body)) {
          insight.body = stripFaceShapeSentences(insight.body);
        }
      }
    }
    if (parsed.observation?.dek && faceShapeProse().test(parsed.observation.dek)) {
      parsed.observation.dek = stripFaceShapeSentences(parsed.observation.dek);
    }

    // Sanitize beard_shape_intro — null it out if missing/blank, or if it
    // names a categorical face_shape (which the prompt explicitly forbids).
    if (parsed.beard) {
      const intro = parsed.beard.beard_shape_intro;
      if (typeof intro !== 'string' || intro.trim().length === 0) {
        parsed.beard.beard_shape_intro = null;
      } else if (faceShapeProse().test(intro)) {
        parsed.beard.beard_shape_intro = null;
      } else {
        parsed.beard.beard_shape_intro = intro.trim();
      }
    }

    // Normalize target_concern on every routine step to the canonical enum.
    // Catalog scoring relies on exact string equality against CANONICAL_CONCERNS;
    // an un-normalizable value would silently miss the +15 target-match boost,
    // so drop the field in that case rather than let a mystery string through.
    const normalizeSteps = (steps: { target_concern?: string }[] | undefined) => {
      if (!steps) return;
      for (const step of steps) {
        if (!step.target_concern) continue;
        const raw = step.target_concern;
        const normalized = normalizeConcern(raw);
        if (normalized) {
          step.target_concern = normalized;
        } else {
          console.warn(`[gemini] unrecognised target_concern "${raw}" — dropping`);
          delete step.target_concern;
        }
      }
    };
    normalizeSteps(parsed.skin?.steps);
    normalizeSteps(parsed.skin?.routine?.morning);
    normalizeSteps(parsed.skin?.routine?.evening);

    // Fallback for routine_note — if Gemini forgot to emit it, synthesize from
    // the first sentence of advice so the NarratorQuote isn't empty on the UI.
    if (parsed.skin && (!parsed.skin.routine_note || !parsed.skin.routine_note.trim())) {
      const advice = parsed.skin.advice ?? '';
      const firstSentence = advice.match(/^[^.!?]*[.!?]/)?.[0]?.trim();
      parsed.skin.routine_note = firstSentence && firstSentence.length > 0
        ? firstSentence
        : 'A short, consistent routine beats a long inconsistent one.';
    }

    // Validate palette swatches. Post-2026-04-26 schema: Gemini emits 6
    // MakeupSwatch objects ({hex, category, name, description, search_query}).
    // If Gemini's output doesn't validate (missing fields, wrong count), fall
    // back to the static hex lookup — older read paths must handle both shapes
    // via `typeof swatches[0] === 'string'` detection.
    if (parsed.makeup && parsed.makeup.palette) {
      const tier = fitzpatrickToDepthTier(analysis.fitzpatrick_scale);
      const raw = (parsed.makeup.palette as { swatches?: unknown }).swatches;
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
        parsed.makeup.palette = {
          ...parsed.makeup.palette,
          depth_tier: tier ?? parsed.makeup.palette.depth_tier,
        };
      } else {
        // Gemini didn't emit the new schema cleanly — fall back to legacy hex array.
        const fallback = getPaletteSwatches(
          parsed.makeup.palette.undertone,
          analysis.fitzpatrick_scale,
        );
        if (fallback) {
          parsed.makeup.palette = {
            ...parsed.makeup.palette,
            depth_tier: tier ?? parsed.makeup.palette.depth_tier,
            swatches: fallback,
          };
        } else {
          parsed.makeup.palette = null;
        }
      }
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
    const msg = err instanceof Error ? err.message : String(err);
    void logUsage({
      callType:     'skin_recs',
      model:        MODEL_TEXT,
      inputTokens,
      outputTokens,
      durationMs:   Date.now() - start,
      success:      false,
      errorMessage: msg,
      scanId:       options?.scanId ?? null,
    });
    throw err;
  }
}

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

// ── getHairRecommendationsFromGemini ──────────────────────────────────────────
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

    const { text, inputTokens: it, outputTokens: ot } =
      await streamGeminiSSE(ENDPOINT_TEXT_STREAM, body, onPartialText);
    inputTokens  = it;
    outputTokens = ot;

    if (!text) throw new Error('Gemini returned empty response');

    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    if (!cleaned.endsWith('}')) {
      throw new Error(
        `Gemini hair response was truncated — increase maxOutputTokens. Last 100 chars: ${cleaned.slice(-100)}`,
      );
    }

    const parsed = JSON.parse(cleaned) as HairRecommendations;

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
    const msg = err instanceof Error ? err.message : String(err);
    void logUsage({
      callType:     'hair_recs',
      model:        MODEL_TEXT,
      inputTokens,
      outputTokens,
      durationMs:   Date.now() - start,
      success:      false,
      errorMessage: msg,
      scanId:       options?.scanId ?? null,
    });
    throw err;
  }
}

// Keep ENDPOINT_TEXT exported-unused suppressed via a type-only reference if
// any external call site still imports it. (None currently — safe to omit.)
void ENDPOINT_TEXT;
