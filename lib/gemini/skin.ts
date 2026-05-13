// Skin recommendations call. Thin wrapper around the `gemini-skin-recs`
// edge function — prompt, retry, concern normalization, and
// routine_note fallback derivation all live server-side.
//
// See docs/phase-xiii-architecture.md §1.2, §3 item 5, §4.2.

import { supabase } from '../supabase';
import { isSkinRecsEnabled } from '../appConfig';
import type { MatchedProduct, SkinRecommendation } from '../../types';
import type { GeminiAnalysis } from './vision';

export async function getSkinRecommendations(
  analysis:        GeminiAnalysis,
  matchedProducts: MatchedProduct[],
  ageRange:        string | null,
  options?: { scanId?: string | null },
): Promise<SkinRecommendation> {
  if (!(await isSkinRecsEnabled())) {
    throw new Error('Skin recommendations are temporarily unavailable.');
  }

  const { data, error } = await supabase.functions.invoke('gemini-skin-recs', {
    body: {
      analysis,
      matchedProducts,
      ageRange,
      scanId: options?.scanId ?? null,
    },
  });

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`gemini-skin-recs invoke failed: ${msg}`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('gemini-skin-recs returned empty body');
  }
  if ('error' in (data as Record<string, unknown>)) {
    throw new Error(String((data as { error: unknown }).error));
  }

  return data as SkinRecommendation;
}
