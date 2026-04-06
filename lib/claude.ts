// Claude Haiku — grooming advice text generation.
// Takes the structured face analysis from Gemini and returns
// human-readable recommendations the user can say to their stylist.

import type { Recommendations } from '../types';
import type { GeminiAnalysis } from './gemini';

const API_KEY  = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY!;
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL    = 'claude-haiku-4-5-20251001';

function buildPrompt(gender: string, analysis: GeminiAnalysis): string {
  return `You are Lumé, an expert grooming advisor. Based on this face analysis, give personalised grooming recommendations. Be specific — give exact phrases the user can say to their stylist.
Gender: ${gender}
Face analysis: ${JSON.stringify(analysis)}

If gender is 'woman', ONLY suggest 3 styles from this list:
Bob cut, Lob haircut, Pixie cut, Bangs, Shag haircut, Wolf cut, Blunt cut, Curtain bangs, Butterfly haircut, Bixie cut, French bob, Balayage, Updo, Bun, Ponytail, Beach waves, Feathered hair, Wedge haircut, Layer haircut, Razor cut, Textured layers

If gender is 'man', ONLY suggest 3 styles from this list:
Undercut, Crew cut, Pompadour, Quiff, Caesar cut, Ivy League haircut, Side part, Comb over, Buzz cut, Man bun, Mohawk, Faux hawk, Taper fade, Afro, Dreadlocks, Cornrows, Curtain haircut, Edgar cut, Wolf cut, Shag haircut

The gender value is: ${gender}

Return ONLY style names from the correct gender list above.
Never mix men and women styles.
Never invent new style names not in the list.

Return ONLY a valid JSON object with no markdown, no code fences, no explanation, matching this exact structure:
{
  "hair": {
    "summary": "one sentence summary of hair recommendation",
    "advice": "specific advice phrased as exact words to say to stylist in quotes",
    "styles": ["Exact Style Name 1", "Exact Style Name 2", "Exact Style Name 3"]
  },
  "skin": {
    "summary": "one sentence summary",
    "advice": "specific skincare advice with product types, not brand names",
    "routine": ["morning step 1", "morning step 2", "evening step 1", "evening step 2"]
  },
  "beard": {"summary": "...", "advice": "..."} or null if gender is woman,
  "makeup": {"summary": "...", "advice": "..."} or null if gender is man
}`;
}

export async function getAdviceFromClaude(
  gender: string,
  analysis: GeminiAnalysis,
): Promise<Recommendations> {
  const response = await fetch(ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-api-key':       API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1024,
      messages: [{
        role:    'user',
        content: buildPrompt(gender, analysis),
      }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error ${response.status}: ${error}`);
  }

  const json  = await response.json();
  const text: string = json?.content?.[0]?.text ?? '';

  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return JSON.parse(cleaned) as Recommendations;
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned}`);
  }
}
