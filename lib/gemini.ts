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
  | 'brow_shape'
  | 'undereye'
  | 'score_hair'
  | 'score_skin'
  | 'score_beard'
  | 'score_makeup'
>;

function buildPrompt(gender: string): string {
  return `Analyse this face photo and return ONLY a valid JSON object with no markdown, no code fences, no explanation.
Gender context: ${gender}

Return exactly this structure:
{
  "face_shape": one of ["oval","round","square","heart","oblong","diamond"],
  "skin_type": one of ["oily","dry","combination","normal","sensitive"],
  "skin_concerns": array of zero or more from ["acne","pigmentation","dryness","dark_circles","uneven_tone","oiliness"],
  "hair_texture": one of ["straight","wavy","curly","coily"],
  "hair_condition": one of ["healthy","dry","damaged","oily","thinning"],
  "beard_density": one of ["none","light","medium","heavy"] or null if gender is woman,
  "brow_shape": one of ["arch","straight","rounded","sparse"] or null if gender is man,
  "undereye": one of ["dark","puffy","hollow","normal"] or null if gender is man,
  "score_hair": integer 0-100 based on hair health and presentation,
  "score_skin": integer 0-100 based on skin clarity and condition,
  "score_beard": integer 0-100 based on beard grooming or null if gender is woman,
  "score_makeup": integer 0-100 based on brow shape and skin evenness or null if gender is man
}

Scoring guidance: Be consistent and conservative. A score of 70-80 represents someone who is well-groomed. Only give 85+ for exceptional grooming. Only give below 50 for clearly poor grooming. When in doubt, score in the 60-75 range.`;
}

// Pass the base64-encoded image string (no data URI prefix) and the user's gender.
// Returns the parsed analysis object from Gemini.
export async function analyseWithGemini(
  base64Image: string,
  gender: string,
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
          { text: buildPrompt(gender) },
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
