// Gemini 2.5 Flash-Lite — vision analysis of the user's face photo.
// Returns structured JSON with face shape, skin type, scores, etc.

import type { Scan } from '../types';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY!;

const MODEL = 'gemini-2.5-flash-lite';
const ENDPOINT  = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// What we get back from Gemini (a subset of the Scan type).
export type GeminiAnalysis = Pick<
  Scan,
  | 'face_shape'
  | 'skin_type'
  | 'skin_concerns'
  | 'hair_texture'
  | 'hair_condition'
  | 'beard_density'
  | 'beard_condition'
  | 'brow_condition'
  | 'undereye'
  | 'score_hair'
  | 'score_skin'
  | 'score_beard'
  | 'score_makeup'
>;

function buildPrompt(
  gender:              string,
  city:                string | null,
  budget:              string,
  previousScanSummary: string | null,
): string {
  const userContext = [
    `Gender: ${gender}`,
    city
      ? `City: ${city} — factor in local climate, humidity, pollution and UV levels when making recommendations`
      : null,
    budget === 'affordable'
      ? 'Budget: Affordable — recommend products under ₹500'
      : 'Budget: Premium — recommend products ₹500 and above',
    previousScanSummary
      ? `Previous scan context: ${previousScanSummary} — reference this when relevant. Note improvements or regressions. If a concern has improved say so. If something is worse flag it.`
      : "Previous scan: This is the user's first scan — no previous context available.",
  ].filter(Boolean).join('\n');

  return `User context:
${userContext}

---

Analyse this face photo and return ONLY a valid JSON object with no markdown, no code fences, no explanation.
Gender context: ${gender}

Focus ONLY on grooming-related observations that can be improved with effort, products, or professional help.

When referencing fixed physical traits (face shape, jawline, natural features), note them ONLY as assets to work with — never as problems. For example: mention a strong jawline to suggest styles that complement it.

Only grooming habits (beard maintenance, skin care routine, hair condition, dark circles, oiliness) should be noted as areas for improvement.

NEVER say any natural feature is a problem or flaw.

Return exactly this structure:
{
  "face_shape": one of ["oval","round","square","heart","oblong","diamond"],
  "hair_texture": one of ["straight","wavy","curly","coily"],
  "hair_condition": one of ["healthy","dry","damaged","oily","thinning"],
  "skin_type": one of ["oily","dry","combination","normal","sensitive"],
  "skin_concerns": array of zero or more from ["acne","dryness","oiliness","dark_circles","uneven_texture","dehydration"],
  "beard_density": one of ["none","light","medium","heavy"] or null if gender is woman,
  "beard_condition": one of ["well_groomed","needs_shaping","patchy","untrimmed"] or null if gender is woman,
  "brow_condition": one of ["well_defined","sparse","ungroomed","over_plucked"] or null if gender is man,
  "undereye": one of ["dark_circles","puffiness","normal"] or null if gender is man,
  "score_hair": integer 0-100 based on hair grooming and condition only,
  "score_skin": integer 0-100 based on skin care routine evidence only,
  "score_beard": integer 0-100 based on beard grooming only or null if gender is woman,
  "score_makeup": integer 0-100 based on brow grooming and skin care only or null if gender is man
}

Scoring guidance: Score based on evidence of grooming effort and maintenance only.
A well-maintained beard scores high regardless of density.
Healthy conditioned hair scores high regardless of texture or colour.
Never penalise for fixed traits.
70-80 = good grooming effort. 85+ = exceptional maintenance. Below 60 = clear grooming concerns to address.`;
}

// Pass the base64-encoded image string (no data URI prefix) plus user context.
// Returns the parsed analysis object from Gemini.
export async function analyseWithGemini(
  base64Image:         string,
  city:                string | null,
  gender:              string,
  budget:              string,
  previousScanSummary: string | null,
): Promise<GeminiAnalysis> {
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
          { text: buildPrompt(gender, city, budget, previousScanSummary) },
        ],
      }],
      generationConfig: {
        temperature:     0,    // deterministic output — we want consistent JSON
        maxOutputTokens: 512,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${error}`);
  }

  const json = await response.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Strip any accidental markdown code fences before parsing
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  console.log('[gemini] Raw response text:', cleaned.slice(0, 500));

  try {
    console.log('[gemini] Attempting to parse response');
    const result = JSON.parse(cleaned) as GeminiAnalysis;
    console.log('[gemini] Parsed result:', JSON.stringify(result).slice(0, 300));
    return result;
  } catch (error: unknown) {
    console.error('[gemini] Parse CRASH:', error instanceof Error ? error.stack : String(error));
    throw new Error(`Gemini returned invalid JSON: ${cleaned}`);
  }
}
