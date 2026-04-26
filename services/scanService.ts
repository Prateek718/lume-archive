// Scan service — orchestrates the full scan flow end to end.
// Steps: compress → analyse with Gemini vision → get recommendations from Gemini text
//        → save to database → delete image → return finished scan.

/*
Run in Supabase SQL editor:

alter table users
  add column if not exists routine_level text default 'simple',
  add column if not exists preferred_brands jsonb default '[]'::jsonb,
  add column if not exists hair_profile jsonb,
  add column if not exists hair_recommendations jsonb;
*/

/*
Run in Supabase SQL editor:

-- Routine compliance logs
create table if not exists routine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  scan_id uuid references scans(id) on delete set null,
  step_label text not null,
  step_product text,
  category text not null, -- 'skin_am' | 'skin_pm' | 'hair' | 'beard' | 'makeup'
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Product usage confirmations
create table if not exists product_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  scan_id uuid references scans(id) on delete set null,
  product_id text not null,
  product_name text not null,
  brand text not null,
  category text not null,
  using_it boolean,
  nudge_sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Scan deltas (computed on each rescan)
create table if not exists scan_deltas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  scan_id uuid references scans(id) on delete cascade,
  previous_scan_id uuid references scans(id) on delete set null,
  days_between int,
  score_delta int,
  concerns_improved text[],
  concerns_worsened text[],
  concerns_resolved text[],
  compliance_rate numeric,
  created_at timestamptz not null default now()
);

-- Add columns to scans table
alter table scans
  add column if not exists scan_hour int,
  add column if not exists season text,
  add column if not exists scan_type text;

-- Add columns to product_events
alter table product_events
  add column if not exists nudge_sent boolean default false,
  add column if not exists nudge_sent_at timestamptz;

-- RLS policies
alter table routine_logs enable row level security;
create policy "Users can manage own routine_logs"
  on routine_logs for all using (auth.uid() = user_id);

alter table product_usage enable row level security;
create policy "Users can manage own product_usage"
  on product_usage for all using (auth.uid() = user_id);

alter table scan_deltas enable row level security;
create policy "Users can read own scan_deltas"
  on scan_deltas for all using (auth.uid() = user_id);
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

/*
Run in Supabase SQL editor:

create table if not exists product_confirmations (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references users(id) on delete cascade,
  prev_scan_id uuid references scans(id) on delete set null,
  new_scan_id  uuid references scans(id) on delete set null,
  product_name text not null,
  brand        text not null,
  category     text not null,
  confirmed    boolean not null,
  created_at   timestamptz not null default now()
);

alter table product_confirmations enable row level security;
create policy "Users can manage own product_confirmations"
  on product_confirmations for all using (auth.uid() = user_id);

-- Add Fitzpatrick columns to scans
alter table scans
  add column if not exists fitzpatrick_scale int,
  add column if not exists skin_tone text,
  add column if not exists skin_undertone text
    check (skin_undertone in ('warm', 'cool', 'neutral'));

-- Add age_range to users
alter table users
  add column if not exists age_range text;
*/

import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { scheduleRescanNudge, cancelRescanNudge } from './notificationService';
import { scheduleRoutineForScan, supersedePreviousScanRows } from './habitService';
import { computeAndStoreScanDelta } from './deltaService';
import { checkMilestonesForScan } from '../lib/milestones';
import { analyseWithGemini } from '../lib/gemini';
import {
  getRecommendationsFromGemini,
  getHairRecommendationsFromGemini,
} from '../lib/gemini';
import type { GeminiAnalysis } from '../lib/gemini';
import type { RescanFeedback } from '../types';
import { getProductsForProfile, inferBudgetFromBrands } from '../constants/productConstants';
import type { Scan, PartialScan, HairProfile, HairRecommendations, MatchedProduct, PreferredBrands, UserTrait, UserTraits, BudgetTier, BeardGoal } from '../types';
import { isBaldProfile } from '../types';
import {
  resolveTraits,
  buildTraitsToSave,
  fetchUserTraits,
  saveUserTraits,
  markFaceShapeConfirmed,
} from '../lib/traits';
import { hasValidHairProfile } from '../lib/hair';

const RECOMMENDATIONS_KEY = (scanId: string) => `@lume/recommendations_${scanId}`;
const LATEST_SCAN_KEY    = '@lume/latest_scan';
const PRODUCT_MAP_KEY    = (scanId: string) => `@lume/product_map/${scanId}`;

// ── Season helper ─────────────────────────────────────────────────────────────
// Indian seasonal calendar — consistent across cities.
function getSeason(_date: Date, _city: string): string {
  const month = _date.getMonth() + 1; // 1-12
  if (month >= 3  && month <= 5)  return 'summer';
  if (month >= 6  && month <= 9)  return 'monsoon';
  if (month >= 10 && month <= 11) return 'post_monsoon';
  return 'winter';
}

