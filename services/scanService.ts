// Scan service — orchestrates the full scan flow end to end.
// Steps: compress → analyse with Gemini → get advice from Claude
//        → save to database → delete image → return finished scan.

import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { analyseWithGemini } from '../lib/gemini';
import { getAdviceFromClaude } from '../lib/claude';
import { getTierLabel } from '../constants/tiers';
import type { Scan } from '../types';

// Callback so the UI can show which step is running.
export type ProgressCallback = (step: string) => void;

// Compress the photo to 512×512 JPEG and return base64 string.
// Done on-device before anything is sent anywhere.
async function compressImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512, height: 512 } }],
    {
      compress: 0.85,
      format:   ImageManipulator.SaveFormat.JPEG,
      base64:   true,
    },
  );
  if (!result.base64) throw new Error('Image compression failed — no base64 output');
  return result.base64;
}

// Calculate the overall score from individual category scores.
// Women: average of hair + skin + makeup
// Men / other: average of hair + skin + beard
function calcOverallScore(
  gender: string,
  scoreHair:   number | null,
  scoreSkin:   number | null,
  scoreBeard:  number | null,
  scoreMakeup: number | null,
): number {
  const scores: number[] = [];
  if (scoreHair  != null) scores.push(scoreHair);
  if (scoreSkin  != null) scores.push(scoreSkin);
  if (gender === 'woman') {
    if (scoreMakeup != null) scores.push(scoreMakeup);
  } else {
    if (scoreBeard != null) scores.push(scoreBeard);
  }
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// Run the full scan. Pass the raw photo URI from the camera,
// the user's gender, their user ID, and a progress callback for the UI.
export async function runScan(
  photoUri:  string,
  gender:    string,
  userId:    string,
  onProgress: ProgressCallback,
): Promise<Scan> {

  // Step 1 — compress image on device
  onProgress('Preparing image…');
  const base64 = await compressImage(photoUri);

  try {
  // Step 2 — send to Gemini for face analysis
  onProgress('Analysing your face…');
  console.log('[scanService] Calling analyseWithGemini, gender:', gender);
  const analysis = await analyseWithGemini(base64, gender);
  console.log('[scanService] Gemini analysis:', JSON.stringify(analysis).slice(0, 500));

  // Step 3 — send analysis to Claude Haiku for recommendations
  onProgress('Generating recommendations…');
  console.log('[scanService] Calling getAdviceFromClaude');
  const recommendations = await getAdviceFromClaude(gender, analysis);
  console.log('[scanService] Claude advice received');

  // Step 4 — calculate scores
  onProgress('Calculating your score…');
  console.log('[scanService] Calculating score');
  const scoreOverall = calcOverallScore(
    gender,
    analysis.score_hair,
    analysis.score_skin,
    analysis.score_beard,
    analysis.score_makeup,
  );
  const tierLabel = getTierLabel(scoreOverall);
  console.log('[scanService] Score:', scoreOverall);

  // Step 5 — save to Supabase
  // NOTE: Run this SQL in Supabase to add new columns:
  // alter table public.scans add column if not exists beard_condition text;
  // alter table public.scans add column if not exists brow_condition text;
  onProgress('Saving your results…');
  console.log('[scanService] Saving to Supabase, userId:', userId);
  const scanRow = {
    user_id:         userId,
    image_url:       null,
    face_shape:      analysis.face_shape,
    skin_type:       analysis.skin_type,
    skin_concerns:   analysis.skin_concerns,
    hair_texture:    analysis.hair_texture,
    hair_condition:  analysis.hair_condition,
    beard_density:   analysis.beard_density,
    beard_condition: analysis.beard_condition,
    brow_condition:  analysis.brow_condition,
    undereye:        analysis.undereye,
    score_hair:      analysis.score_hair,
    score_skin:      analysis.score_skin,
    score_beard:     analysis.score_beard,
    score_makeup:    analysis.score_makeup,
    score_overall:   scoreOverall,
    tier_label:      tierLabel,
    recommendations: recommendations ?? null,
  };

  if (!userId || userId === 'guest') {
    console.log('[scanService] Guest user — skipping Supabase save');
    return {
      ...scanRow,
      id:         `guest_${Date.now()}`,
      created_at: new Date().toISOString(),
    } as Scan;
  }

  console.log('[scanService] scanRow keys:', Object.keys(scanRow));
  console.log('[scanService] scanRow sample:', JSON.stringify({
    user_id:       scanRow.user_id,
    face_shape:    scanRow.face_shape,
    score_overall: scanRow.score_overall,
    tier_label:    scanRow.tier_label,
  }));

  console.log('[scanService] recommendations type:', typeof recommendations);
  console.log('[scanService] recommendations sample:',
    JSON.stringify(recommendations)?.slice(0, 200));

  let data, error;
  try {
    const result = await supabase
      .from('scans')
      .insert(scanRow)
      .select()
      .single();
    data = result.data;
    error = result.error;
  } catch (insertException: unknown) {
    const msg = insertException instanceof Error ? insertException.message : String(insertException);
    console.error('[scanService] Insert exception:', msg);
    return {
      ...scanRow,
      id:         `local_${Date.now()}`,
      created_at: new Date().toISOString(),
    } as Scan;
  }

  if (error) {
    console.error('[scanService] Supabase insert error:', error.message);
    console.error('[scanService] Supabase error details:', JSON.stringify(error));
    // Instead of throwing, return a local result so user still sees recommendations
    return {
      ...scanRow,
      id:         `local_${Date.now()}`,
      created_at: new Date().toISOString(),
    } as Scan;
  }
  console.log('[scanService] Saved successfully');

  // Step 6 — update last_scan_at on the user's profile
  if (data) {
    await supabase
      .from('users')
      .update({ last_scan_at: new Date().toISOString() })
      .eq('id', userId);
  }

  return data as Scan;
  } catch (error: unknown) {
    console.error('[scanService] CRASH:', error instanceof Error ? error.stack : String(error));
    throw error;
  }
}
