// Makeup recommendations storage layer.
// Makeup recs live at the user level (not per-scan) and only regenerate when
// the detected undertone, depth_tier, or fitzpatrick_scale shifts. Most
// rescans reuse the stored recs — keeps Gemini output small and avoids
// JSON-truncation risk from the expanded swatch schema.

import { supabase } from './supabase';
import type { MakeupRecommendation } from '../types';

interface MakeupMeta {
  generated_for_undertone: string;
  generated_for_depth_tier: string;
  generated_for_fitzpatrick: number;
  generated_at: string;
}

export async function getStoredMakeupRecs(userId: string): Promise<{
  recs: MakeupRecommendation | null;
  meta: MakeupMeta | null;
}> {
  const { data, error } = await supabase
    .from('users')
    .select('makeup_recommendations, makeup_recommendations_meta')
    .eq('id', userId)
    .single();
  if (error || !data) return { recs: null, meta: null };
  return {
    recs: data.makeup_recommendations as MakeupRecommendation | null,
    meta: data.makeup_recommendations_meta as MakeupMeta | null,
  };
}

export async function saveMakeupRecs(
  userId: string,
  recs: MakeupRecommendation,
  undertone: string,
  depth_tier: string,
  fitzpatrick: number,
): Promise<void> {
  await supabase
    .from('users')
    .update({
      makeup_recommendations: recs,
      makeup_recommendations_meta: {
        generated_for_undertone: undertone,
        generated_for_depth_tier: depth_tier,
        generated_for_fitzpatrick: fitzpatrick,
        generated_at: new Date().toISOString(),
      },
    })
    .eq('id', userId);
}

export function shouldRegenerateMakeup(
  meta: MakeupMeta | null,
  detected: { undertone: string; depth_tier: string; fitzpatrick: number },
): boolean {
  if (!meta) return true;
  if (meta.generated_for_undertone !== detected.undertone) return true;
  if (meta.generated_for_depth_tier !== detected.depth_tier) return true;
  if (meta.generated_for_fitzpatrick !== detected.fitzpatrick) return true;
  return false;
}
