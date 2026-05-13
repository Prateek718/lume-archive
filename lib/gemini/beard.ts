// Beard recommendations call. Thin wrapper around the `gemini-beard-recs`
// edge function — prompt, retry, face-shape-leak sanitizer, and telemetry
// all live server-side.
//
// See docs/phase-xiii-architecture.md §1.3, §3 item 6, §4.2.

import { supabase } from '../supabase';
import { isBeardRecsEnabled } from '../appConfig';
import type { BeardGoal, BeardRecommendation } from '../../types';
import type { GeminiAnalysis } from './vision';

export async function getBeardRecommendations(
  analysis:  GeminiAnalysis,
  beardGoal: BeardGoal | null,
  options?: { scanId?: string | null },
): Promise<BeardRecommendation> {
  if (!(await isBeardRecsEnabled())) {
    throw new Error('Beard recommendations are temporarily unavailable.');
  }

  const { data, error } = await supabase.functions.invoke('gemini-beard-recs', {
    body: {
      analysis,
      beardGoal,
      scanId: options?.scanId ?? null,
    },
  });

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`gemini-beard-recs invoke failed: ${msg}`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('gemini-beard-recs returned empty body');
  }
  if ('error' in (data as Record<string, unknown>)) {
    throw new Error(String((data as { error: unknown }).error));
  }

  return data as BeardRecommendation;
}
