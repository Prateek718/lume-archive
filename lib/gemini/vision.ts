// Vision pipeline (Gemini 2.5 Pro). One call now produces:
//   - the structured face/skin analysis (face_shape, skin_type, concerns, etc.)
//   - the editorial Observation that streams immediately after the scan
//
// Phase 6.2: observation generation moved here from the skin recs prompt so
// the user sees their reading the moment Phase 1 returns — Phase 2 sections
// (skin/beard/makeup) load in parallel behind it.

import type {
  Scan,
  SkinConcernObservation,
  ScanInsight,
  ScanObservation,
} from '../../types';
import { logUsage } from '../geminiUsage';
import {
  ENDPOINT,
  RETRY_BACKOFF_MS,
  shouldRetry,
  MODEL_VISION,
  VOICE_ANCHOR,
  ordinal,
  cardinal,
  faceShapeProse,
  stripFaceShapeSentences,
  cleanJsonResponse,
} from './shared';

// ═══════════════════════════════════════════════════════════════════════════════
// Output type — vision call now also returns ObservationOutput
// ═══════════════════════════════════════════════════════════════════════════════
export type ObservationOutput = ScanObservation;

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
  | 'fitzpatrick_scale'
  | 'skin_undertone'
> & {
  skin_concerns_detailed?: SkinConcernObservation[];
  observation?:            ObservationOutput;
  confidence?: {
    face_shape?:     number;
    skin_undertone?: number;
  };
  alternatives?: {
    face_shape?:     string | null;
    skin_undertone?: string | null;
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════
function buildVisionPrompt(
  gender:              string,
  city:                string | null,
  careCategories:      string[],
  ageRange:            string | null | undefined,
  previousScanSummary: string | null | undefined,
  scanNumber:          number,
): string {
  const wantsMakeup = careCategories.includes('makeup');

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
    : `Makeup analysis is not needed for this user. Do not assess Fitzpatrick scale or undertone. Omit fitzpatrick_scale and skin_undertone from the output.`;

  // ── Score field — skin condition only (Phase 6.0) ─────────────────────────
  const scoreInstructions = `score_skin (always required): integer 0-100. Measures observable skin CONDITION as visible in the photo. Higher = clearer, more even, healthier-looking skin.

ANCHORS — anchor your score to the concerns you detected in skin_concerns_detailed:
  90-100: No concerns detected, OR all detected concerns are mild. Skin reads clear, even, balanced.
  75-89:  1-2 mild concerns OR 1 moderate concern. Skin reads mostly well with minor observations.
  55-74:  1 significant concern OR 2-3 moderate concerns. Several observable concerns affecting overall presentation.
  35-54:  2+ significant concerns OR 4+ moderate concerns. Notable visible issues across multiple dimensions.
  0-34:   Multiple significant concerns affecting most of the face. Major skin events evident.

Score the skin you actually see, NOT effort, routine, or product evidence.

Lighting variations should be factored neutrally — don't penalize a flatly-lit photo for "looking dull"; don't reward a well-lit photo for "looking glowing". Score the underlying skin state, not the photo quality.`;

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

  // ── Observation block (moved from skin recs prompt in Phase 6.2) ─────────
  const observationTitle      = `A ${ordinal(scanNumber)} observation.`;
  const observationIssueLabel = `Issue ${cardinal(scanNumber)} · cover`;

  const observationBlock = `OBSERVATION — the editorial first-reveal shown immediately after the scan. Emit this as the LAST top-level key in the JSON so the structured analysis fields stream first.

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
  - Tied to specific observations from the analysis you just completed.
  - Use severity language gently — "mild dehydration is the single friction point" not "you have significant dehydration".
  - No clinical jargon:
      "sebum regulation"  → say "oil settles"
      "barrier function"  → say "skin holding strong"
      "hyperpigmentation" → say "uneven tone" or "tone patches"
  - Voice anchor for observation: thoughtful print magazine profile of the
    person's skin. Each insight is a short paragraph of consequence, not a
    diagnostic note.

TRAIT CHIPS — 4-7 short lowercase descriptors, drawn from the analysis +
care_categories scope. Sources per chip type:
  - Skin   (always):                   "<type> skin"              e.g. "oily skin", "combination skin"
  - Tone   (only if makeup selected):  "<undertone> <depth> tone" e.g. "warm medium tone"
  - Beard  (only if beard_density present and not 'none'): "<density>-density beard"

Hair / scalp chips are NOT generated by the vision call — hair lives in a
separate profile and is added by the client when present.

Never include trait chips for categories the user did not select. A woman
with skin+hair+makeup gets no beard chip.

EXCLUSIONS — face_shape is INTERNAL-ONLY and must NEVER surface in observation output:
  - Do NOT include face_shape in trait_chips (e.g. no "oval face", "oblong face",
    "round face", "square face", "heart face", "diamond face", "triangle face").
  - Do NOT include face_shape in any insight headline ("01", "02", "03").
  - Do NOT include face_shape in any insight body. Never write "oval face",
    "your oblong face shape", "round facial shape", "heart-shaped face",
    or any phrase that names a categorical face shape.
  - Do NOT include face_shape in the dek.
  - If you want to reference structural proportions, use descriptive language
    instead: "balanced proportions", "even structure", "strong jawline",
    "defined cheekbones".

TITLE + ISSUE LABEL are computed for you — use these EXACT strings:
  observation.title       = "${observationTitle}"
  observation.issue_label = "${observationIssueLabel}"

Do not invent or modify them. Copy them verbatim.

DEK — one line, italic voice, 6-10 words. Examples of the register:
  "What we saw, in three short movements."
  "Three observations, read in order."
  "A quiet reading, in three parts."
Pick one that fits this scan's tone. No trait-naming openings.`;

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
    wantsMakeup ? `"skin_undertone": one of ["warm","cool","neutral"]` : null,
    `"score_skin": integer 0-100`,
    `"confidence": { "face_shape": number 0.0–1.0${wantsMakeup ? `, "skin_undertone": number 0.0–1.0` : ''} }`,
    `"alternatives": { "face_shape": a second-best choice OR null${wantsMakeup ? `, "skin_undertone": one of undertone values OR null` : ''} }`,
    `"observation": { "title": "${observationTitle}", "issue_label": "${observationIssueLabel}", "dek": "italic-voice sub-title, 6-10 words", "insights": [ {"number":"01","headline":"...","body":"..."}, {"number":"02","headline":"...","body":"..."}, {"number":"03","headline":"...","body":"..."} ], "trait_chips": ["..."] }`,
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

Step 6 — SCORE skin condition.
  ${scoreInstructions}

${genderBlock}

CONFIDENCE RULES (TRAIT fields only — face_shape${wantsMakeup ? ', skin_undertone' : ''}):
- confidence reflects how clearly the photo supports your classification of a TRAIT. Lighting, angle, and partial occlusion reduce confidence.
- Borderline between two categories → 0.55–0.70 and name the second category in alternatives.
- Unambiguous → ≥ 0.85 and alternatives: null.
- State fields (skin_concerns, density, scores) are direct observations and do not get confidence.

${observationBlock}

FEW-SHOT EXAMPLES (follow the shape exactly):

Example A — woman in Mumbai, skin+hair+makeup selected (scan number 1):
{
  "face_shape": "oval",
  "skin_type": "combination",
  "skin_concerns": ["dehydration", "hyperpigmentation"],
  "skin_concerns_detailed": [
    { "concern": "dehydration", "severity": "moderate", "zones": ["cheeks"], "notes": "fine surface lines visible when skin moves", "display_label": "Dehydration · cheeks" },
    { "concern": "hyperpigmentation", "severity": "mild", "zones": ["cheeks"], "notes": "two post-acne marks on right cheek", "display_label": "Post-acne marks · cheeks" }
  ],
  "fitzpatrick_scale": 4,
  "skin_undertone": "warm",
  "score_skin": 78,
  "brow_condition": "well_defined",
  "undereye": "normal",
  "confidence": { "face_shape": 0.88, "skin_undertone": 0.82 },
  "alternatives": { "face_shape": null, "skin_undertone": null },
  "observation": {
    "title": "A first observation.",
    "issue_label": "Issue one · cover",
    "dek": "A quiet reading, in three parts.",
    "insights": [
      { "number": "01", "headline": "Mostly well", "body": "Skin reads clear and even across the forehead. The fundamentals are here — this is an easy base to work with." },
      { "number": "02", "headline": "A little thirsty", "body": "Moderate dehydration on the cheeks shows as fine surface lines when skin moves. Mumbai's humidity can mask this." },
      { "number": "03", "headline": "Tone patches", "body": "Two post-acne marks on the right cheek. Mild — easily worked on with a brightening active over 8 weeks." }
    ],
    "trait_chips": ["combination skin", "warm medium tone"]
  }
}

Example B — man in Delhi, skin+beard selected, no makeup (scan number 1):
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
  "score_skin": 64,
  "confidence": { "face_shape": 0.75 },
  "alternatives": { "face_shape": "oblong" },
  "observation": {
    "title": "A first observation.",
    "issue_label": "Issue one · cover",
    "dek": "Three observations, read in order.",
    "insights": [
      { "number": "01", "headline": "Strong structure", "body": "Balanced proportions and a clear jaw line. The bones are doing real work; the surface needs the help." },
      { "number": "02", "headline": "Oil is louder", "body": "T-zone and cheeks show moderate shine, amplified by Delhi's heat. Regulating this is the first move." },
      { "number": "03", "headline": "Active spots", "body": "Five spots across the T-zone and two on the jawline. Treatable with a salicylic step over 6 to 8 weeks." }
    ],
    "trait_chips": ["oily skin", "medium-density beard"]
  }
}

Return ONLY a valid JSON object. No markdown, no code fences, no preamble, no explanation.

Return exactly these fields:
{
  ${schemaLines.join(',\n  ')}
}`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// analyseWithGemini — single vision call, returns analysis + observation
// ═══════════════════════════════════════════════════════════════════════════════
export async function analyseWithGemini(
  base64Image:          string,
  city:                 string | null,
  gender:               string,
  careCategories:       string[],
  ageRange:             string | null,
  previousScanSummary:  string | null,
  scanId:               string | null,
  scanNumber:           number,
): Promise<GeminiAnalysis> {
  const visionStart = Date.now();
  let inputTokens   = 0;
  let outputTokens  = 0;

  let lastError:         unknown = null;
  let lastRawResponse    = '';
  let lastFinishReason:  string | null = null;
  let lastSafetyRatings: unknown | null = null;
  let didRetry          = false;

  // At most TWO attempts: initial + at most one conditional retry.
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      console.warn(`[gemini vision] retry attempt 2/2 after ${RETRY_BACKOFF_MS}ms (finish_reason: ${lastFinishReason ?? 'unknown'})`);
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
    }

    try {
      const response = await fetch(ENDPOINT, {
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
              { text: buildVisionPrompt(gender, city, careCategories, ageRange, previousScanSummary, scanNumber) },
            ],
          }],
          generationConfig: {
            temperature:     0,
            // Vision now also produces the observation block — bumped from 2500
            // to 4096 to absorb the extra ~700 output tokens. Empirical headroom.
            maxOutputTokens: 4096,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${error}`);
      }

      const json = await response.json();
      const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      inputTokens  += json?.usageMetadata?.promptTokenCount     ?? 0;
      outputTokens += json?.usageMetadata?.candidatesTokenCount ?? 0;
      lastFinishReason  = json?.candidates?.[0]?.finishReason  ?? lastFinishReason;
      lastSafetyRatings = json?.candidates?.[0]?.safetyRatings ?? lastSafetyRatings;

      const cleaned = cleanJsonResponse(text);
      lastRawResponse = cleaned;

      if (!cleaned || !cleaned.includes('{')) {
        throw new Error(`Gemini vision returned no JSON. Response: ${cleaned.slice(0, 200)}`);
      }

      const parsed = JSON.parse(cleaned) as GeminiAnalysis;

      // Backward compat: derive legacy skin_concerns[] from the new detailed array.
      if (parsed.skin_concerns_detailed && parsed.skin_concerns_detailed.length > 0) {
        parsed.skin_concerns = parsed.skin_concerns_detailed.map(o => o.concern);

        for (const c of parsed.skin_concerns_detailed) {
          if (!c.display_label || !c.display_label.trim()) {
            c.display_label = c.concern
              .split('_')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
          }
        }
      }

      // Sanitize observation if present — same defense-in-depth as the old
      // skin recs path.
      if (parsed.observation) sanitizeObservation(parsed.observation);

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
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[gemini vision] attempt ${attempt} failed: ${msg} (finish_reason: ${lastFinishReason ?? 'unknown'})`);

      // Decide whether retry could plausibly help. If not, fall through to
      // exhausted-failure path immediately.
      if (attempt === 1) {
        if (!shouldRetry(err, lastFinishReason)) {
          console.warn(`[gemini vision] failure is deterministic — not retrying`);
          break;
        }
        didRetry = true;
        continue;
      }
      // Attempt 2 failed — fall through.
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[gemini vision EXHAUSTED]`, JSON.stringify({
    attempts:             didRetry ? 2 : 1,
    last_error:           msg,
    last_finish_reason:   lastFinishReason ?? 'unknown',
    last_safety_ratings:  lastSafetyRatings ?? null,
    last_response_length: lastRawResponse.length,
    last_response_tail:   lastRawResponse.slice(-500),
    scan_id:              scanId ?? null,
  }, null, 2));

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
  throw lastError instanceof Error ? lastError : new Error(msg);
}

// Strip face-shape leakage from the observation. The prompt forbids it but
// the model still occasionally smuggles it in.
function sanitizeObservation(obs: ObservationOutput): void {
  const FACE_SHAPE_CHIP = /\b(oval|round|square|heart|oblong|diamond|triangle)\s+face\b/i;

  if (Array.isArray(obs.trait_chips)) {
    obs.trait_chips = obs.trait_chips.filter(chip => !FACE_SHAPE_CHIP.test(chip));
  }
  if (Array.isArray(obs.insights)) {
    for (const insight of obs.insights as ScanInsight[]) {
      if (insight.body && faceShapeProse().test(insight.body)) {
        insight.body = stripFaceShapeSentences(insight.body);
      }
    }
  }
  if (obs.dek && faceShapeProse().test(obs.dek)) {
    obs.dek = stripFaceShapeSentences(obs.dek);
  }
}