// ── Log a routine step completion to Supabase ─────────────────────────────────
export async function logRoutineStep(params: {
  userId:      string;
  scanId:      string | null;
  stepLabel:   string;
  stepProduct?: string;
  category:    'skin_am' | 'skin_pm' | 'hair' | 'beard' | 'makeup';
}): Promise<void> {
  try {
    await supabase.from('routine_logs').insert({
      user_id:      params.userId,
      scan_id:      params.scanId,
      step_label:   params.stepLabel,
      step_product: params.stepProduct ?? null,
      category:     params.category,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[scanService] logRoutineStep failed:', err);
  }
}

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
// Women: average of skin + makeup
// Men / other: average of skin + beard
function calcOverallScore(
  gender:      string,
  scoreSkin:   number | null,
  scoreBeard:  number | null,
  scoreMakeup: number | null,
): number {
  const scores: number[] = [];
  if (scoreSkin != null) scores.push(scoreSkin);
  if (gender === 'woman') {
    if (scoreMakeup != null) scores.push(scoreMakeup);
  } else {
    if (scoreBeard != null) scores.push(scoreBeard);
  }
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// ── Category builders — shared by runScan and refreshRecommendations ─────────

export function buildSkinCategories(
  analysis: GeminiAnalysis,
): { category: string; attributes: string[]; categoryType: 'skin' }[] {
  return [
    { category: 'face_cleanser', categoryType: 'skin', attributes:
        analysis.skin_type === 'oily' || analysis.skin_concerns?.includes('acne')
          ? ['non_comedogenic']
          : analysis.skin_type === 'dry'
          ? ['moisturising']
          : [] },
    { category: 'moisturiser', categoryType: 'skin', attributes:
        analysis.skin_type === 'oily'
          ? ['lightweight', 'oil_free']
          : analysis.skin_type === 'dry'
          ? ['rich', 'hyaluronic_acid']
          : ['lightweight'] },
    { category: 'spf_sunscreen', categoryType: 'skin', attributes:
        analysis.skin_type === 'oily'
          ? ['oil_free', 'non_comedogenic']
          : [] },
    ...(analysis.skin_concerns?.includes('dark_spots')
      ? [{ category: 'serum_vitamin_c', attributes: ['vitamin_c', 'brightening'], categoryType: 'skin' as const }]
      : []),
    ...(analysis.skin_concerns?.includes('hyperpigmentation')
      ? [{ category: 'serum_vitamin_c', attributes: ['vitamin_c', 'brightening', 'niacinamide'], categoryType: 'skin' as const }]
      : []),
    ...(analysis.skin_concerns?.includes('oiliness') || analysis.skin_concerns?.includes('acne')
      ? [{ category: 'serum_niacinamide', attributes: ['niacinamide', 'non_comedogenic'], categoryType: 'skin' as const }]
      : []),
    ...(analysis.skin_concerns?.includes('dark_circles')
      ? [{ category: 'eye_cream', attributes: [], categoryType: 'skin' as const }]
      : []),
  ];
}

export function buildBeardCategories(
  gender: string,
): { category: string; attributes: string[]; categoryType: 'beard' }[] {
  return gender === 'man' ? [
    { category: 'beard_oil',  attributes: ['conditioning'], categoryType: 'beard' },
    { category: 'beard_wash', attributes: [],               categoryType: 'beard' },
    { category: 'beard_balm', attributes: [],               categoryType: 'beard' },
  ] : [];
}

export function buildMakeupCategories(
  gender:    string,
  analysis?: GeminiAnalysis,
): { category: string; attributes: string[]; categoryType: 'makeup' }[] {
  if (gender !== 'woman') return [];

  const undertone      = analysis?.skin_undertone ?? 'neutral';
  const fitzpatrick    = analysis?.fitzpatrick_scale ?? 4;
  const browCondition  = analysis?.brow_condition ?? 'well_defined';
  const undereye       = analysis?.undereye ?? 'normal';

  const categories: { category: string; attributes: string[]; categoryType: 'makeup' }[] = [];

  // Always include kajal
  categories.push({
    category:     'kajal_eyeliner',
    attributes:   ['long_wearing'],
    categoryType: 'makeup',
  });

  // Eyebrow pencil — only if brows need work
  if (
    browCondition === 'sparse' ||
    browCondition === 'ungroomed' ||
    browCondition === 'over_plucked'
  ) {
    categories.push({
      category:     'eyebrow_pencil',
      attributes:   ['buildable_coverage'],
      categoryType: 'makeup',
    });
  }

  // Foundation — matched by Fitzpatrick scale
  const foundationCategory =
    fitzpatrick <= 2 ? 'foundation_fair'   :
    fitzpatrick === 3 ? 'foundation_medium' :
    fitzpatrick <= 5 ? 'foundation_medium'  :
    'foundation_deep';

  const foundationAttrs =
    undertone === 'warm' ? ['warm_undertone', 'buildable_coverage'] :
    undertone === 'cool' ? ['cool_undertone', 'buildable_coverage'] :
    ['buildable_coverage'];

  categories.push({
    category:     foundationCategory,
    attributes:   foundationAttrs,
    categoryType: 'makeup',
  });

  // Lipstick — undertone matched
  const lipstickCategory = undertone === 'cool' ? 'lipstick_berry' : 'lipstick_nude';

  const lipstickAttrs =
    undertone === 'warm' ? ['warm_undertone'] :
    undertone === 'cool' ? ['cool_undertone'] :
    [];

  categories.push({
    category:     lipstickCategory,
    attributes:   lipstickAttrs,
    categoryType: 'makeup',
  });

  // Concealer — only if dark circles detected
  if (undereye === 'dark_circles') {
    categories.push({
      category:     'concealer',
      attributes:   ['full_coverage', 'long_wearing'],
      categoryType: 'makeup',
    });
  }

  return categories;
}

// Shape of phase 1's output — phase 2 and finalize both consume this.
// scanId is the row id pre-inserted in phase 1 so that Gemini usage logging
// can attribute vision + recs calls to a single scan.
export interface Phase1Result {
  scanId:          string;
  partialScan:     PartialScan;
  existingTraits:  UserTraits | undefined;
  analysis:        GeminiAnalysis;
  userProfile: {
    city:            string | null;
    preferredBrands: PreferredBrands;
    budget:          string;
    ageRange:        string | null;
    careCategories:  string[];
  };
  previousContext: string;
  scanType:        'first' | 'rescan';
  scanNumber:      number;   // 1 for first scan, 2 for second rescan, etc.
  compressedUri:   string;
}

// ── Phase 1 — vision analysis only (~18s) ─────────────────────────────────────
// Compresses image, inserts a scan row early so the id can be attached to
// Gemini usage logs, calls Gemini vision, resolves traits against the user's
// locked history, and returns a PartialScan ready for ObservationScreen.
// If any traits need user input, _pendingTraitDecisions is attached to the
// PartialScan and Phase 2 should be deferred.
export async function runScanPhase1(
  photoUri:    string,
  gender:      string,
  userId:      string,
  onProgress?: ProgressCallback,
): Promise<Phase1Result> {
  onProgress?.('Preparing image…');
  const base64 = await compressImage(photoUri);

  // Determine first-vs-rescan and create the scan row before any Gemini call.
  const { count: priorScanCount } = await supabase
    .from('scans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  const scanType: 'first' | 'rescan' =
    (priorScanCount && priorScanCount > 0) ? 'rescan' : 'first';
  const scanNumber = (priorScanCount ?? 0) + 1;

  const { data: scanRow, error: insertErr } = await supabase
    .from('scans')
    .insert({ user_id: userId, scan_type: scanType })
    .select('id')
    .single();
  if (insertErr || !scanRow) {
    console.error('[scanService] Failed to create scan row:', insertErr);
    throw new Error('Could not start scan');
  }
  const scanId = scanRow.id as string;
  console.log('[scanService] Phase 1 scanId:', scanId, 'scanType:', scanType);

  const { data: userProfile } = await supabase
    .from('users')
    .select('city, gender, preferred_brands_v2, age_range, care_categories')
    .eq('id', userId)
    .single();

  const city               = userProfile?.city ?? null;
  const preferredBrandsRaw = (userProfile as { preferred_brands_v2?: PreferredBrands } | null)
    ?.preferred_brands_v2 ?? { skin: [], hair: [], makeup: [] };
  const inferredBudget     = inferBudgetFromBrands(preferredBrandsRaw);
  const ageRange           = (userProfile as { age_range?: string } | null)?.age_range ?? null;
  const careCategories     = (userProfile as { care_categories?: string[] } | null)?.care_categories ?? ['skin'];
  // Gender may have been passed in, but prefer the Supabase value if available
  const resolvedGender     = (userProfile?.gender as string | null) ?? gender;

  const { data: previousScans } = await supabase
    .from('scans')
    .select('score_overall, skin_concerns, score_skin, score_beard, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(2);

  // If only one row exists this is the first scan — no previous context
  const previousScan = previousScans && previousScans.length > 1 ? previousScans[1] : null;
  const previousScanSummary = previousScan
    ? `Previous scan on ${new Date(previousScan.created_at as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: ` +
      `overall score ${previousScan.score_overall as number}, ` +
      `skin score ${previousScan.score_skin ?? 'n/a'}` +
      ((previousScan.skin_concerns as string[] | null)?.length
        ? `, concerns: ${(previousScan.skin_concerns as string[]).slice(0, 3).join(', ')}`
        : '')
    : null;

  onProgress?.('Analysing your face…');
  console.log('[scanService] Calling analyseWithGemini, gender:', resolvedGender);
  let analysis: GeminiAnalysis;
  try {
    analysis = await analyseWithGemini(
      base64,
      city,
      resolvedGender,
      careCategories,
      ageRange,
      previousScanSummary,
      scanId,
    );
  } catch (visionErr) {
    // Clean up the empty scan row so it doesn't pollute the count check
    // on the user's next scan attempt (and corrupt first-vs-rescan logic).
    await supabase.from('scans').delete().eq('id', scanId);
    throw visionErr;
  }
  console.log('[scanService] Gemini analysis:', JSON.stringify(analysis).slice(0, 500));

  // Build the PartialScan used by ObservationScreen and (eventually) phase 2.
  const partialScan: PartialScan = {
    id:                scanId,
    user_id:           userId,
    face_shape:        analysis.face_shape ?? null,
    skin_type:         analysis.skin_type ?? null,
    skin_concerns:     analysis.skin_concerns ?? null,
    beard_density:     analysis.beard_density ?? null,
    beard_condition:   analysis.beard_condition ?? null,
    brow_condition:    analysis.brow_condition ?? null,
    undereye:          analysis.undereye ?? null,
    fitzpatrick_scale: analysis.fitzpatrick_scale ?? null,
    skin_tone:         analysis.skin_tone ?? null,
    skin_undertone:    analysis.skin_undertone ?? null,
    score_skin:        analysis.score_skin ?? null,
    score_beard:       analysis.score_beard ?? null,
    score_makeup:      analysis.score_makeup ?? null,
    score_overall:     null,
    recommendations:   null,
    created_at:        new Date().toISOString(),
    confidence:        analysis.confidence,
    alternatives:      analysis.alternatives,
  };

  // Resolve traits against any previously locked values.
  const existingTraits = await fetchUserTraits(userId);
  const { resolvedTraits, pendingConfirmations, pendingOverrides } =
    resolveTraits(partialScan, existingTraits);

  // Apply the resolved values back onto the scan — if a trait is already
  // locked we trust the locked value over the model's call.
  if (resolvedTraits.face_shape)     partialScan.face_shape     = resolvedTraits.face_shape;
  if (resolvedTraits.skin_undertone) partialScan.skin_undertone = resolvedTraits.skin_undertone;

  if (pendingConfirmations.length > 0 || pendingOverrides.length > 0) {
    // Defer trait locking and phase 2 until the user resolves the decisions.
    partialScan._pendingTraitDecisions = {
      confirmations: pendingConfirmations,
      overrides:     pendingOverrides,
    };
  } else {
    // No user input needed — auto-lock first-scan high-confidence traits.
    const traitsToSave = buildTraitsToSave(partialScan, {}, existingTraits);
    if (JSON.stringify(traitsToSave) !== JSON.stringify(existingTraits ?? {})) {
      await saveUserTraits(userId, traitsToSave);
    }
  }

  return {
    scanId,
    partialScan,
    existingTraits,
    analysis,
    userProfile: {
      city,
      preferredBrands: preferredBrandsRaw,
      budget:          inferredBudget,
      ageRange,
      careCategories,
    },
    previousContext: previousScanSummary ?? '',
    scanType,
    scanNumber,
    compressedUri:   base64,
  };
}

// ── Phase 2 — recommendations + save (~32s) ───────────────────────────────────
// Updates the scan row created in phase 1 with analysis + recommendations.
// Reads users.beard_goal once at the start (no polling — the scan flow
// captures the goal before kicking off phase 2).
export async function runScanPhase2(
  scanId:          string,
  analysis:        GeminiAnalysis,
  userProfile:     {
    city:            string | null;
    preferredBrands: PreferredBrands;
    budget:          string;
    ageRange:        string | null;
    careCategories:  string[];
  },
  scanType:        'first' | 'rescan',
  gender:          string,
  userId:          string,
  scanNumber:      number,
  onProgress?:     ProgressCallback,
  partialScan?:    PartialScan,
  getUserFeedback?: () => RescanFeedback | undefined,
): Promise<Scan> {
  // Guard: recommendations must be based on confirmed traits. If the caller
  // hands us a scan that still has pending decisions, that's a wiring bug —
  // the UI should have routed through confirm-traits first.
  if (partialScan?._pendingTraitDecisions) {
    const { confirmations, overrides } = partialScan._pendingTraitDecisions;
    if (confirmations.length > 0 || overrides.length > 0) {
      throw new Error(
        '[scanService] runScanPhase2 called with unresolved trait decisions. ' +
        'Call finalizeTraitsAndRunPhase2 after user confirmation instead.',
      );
    }
  }

  const productGender: 'all' | 'men' | 'women' =
    gender === 'woman' ? 'women' :
    gender === 'man'   ? 'men'   : 'all';

  // Read beard_goal + hair_profile once — no polling.
  const { data: userRowForPhase2 } = await supabase
    .from('users')
    .select('beard_goal, hair_profile')
    .eq('id', userId)
    .single();
  const beardGoal: BeardGoal | null =
    (userRowForPhase2 as { beard_goal?: BeardGoal | null } | null)?.beard_goal ?? null;
  const hairProfile: HairProfile | null =
    (userRowForPhase2 as { hair_profile?: HairProfile | null } | null)?.hair_profile ?? null;

  const skinCategories   = buildSkinCategories(analysis);
  const beardCategories  = buildBeardCategories(gender);
  const makeupCategories = buildMakeupCategories(gender, analysis);

  const productMap = getProductsForProfile({
    categories:      [...skinCategories, ...beardCategories, ...makeupCategories],
    preferredBrands: userProfile.preferredBrands,
    gender:          productGender,
    budget:          userProfile.budget as BudgetTier,
    skinType:        analysis.skin_type ?? undefined,
    concerns:        analysis.skin_concerns ?? undefined,
    city:            userProfile.city ?? undefined,
    beardGoal:       beardGoal ?? undefined,
  });
  const matchedProducts: MatchedProduct[] = Object.values(productMap).map(arr => arr[0]);

  // Hair recs — only when the user already has a hair profile saved.
  // For new users (Phase 3A first scan) hair_profile is null/{} and this
  // branch is skipped. Phase 4 hair-setup will populate the profile and
  // generate hair recs separately.
  const hairRecsPromise: Promise<HairRecommendations | null> = hasValidHairProfile(hairProfile)
    ? (() => {
        const hairCategories = buildHairCategories(hairProfile!);
        const hairProductMap = getProductsForProfile({
          categories:      hairCategories,
          preferredBrands: userProfile.preferredBrands,
          gender:          productGender,
          budget:          userProfile.budget as BudgetTier,
          city:            userProfile.city ?? undefined,
        });
        const matchedHairProducts: MatchedProduct[] = Object.values(hairProductMap).map(arr => arr[0]);
        return getHairRecommendationsFromGemini(
          hairProfile!,
          analysis.face_shape ?? null,
          gender,
          userProfile.city ?? null,
          userProfile.budget,
          matchedHairProducts,
          { scanId },
        );
      })()
    : Promise.resolve(null);

  onProgress?.('Generating recommendations…');
  console.log('[scanService] Calling getRecommendationsFromGemini in parallel with hair recs (hair:', hasValidHairProfile(hairProfile), ')');
  const [recommendations, hairRecs] = await Promise.all([
    getRecommendationsFromGemini(
      gender,
      analysis,
      matchedProducts,
      userProfile.careCategories,
      userProfile.ageRange,
      beardGoal,
      scanNumber,
      { scanId },
    ),
    hairRecsPromise,
  ]);
  console.log('[scanService] Gemini recommendations received');

  onProgress?.('Calculating your score…');
  const scoreOverall = calcOverallScore(
    gender,
    analysis.score_skin,
    analysis.score_beard,
    analysis.score_makeup,
  );
  console.log('[scanService] Score:', scoreOverall);

  onProgress?.('Saving your results…');
  const now      = new Date();
  const scanHour = now.getHours();
  const season   = getSeason(now, userProfile.city ?? '');

  const scanUpdate = {
    image_url:               null,
    face_shape:              analysis.face_shape,
    skin_type:               analysis.skin_type,
    skin_concerns:           analysis.skin_concerns,
    skin_concerns_detailed:  analysis.skin_concerns_detailed ?? [],
    beard_density:           analysis.beard_density,
    beard_condition:         analysis.beard_condition,
    brow_condition:          analysis.brow_condition,
    undereye:                analysis.undereye,
    score_skin:              analysis.score_skin,
    score_beard:             analysis.score_beard,
    score_makeup:            analysis.score_makeup,
    score_overall:           scoreOverall,
    fitzpatrick_scale:       analysis.fitzpatrick_scale ?? null,
    skin_tone:               analysis.skin_tone ?? null,
    skin_undertone:          analysis.skin_undertone ?? null,
    recommendations:         recommendations ?? null,
    scan_hour:               scanHour,
    season,
    scan_type:               scanType,
  };

  const { data, error } = await supabase
    .from('scans')
    .update(scanUpdate)
    .eq('id', scanId)
    .select()
    .single();

  if (error || !data) {
    console.error('[scanService] Supabase update error:', error?.message);
    console.error('[scanService] Supabase error details:', JSON.stringify(error));
    throw new Error(`Failed to save scan: ${error?.message ?? 'unknown'}`);
  }
  console.log('[scanService] Saved successfully');

  if (hairRecs) {
    await supabase
      .from('users')
      .update({ hair_recommendations: hairRecs })
      .eq('id', userId);
  }

  if (data) {
    await supabase
      .from('users')
      .update({ last_scan_at: new Date().toISOString() })
      .eq('id', userId);

    try {
      await AsyncStorage.setItem(RECOMMENDATIONS_KEY(data.id as string), JSON.stringify(data));
      await AsyncStorage.setItem(LATEST_SCAN_KEY, JSON.stringify(data));
    } catch {
      // Non-critical — offline caching failure should not surface to user
    }

    try {
      await AsyncStorage.setItem(
        PRODUCT_MAP_KEY(data.id as string),
        JSON.stringify(productMap),
      );
    } catch {
      // Non-critical
    }

    await computeAndStoreScanDelta({
      userId,
      newScanId:    data.id as string,
      userFeedback: getUserFeedback?.(),
    });

    try {
      await cancelRescanNudge();
      await scheduleRescanNudge(new Date());
    } catch { }

    // Habit engine: supersede the prior scan's future rows, then schedule the
    // new scan. Failure here must not break the scan flow.
    try {
      console.log('[habit-schedule] starting for scan', data.id, 'user', userId);
      console.log('[habit-schedule] scan.recommendations present:', !!(data as Scan).recommendations);
      const { data: prevScanRows } = await supabase
        .from('scans')
        .select('id')
        .eq('user_id', userId)
        .neq('id', data.id as string)
        .order('created_at', { ascending: false })
        .limit(1);
      const prevScanId = prevScanRows?.[0]?.id as string | undefined;
      if (prevScanId) {
        await supersedePreviousScanRows(userId, prevScanId);
        console.log('[habit-schedule] superseded previous scan rows');
      }

      const { data: userRow } = await supabase
        .from('users')
        .select('hair_profile, hair_recommendations')
        .eq('id', userId)
        .single();

      await scheduleRoutineForScan({
        scanId:          data.id as string,
        userId,
        scan:            data as Scan,
        userHairProfile: (userRow?.hair_profile as HairProfile | null) ?? null,
        userHairRoutine: (userRow?.hair_recommendations as HairRecommendations | null)?.routine ?? null,
      });
      console.log('[habit-schedule] scheduled routine for scan');
    } catch (err) {
      console.error('[habit-schedule] FAILED', err);
    }

    void checkMilestonesForScan(userId, data.id as string);
  }

  return data as Scan;
}

// Run the full scan — calls phase 1 then phase 2 in sequence.
// Kept for backwards compatibility with any existing callers. This path
// assumes no trait confirmation is needed; if pending decisions exist,
// phase 2 throws and the caller should route through confirm-traits instead.
export async function runScan(
  photoUri:    string,
  gender:      string,
  userId:      string,
  onProgress?: ProgressCallback,
): Promise<Scan> {
  try {
    const phase1Result = await runScanPhase1(photoUri, gender, userId, onProgress);
    return runScanPhase2(
      phase1Result.scanId,
      phase1Result.analysis,
      phase1Result.userProfile,
      phase1Result.scanType,
      gender,
      userId,
      phase1Result.scanNumber,
      onProgress,
      phase1Result.partialScan,
    );
  } catch (error: unknown) {
    console.error('[scanService] CRASH:', error instanceof Error ? error.stack : String(error));
    throw error;
  }
}

// ── Finalize traits + run phase 2 ────────────────────────────────────────────
// Called by the confirm-traits screen after the user resolves all pending
// decisions. Persists the final trait values, clears the pending marker on
// the partialScan, applies confirmed values onto both the scan and the
// Gemini analysis (so recommendations reflect the user's pick), and then
// runs the existing phase 2 logic to generate recs and save the scan.
export async function finalizeTraitsAndRunPhase2(
  userId:        string,
  partialScan:   PartialScan,
  confirmations: Record<string, { value: string; source: UserTrait['source'] }>,
  phase1Context: {
    scanId:          string;
    analysis:        GeminiAnalysis;
    userProfile: {
      city:            string | null;
      preferredBrands: PreferredBrands;
      budget:          string;
      ageRange:        string | null;
      careCategories:  string[];
    };
    scanType:        'first' | 'rescan';
    scanNumber:      number;
    existingTraits:  UserTraits | undefined;
    gender:          string;
  },
  onProgress?:   ProgressCallback,
  getUserFeedback?: () => RescanFeedback | undefined,
): Promise<Scan> {
  const traitsToSave = buildTraitsToSave(
    partialScan,
    confirmations,
    phase1Context.existingTraits,
  );
  await saveUserTraits(userId, traitsToSave);

  // Apply confirmed values to the scan + analysis so recs reflect them.
  const applied: GeminiAnalysis = { ...phase1Context.analysis };
  if (confirmations.face_shape) {
    partialScan.face_shape        = confirmations.face_shape.value;
    applied.face_shape            = confirmations.face_shape.value as GeminiAnalysis['face_shape'];
    // Stamp users.face_shape_confirmed_at so future scans skip the face_shape
    // row in TraitConfirmScreen. Phase 7 profile-edit must call this too.
    await markFaceShapeConfirmed(userId);
  }
  if (confirmations.skin_undertone) {
    partialScan.skin_undertone    = confirmations.skin_undertone.value;
    applied.skin_undertone        = confirmations.skin_undertone.value as GeminiAnalysis['skin_undertone'];
  }

  delete partialScan._pendingTraitDecisions;

  return runScanPhase2(
    phase1Context.scanId,
    applied,
    phase1Context.userProfile,
    phase1Context.scanType,
    phase1Context.gender,
    userId,
    phase1Context.scanNumber,
    onProgress,
    partialScan,
    getUserFeedback,
  );
}

// Regenerate recommendations for the user's latest scan using updated preferences.
// No camera or vision call — reconstructs GeminiAnalysis from the stored scan fields.
export async function refreshRecommendations(
  userId:      string,
  onProgress?: (step: string) => void,
): Promise<string> {
  console.log('[refreshRecommendations] called with userId:', userId);
  try {
    console.log('[refreshRecommendations] step: loading profile');
    onProgress?.('Loading your profile…');

    const { data: userRow } = await supabase
      .from('users')
      .select('gender, city, preferred_brands_v2, hair_profile, age_range, beard_goal, care_categories')
      .eq('id', userId)
      .single();

    console.log('[refreshRecommendations] userRow:', JSON.stringify(userRow));

    const gender             = (userRow?.gender as string | null) ?? 'man';
    const preferredBrandsRaw = (userRow as { preferred_brands_v2?: PreferredBrands } | null)
      ?.preferred_brands_v2 ?? { skin: [], hair: [], makeup: [] };
    const inferredBudget     = inferBudgetFromBrands(preferredBrandsRaw);
    const ageRange           = (userRow as { age_range?: string } | null)?.age_range ?? null;
    const beardGoal          = (userRow as { beard_goal?: BeardGoal | null } | null)?.beard_goal ?? null;
    const careCategories     = (userRow as { care_categories?: string[] } | null)?.care_categories ?? ['skin'];

    const { data: scans } = await supabase
      .from('scans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    console.log('[refreshRecommendations] scans found:', scans?.length ?? 0);
    if (!scans || scans.length === 0) throw new Error('No scan found to refresh');
    const latestScan = scans[0] as Scan;

    const analysis: GeminiAnalysis = {
      face_shape:        latestScan.face_shape,
      skin_type:         latestScan.skin_type,
      skin_concerns:     latestScan.skin_concerns,
      beard_density:     latestScan.beard_density,
      beard_condition:   latestScan.beard_condition,
      brow_condition:    latestScan.brow_condition,
      undereye:          latestScan.undereye,
      score_skin:        latestScan.score_skin,
      score_beard:       latestScan.score_beard,
      score_makeup:      latestScan.score_makeup,
      fitzpatrick_scale: latestScan.fitzpatrick_scale ?? null,
      skin_tone:         latestScan.skin_tone ?? null,
      skin_undertone:    latestScan.skin_undertone ?? null,
    };

    console.log('[refreshRecommendations] step: matching products');
    onProgress?.('Matching products…');
    const productGender: 'all' | 'men' | 'women' =
      gender === 'woman' ? 'women' : gender === 'man' ? 'men' : 'all';

    const productMap = getProductsForProfile({
      categories:      [
        ...buildSkinCategories(analysis),
        ...buildBeardCategories(gender),
        ...buildMakeupCategories(
          productGender === 'women' ? 'woman' : 'man',
          analysis,
        ),
      ],
      preferredBrands: preferredBrandsRaw,
      gender:          productGender,
      budget:          inferredBudget,
      skinType:        analysis.skin_type ?? undefined,
      concerns:        analysis.skin_concerns ?? undefined,
      city:            (userRow?.city as string | null) ?? undefined,
    });
    // Flatten to one product per category for Gemini description writing
    const matchedProducts: MatchedProduct[] = Object.values(productMap).map(arr => arr[0]);

    console.log('[refreshRecommendations] step: generating recs');
    onProgress?.('Generating recommendations…');
    // Ordinal position of the scan being refreshed = number of user's scans at
    // or before its created_at. (This is the latest scan, so it equals total.)
    const { count: totalScanCount } = await supabase
      .from('scans')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    const scanNumber = totalScanCount && totalScanCount > 0 ? totalScanCount : 1;

    const recommendations = await getRecommendationsFromGemini(
      gender,
      analysis,
      matchedProducts,
      careCategories,
      ageRange,
      beardGoal,
      scanNumber,
      { scanId: latestScan.id as string },
    );

    console.log('[refreshRecommendations] step: saving');
    onProgress?.('Saving…');
    await supabase
      .from('scans')
      .update({ recommendations })
      .eq('id', latestScan.id as string);

    const updatedScan = { ...latestScan, recommendations };
    try {
      await AsyncStorage.setItem(RECOMMENDATIONS_KEY(latestScan.id as string), JSON.stringify(updatedScan));
      await AsyncStorage.setItem(LATEST_SCAN_KEY, JSON.stringify(updatedScan));
    } catch {
      // Non-critical — offline cache failure should not surface to user
    }

    try {
      await AsyncStorage.setItem(
        PRODUCT_MAP_KEY(latestScan.id as string),
        JSON.stringify(productMap),
      );
    } catch {
      // Non-critical
    }

    const hairProfile = (userRow as {
      hair_profile?: HairProfile;
    } | null)?.hair_profile;

    const hairProfileSet = hasValidHairProfile(hairProfile);

    console.log('[refreshRecommendations] step: hair profile check', {
      hairProfileSet,
      isBald: hairProfileSet && isBaldProfile(hairProfile!),
    });

    return latestScan.id as string;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[refreshRecommendations] CRASH:', msg);
    throw error;
  }
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

// Load a previously stored productMap from AsyncStorage by scan ID.
export async function getProductMap(
  scanId: string,
): Promise<Record<string, MatchedProduct[]>> {
  try {
    const raw = await AsyncStorage.getItem(PRODUCT_MAP_KEY(scanId));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, MatchedProduct[]>;
  } catch {
    return {};
  }
}

// Build hair product categories from a hair profile.
// Exported so hair-detail.tsx can reuse it for the product picker.
export function buildHairCategories(
  profile: HairProfile,
): { category: string; attributes: string[]; categoryType: 'hair' }[] {
  return isBaldProfile(profile)
    ? [
        { category: 'shampoo', categoryType: 'hair', attributes: [
          profile.scalp_type === 'oily' ? 'sulphate_free' : 'gentle',
          ...(profile.scalp_concern === 'dry_flaky' ? ['anti_dandruff'] : []),
          ...(profile.scalp_concern === 'oily_shiny' ? ['deep_cleansing'] : []),
        ]},
        { category: 'scalp_serum', categoryType: 'hair', attributes: [
          profile.scalp_concern === 'dry_flaky' ? 'moisturising' : 'scalp_stimulating',
          ...(profile.scalp_concern === 'sensitive' ? ['soothing'] : []),
        ]},
        { category: 'sunscreen',   categoryType: 'hair', attributes: ['spf_50', 'lightweight'] },
        { category: 'moisturiser', categoryType: 'hair', attributes: [
          profile.scalp_type === 'oily' ? 'lightweight' : 'hydrating',
        ]},
      ]
    : [
        { category: 'shampoo', categoryType: 'hair', attributes: [
          profile.scalp_type === 'oily' || profile.primary_concern?.includes('dandruff')
            ? 'sulphate_free' : 'sulphate_present',
          ...(profile.primary_concern?.includes('dandruff') ? ['anti_dandruff'] : []),
          ...(profile.primary_concern?.includes('hairfall')  ? ['strengthening']  : []),
        ]},
        { category: 'conditioner', categoryType: 'hair', attributes: [
          profile.texture === 'curly' || profile.texture === 'coily'
            ? 'deep_conditioning' : 'moisturising',
          ...(profile.chemically_treated != null && profile.chemically_treated !== 'none' ? ['colour_safe'] : []),
        ]},
        { category: 'hair_oil', categoryType: 'hair', attributes: [
          profile.primary_concern?.includes('hairfall') ? 'scalp_stimulating' : 'moisturising',
        ]},
        ...(profile.primary_concern?.includes('damage') || (profile.chemically_treated != null && profile.chemically_treated !== 'none')
          ? [{ category: 'hair_mask', attributes: ['protein', 'deep_conditioning'], categoryType: 'hair' as const }]
          : []),
        ...(profile.primary_concern?.includes('frizz') || profile.texture === 'curly' || profile.texture === 'coily'
          ? [{ category: 'hair_serum', attributes: ['curl_defining'],  categoryType: 'hair' as const }]
          : [{ category: 'hair_serum', attributes: ['lightweight'],    categoryType: 'hair' as const }]),
        ...(profile.primary_concern?.includes('dandruff') || profile.primary_concern?.includes('hairfall')
          ? [{ category: 'scalp_serum', attributes: ['scalp_stimulating'], categoryType: 'hair' as const }]
          : []),
        ...(profile.texture === 'curly' || profile.texture === 'coily'
          ? [{ category: 'leave_in_conditioner', attributes: ['curl_defining', 'moisturising'], categoryType: 'hair' as const }]
          : []),
      ];
}

// Generate hair recommendations from the user's hair profile and save both to users table.
// faceShape is optional — pass it when available from the user's latest scan.
export async function generateAndSaveHairProfile(
  userId:    string,
  profile:   HairProfile,
  faceShape: string | null = null,
  gender?:   string,
): Promise<HairRecommendations> {
  const { data: userRow } = await supabase
    .from('users')
    .select('gender, city, preferred_brands_v2')
    .eq('id', userId)
    .single();

  const resolvedGender      = gender ?? (userRow?.gender as string | null) ?? 'man';
  const city                = (userRow?.city as string | null) ?? null;
  const preferredBrandsRaw  = (userRow as { preferred_brands_v2?: PreferredBrands } | null)
    ?.preferred_brands_v2 ?? { skin: [], hair: [], makeup: [] };
  const inferredBudget      = inferBudgetFromBrands(preferredBrandsRaw);

  const hairGender: 'all' | 'men' | 'women' =
    resolvedGender === 'woman' ? 'women' : resolvedGender === 'man' ? 'men' : 'all';

  const hairCategories = buildHairCategories(profile);

  const hairProductMap = getProductsForProfile({
    categories:      hairCategories,
    preferredBrands: preferredBrandsRaw,
    gender:          hairGender,
    budget:          inferredBudget,
    city:            city ?? undefined,
  });
  // Flatten to one product per category for Gemini description writing
  const matchedHairProducts: MatchedProduct[] = Object.values(hairProductMap).map(arr => arr[0]);

  const hairRecs = await getHairRecommendationsFromGemini(
    profile, faceShape, resolvedGender, city, inferredBudget, matchedHairProducts,
    { scanId: null },   // hair profile setup is not tied to a scan
  );

  await supabase.from('users').update({
    hair_profile:         profile,
    hair_recommendations: hairRecs,
  }).eq('id', userId);

  return hairRecs;
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

    await supabase.from('product_usage').insert({
      user_id:      params.userId,
      scan_id:      params.scanId,
      product_id:   params.productId,
      product_name: params.productName,
      brand:        params.brand,
      category:     params.category,
      using_it:     null,
    });
  } catch (e) {
    // Non-critical — never block the user for logging failure
    console.error('[scanService] logProductEvent error:', e);
  }
}
