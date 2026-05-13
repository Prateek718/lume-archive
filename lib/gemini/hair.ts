// Hair recommendations call. Thin wrapper around the `gemini-hair-recs`
// edge function — prompt, retry, validation, and telemetry all live
// server-side. Hair is independent of scans; it regenerates when the
// hair_profile changes (scanId may be null).
//
// See docs/phase-xiii-architecture.md §1.5, §4.2.

import { supabase } from '../supabase';
import { isHairRecsEnabled } from '../appConfig';
import type { HairProfile, HairRecommendations, MatchedProduct } from '../../types';

export async function getHairRecommendationsFromGemini(
  profile:         HairProfile,
  faceShape:       string | null,
  gender:          string,
  city:            string | null,
  budget:          string,
  matchedProducts: MatchedProduct[],
  options?: { scanId?: string | null },
): Promise<HairRecommendations> {
  if (!(await isHairRecsEnabled())) {
    throw new Error('Hair recommendations are temporarily unavailable.');
  }

  const { data, error } = await supabase.functions.invoke('gemini-hair-recs', {
    body: {
      profile,
      faceShape,
      gender,
      city,
      budget,
      matchedProducts,
      scanId: options?.scanId ?? null,
    },
  });

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`gemini-hair-recs invoke failed: ${msg}`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('gemini-hair-recs returned empty body');
  }
  if ('error' in (data as Record<string, unknown>)) {
    throw new Error(String((data as { error: unknown }).error));
  }

  return data as HairRecommendations;
}
