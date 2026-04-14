// Scan service — orchestrates the full scan flow end to end.
// Steps: compress → analyse with Gemini → get advice from Claude
//        → save to database → delete image → return finished scan.

/*
Run in Supabase SQL editor:

alter table users
  add column if not exists routine_level text default 'simple',
  add column if not exists preferred_brands jsonb default '[]'::jsonb;
*/

/*
Run in Supabase SQL editor:

create table if not exists product_events (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references auth.users(id),
  scan_id      uuid references scans(id),
  product_id   text not null,
  product_name text,
  brand        text,
  category     text,
  event_type   text, -- 'clicked_buy'
  created_at   timestamptz default now()
);

enable row level security on product_events;

create policy "Users can insert their own product events"
  on product_events for insert
  with check (auth.uid() = user_id);
*/

import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { analyseWithGemini } from '../lib/gemini';
import { getAdviceFromClaude } from '../lib/claude';
import { getTierLabel } from '../constants/tiers';
import type { Scan } from '../types';

const RECOMMENDATIONS_KEY = (scanId: string) => `@lume/recommendations_${scanId}`;
const LATEST_SCAN_KEY = '@lume/latest_scan';

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
  // Step 2 — fetch user context + previous scan before calling Gemini
  const { data: userProfile } = await supabase
    .from('users')
    .select('city, gender, budget')
    .eq('id', userId)
    .single();

  const city   = userProfile?.city   ?? null;
  const budget = (userProfile as { budget?: string } | null)?.budget ?? 'affordable';
  // Gender may have been passed in, but prefer the Supabase value if available
  const resolvedGender = (userProfile?.gender as string | null) ?? gender;

  const { data: previousScans } = await supabase
    .from('scans')
    .select('score_overall, tier_label, skin_concerns, score_skin, score_hair, score_beard, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(2);

  // If only one row exists this is the first scan — no previous context
  const previousScan = previousScans && previousScans.length > 1 ? previousScans[1] : null;
  const previousScanSummary = previousScan
    ? `Previous scan on ${new Date(previousScan.created_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: ` +
      `overall score ${previousScan.score_overall as number}, ` +
      `tier ${previousScan.tier_label as string}, ` +
      `skin score ${previousScan.score_skin ?? 'n/a'}, ` +
      `hair score ${previousScan.score_hair ?? 'n/a'}` +
      ((previousScan.skin_concerns as string[] | null)?.length
        ? `, concerns: ${(previousScan.skin_concerns as string[]).slice(0, 3).join(', ')}`
        : '')
    : null;

  // Step 3 was previously step 2 — send to Gemini for face analysis
  onProgress('Analysing your face…');
  console.log('[scanService] Calling analyseWithGemini, gender:', resolvedGender);
  const analysis = await analyseWithGemini(base64, city, resolvedGender, budget, previousScanSummary);
  console.log('[scanService] Gemini analysis:', JSON.stringify(analysis).slice(0, 500));

  // Send analysis to Claude Haiku for recommendations
  onProgress('Generating recommendations…');
  console.log('[scanService] Calling getAdviceFromClaude');
  const recommendations = await getAdviceFromClaude(resolvedGender, analysis);
  console.log('[scanService] Claude advice received');

  // Calculate scores
  onProgress('Calculating your score…');
  console.log('[scanService] Calculating score');
  const scoreOverall = calcOverallScore(
    resolvedGender,
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
  //
  // alter table users drop column if exists scan_bonus_unlocked;
  // alter table users drop column if exists scan_bonus_month;
  // alter table users add column if not exists scan_bonus_count int default 0;
  // alter table users add column if not exists scan_bonus_period text;
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

  // Update last_scan_at on the user's profile
  if (data) {
    await supabase
      .from('users')
      .update({ last_scan_at: new Date().toISOString() })
      .eq('id', userId);

    // Persist the full scan to AsyncStorage for offline access
    try {
      await AsyncStorage.setItem(RECOMMENDATIONS_KEY(data.id as string), JSON.stringify(data));
      await AsyncStorage.setItem(LATEST_SCAN_KEY, JSON.stringify(data));
    } catch {
      // Non-critical — offline caching failure should not surface to user
    }
  }

  return data as Scan;
  } catch (error: unknown) {
    console.error('[scanService] CRASH:', error instanceof Error ? error.stack : String(error));
    throw error;
  }
}

