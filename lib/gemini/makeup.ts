// Makeup recommendations call. Thin wrapper around the `gemini-makeup-recs`
// edge function — prompt, retry, palette validation/fallback, depth-tier
// override, and telemetry all live server-side.
//
// See docs/phase-xiii-architecture.md §1.4, §3 item 7, §4.2.

import { supabase } from '../supabase';
import { isMakeupRecsEnabled } from '../appConfig';
import type { MakeupRecommendation } from '../../types';
import type { GeminiAnalysis } from './vision';

export async function getMakeupRecommendations(
  analysis: GeminiAnalysis,
  options?: { scanId?: string | null },
): Promise<MakeupRecommendation> {
  if (!(await isMakeupRecsEnabled())) {
    throw new Error('Makeup recommendations are temporarily unavailable.');
  }

  const { data, error } = await supabase.functions.invoke('gemini-makeup-recs', {
    body: {
      analysis,
      scanId: options?.scanId ?? null,
    },
  });

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`gemini-makeup-recs invoke failed: ${msg}`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('gemini-makeup-recs returned empty body');
  }
  if ('error' in (data as Record<string, unknown>)) {
    throw new Error(String((data as { error: unknown }).error));
  }

  return data as MakeupRecommendation;
}
