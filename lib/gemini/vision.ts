// Vision pipeline (Gemini 2.5 Pro). Thin wrapper around the
// `gemini-vision` edge function — the Google API key, prompt, retry,
// telemetry, and observation sanitizer all live server-side now.
//
// See docs/phase-xiii-architecture.md §1.1, §4.1, §10.3.

import { supabase } from '../supabase';
import { isGeminiEnabled } from '../appConfig';
import type {
  Scan,
  SkinConcernObservation,
  ScanObservation,
} from '../../types';

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
  if (!(await isGeminiEnabled())) {
    throw new Error('Scan is temporarily unavailable. Please try again in a bit.');
  }

  if (!scanId) {
    // The server requires a real scan id (FK + cost-tracking + observability).
    // Callers in scanService.ts always have it by Phase 1.
    throw new Error('analyseWithGemini: scanId is required');
  }
  if (gender !== 'man' && gender !== 'woman') {
    throw new Error(`analyseWithGemini: unsupported gender "${gender}"`);
  }

  const { data, error } = await supabase.functions.invoke('gemini-vision', {
    body: {
      imageBase64:         base64Image,
      city,
      gender,
      careCategories,
      ageRange,
      previousScanSummary,
      scanId,
      scanNumber,
    },
  });

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`gemini-vision invoke failed: ${msg}`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('gemini-vision returned empty body');
  }
  if ('error' in (data as Record<string, unknown>)) {
    throw new Error(String((data as { error: unknown }).error));
  }

  return data as GeminiAnalysis;
}