const BASE_SCANS = 3;
const MAX_BONUS  = 5;
const PERIOD_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days

// Return the user's scan quota info for the current rolling 30-day period.
export async function getMonthlyScansInfo(userId: string): Promise<{
  scansThisPeriod: number;
  baseAllowed:     number;
  bonusScans:      number;
  scansAllowed:    number;
  canScan:         boolean;
  canUnlockMore:   boolean;
  periodStart:     string | null;
  daysUntilReset:  number;
}> {
  const { data: userRow } = await supabase
    .from('users')
    .select('scan_bonus_count, scan_bonus_period')
    .eq('id', userId)
    .single();

  const now = new Date();
  let periodStart: string | null = userRow?.scan_bonus_period ?? null;
  let bonusScans  = userRow?.scan_bonus_count ?? 0;

  // If no period set or it has expired, open a fresh 30-day window.
  if (!periodStart || (now.getTime() - new Date(periodStart).getTime()) > PERIOD_MS) {
    periodStart = now.toISOString();
    bonusScans  = 0;
    await supabase
      .from('users')
      .update({ scan_bonus_count: 0, scan_bonus_period: periodStart })
      .eq('id', userId);
  }

  const { count } = await supabase
    .from('scans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', periodStart);

  const scansThisPeriod = count ?? 0;
  const scansAllowed    = BASE_SCANS + bonusScans;
  const canScan         = scansThisPeriod < scansAllowed;
  const canUnlockMore   = bonusScans < MAX_BONUS;

  const periodEnd     = new Date(new Date(periodStart).getTime() + PERIOD_MS);
  const daysUntilReset = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000));

  return { scansThisPeriod, baseAllowed: BASE_SCANS, bonusScans, scansAllowed, canScan, canUnlockMore, periodStart, daysUntilReset };
}

// Increment the user's bonus scan count for the given period.
export async function unlockBonusScan(
  userId:          string,
  periodStartDate: string,
): Promise<{ success: boolean; newBonusCount: number }> {
  const { data: userRow } = await supabase
    .from('users')
    .select('scan_bonus_count, scan_bonus_period')
    .eq('id', userId)
    .single();

  const currentBonus  = userRow?.scan_bonus_count ?? 0;
  const currentPeriod = userRow?.scan_bonus_period ?? null;

  if (currentBonus >= MAX_BONUS) return { success: false, newBonusCount: currentBonus };

  const now         = new Date();
  const periodMatch = currentPeriod === periodStartDate;
  const periodFresh = periodMatch && (now.getTime() - new Date(periodStartDate).getTime()) <= PERIOD_MS;
  const newBonus    = periodFresh ? currentBonus + 1 : 1;
  const newPeriod   = periodFresh ? currentPeriod : periodStartDate;

  const { error } = await supabase
    .from('users')
    .update({ scan_bonus_count: newBonus, scan_bonus_period: newPeriod })
    .eq('id', userId);

  if (error) return { success: false, newBonusCount: currentBonus };
  return { success: true, newBonusCount: newBonus };
}

// Load a previously cached scan from AsyncStorage by scan ID.
export async function getSavedRecommendations(scanId: string): Promise<Scan | null> {
  try {
    const raw = await AsyncStorage.getItem(RECOMMENDATIONS_KEY(scanId));
    return raw ? JSON.parse(raw) as Scan : null;
  } catch {
    return null;
  }
}

// Load the most recently cached scan from AsyncStorage.
export async function getLatestSavedScan(): Promise<Scan | null> {
  try {
    const raw = await AsyncStorage.getItem(LATEST_SCAN_KEY);
    return raw ? JSON.parse(raw) as Scan : null;
  } catch {
    return null;
  }
}

// Log a product buy-tap event to the product_events table.
// Non-critical — failures are swallowed so they never block the user.
export async function logProductEvent(params: {
  userId:      string;
  scanId:      string;
  productId:   string;
  productName: string;
  brand:       string;
  category:    string;
  eventType:   'clicked_buy';
}): Promise<void> {
  try {
    await supabase.from('product_events').insert({
      user_id:      params.userId,
      scan_id:      params.scanId,
      product_id:   params.productId,
      product_name: params.productName,
      brand:        params.brand,
      category:     params.category,
      event_type:   params.eventType,
    });
  } catch (e) {
    // Non-critical — never block the user for logging failure
    console.error('[scanService] logProductEvent error:', e);
  }
}
