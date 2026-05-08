// Scan service — orchestrates the full scan flow end to end.
// Steps: compress → analyse with Gemini vision → get recommendations from Gemini text
//        → save to database → delete image → return finished scan.

import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { scheduleRescanNudge, cancelRescanNudge } from './notificationService';
import { scheduleRoutineForScan, supersedePreviousScanRows } from './habitService';
import { computeAndStoreScanDelta } from './deltaService';
import { checkMilestonesForScan } from '../lib/milestones';
import {
  analyseWithGemini,
  fitzpatrickToDepthTier,
  getSkinRecommendations,
  getBeardRecommendations,
  getMakeupRecommendations,
  getHairRecommendationsFromGemini,
  getDeltaCommentary,
} from '../lib/gemini';
import type { GeminiAnalysis } from '../lib/gemini';
import { fetchScanDeltaByToScanId } from './deltaService';
import type { RescanFeedback } from '../types';
import {
  getProductsForProfile,
  inferBudgetFromBrands,
  getScoredProducts,
  deriveClimateFromCity,
} from '../constants/productConstants';
import type {
  Scan,
  PartialScan,
  HairProfile,
  HairRecommendations,
  MatchedProduct,
  PreferredBrands,
  ProductRecommendation,
  UserTrait,
  UserTraits,
  BudgetTier,
  BeardGoal,
  SkinRecommendation,
  BeardRecommendation,
  MakeupRecommendation,
  Recommendations,
  RoutineStep,
} from '../types';
import { isBaldProfile } from '../types';
import {
  resolveTraits,
  buildTraitsToSave,
  fetchUserTraits,
  saveUserTraits,
  markFaceShapeConfirmed,
} from '../lib/traits';
import { hasValidHairProfile } from '../lib/hair';
import { getStoredMakeupRecs, saveMakeupRecs, shouldRegenerateMakeup } from '../lib/makeupRecs';

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

/**
 * Derive the high-level category enum (skin_am | skin_pm | hair | beard | makeup)
 * from a RoutineDayStep's step_id. Returns null if the step_id doesn't match any
 * known pattern, in which case the caller should skip telemetry rather than
 * miscategorize.
 */
export function deriveStepCategory(stepId: string): 'skin_am' | 'skin_pm' | 'hair' | 'beard' | 'makeup' | null {
  if (stepId.endsWith('_am') && !stepId.startsWith('hair_') && !stepId.startsWith('beard_') && !stepId.startsWith('makeup_')) {
    return 'skin_am';
  }
  if (stepId.endsWith('_pm') && !stepId.startsWith('hair_') && !stepId.startsWith('beard_') && !stepId.startsWith('makeup_')) {
    return 'skin_pm';
  }
  if (stepId.startsWith('hair_'))   return 'hair';
  if (stepId.startsWith('beard_'))  return 'beard';
  if (stepId.startsWith('makeup_')) return 'makeup';
  return null;
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
    .select('score_overall, skin_concerns, score_skin, created_at')
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
      scanNumber,
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
    skin_undertone:    analysis.skin_undertone ?? null,
    score_skin:    analysis.score_skin ?? null,
    score_beard:   null,                                  // Phase 6.0: no longer scored
    score_makeup:  null,                                  // Phase 6.0: no longer scored
    score_overall: null,
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

// ── Section state types — exported for the useScan hook ─────────────────────
export type SectionKey   = 'skin' | 'beard' | 'makeup';
export type SectionState = 'loading' | 'ready' | 'failed' | 'not_applicable';

export interface SectionCallbacks {
  onSectionStart?:    (section: SectionKey) => void;
  onSectionComplete?: (section: SectionKey) => void;
  onSectionFailed?:   (section: SectionKey, error: Error) => void;
}

// Flatten a productMap (Record<canonical, MatchedProduct[]>) into the
// ProductRecommendation array stored under recommendations.products. The
// scoring engine has already ranked these, so the top entry per category
// becomes the prescribed product.
function buildProductRecommendations(
  productMap: Record<string, MatchedProduct[]>,
): ProductRecommendation[] {
  const out: ProductRecommendation[] = [];
  for (const [, products] of Object.entries(productMap)) {
    const top = products[0];
    if (!top) continue;
    out.push({
      category:    top.category,
      name:        top.name,
      brand:       top.brand,
      attributes:  top.attributes,
      reason:      top.why_this_one ?? top.why_good ?? '',
      // Score isn't exposed on the MatchedProduct type but the runtime object
      // carries it from the scoring engine. Default to 80 when missing.
      match_score:
        ((top as unknown as { score?: number }).score ?? 80) | 0,
    });
  }
  return out;
}

// Read-modify-write helper for the scan.recommendations JSONB column.
// Each per-section call merges its slice in without clobbering siblings.
// Race risk is bounded — only one orchestrator writes per scan, but the
// three section calls finish out of order, so each one needs the latest
// recommendations object before merging.
async function writeRecommendationSection(
  scanId:  string,
  section: 'skin' | 'beard' | 'makeup',
  payload: SkinRecommendation | BeardRecommendation | MakeupRecommendation,
): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from('scans')
    .select('recommendations')
    .eq('id', scanId)
    .single();
  if (readErr) {
    console.warn(`[scanService] writeRecommendationSection read failed for ${section}:`, readErr.message);
  }
  const existing = (row?.recommendations as Recommendations | null) ?? null;
  const next: Recommendations = {
    observation: existing?.observation as Recommendations['observation'],
    skin:        existing?.skin    ?? ({ advice: '', steps: [] } as SkinRecommendation),
    beard:       existing?.beard   ?? null,
    makeup:      existing?.makeup  ?? null,
    products:    existing?.products ?? [],
    [section]:   payload,
  } as Recommendations;

  const { error: writeErr } = await supabase
    .from('scans')
    .update({ recommendations: next })
    .eq('id', scanId);
  if (writeErr) {
    console.warn(`[scanService] writeRecommendationSection write failed for ${section}:`, writeErr.message);
  }
}

// Loads previous + current scan + just-computed delta row, calls Gemini for
// editorial commentary, and read-modify-writes recommendations.delta_commentary.
// Designed to run in parallel with the section promises — it only depends on
// the pre-write fields (skin_concerns_detailed, score_skin) that landed before
// sectionPromises started, plus the scan_deltas row that the sibling delta
// promise produces.
async function generateAndStoreDeltaCommentary(args: {
  scanId:     string;
  userId:     string;
  scanNumber: number;
}): Promise<void> {
  const { scanId, userId, scanNumber } = args;

  const { data: currentRow } = await supabase
    .from('scans')
    .select('*')
    .eq('id', scanId)
    .single();
  if (!currentRow) return;
  const currentScan = currentRow as Scan;

  const [{ data: prevRows }, deltaRow] = await Promise.all([
    supabase
      .from('scans')
      .select('*')
      .eq('user_id', userId)
      .lt('created_at', currentScan.created_at)
      .order('created_at', { ascending: false })
      .limit(1),
    fetchScanDeltaByToScanId(scanId),
  ]);
  const previousScan = prevRows?.[0] as Scan | undefined;
  if (!previousScan || !deltaRow) return;

  const commentary = await getDeltaCommentary(
    previousScan,
    currentScan,
    {
      days_between:        deltaRow.days_between,
      concerns_improved:   deltaRow.concerns_improved,
      concerns_new:        deltaRow.concerns_new,
      concerns_persistent: deltaRow.concerns_persistent,
    },
    scanNumber,
    { scanId },
  );

  const { data: latestRow } = await supabase
    .from('scans')
    .select('recommendations')
    .eq('id', scanId)
    .single();
  const existing = (latestRow?.recommendations as Recommendations | null) ?? null;
  const next: Recommendations = {
    observation: existing?.observation as Recommendations['observation'],
    skin:        existing?.skin    ?? ({ advice: '', steps: [] } as SkinRecommendation),
    beard:       existing?.beard   ?? null,
    makeup:      existing?.makeup  ?? null,
    products:    existing?.products ?? [],
    delta_commentary: commentary,
  };
  await supabase
    .from('scans')
    .update({ recommendations: next })
    .eq('id', scanId);
}

// ── Phase 2 — recommendations + save ──────────────────────────────────────
// Phase 6.2: split into per-section parallel calls (skin/beard/makeup).
// Each section writes itself into scan.recommendations as it completes via
// writeRecommendationSection so the UI can render whichever finished first.
// observation is already attached to the analysis (vision call) and gets
// written in the bulk pre-write below.
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
  callbacks?:      SectionCallbacks,
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

  // Read beard_goal + hair_profile + care_categories once — no polling.
  const { data: userRowForPhase2 } = await supabase
    .from('users')
    .select('beard_goal, hair_profile, hair_recommendations, care_categories')
    .eq('id', userId)
    .single();
  const beardGoal: BeardGoal | null =
    (userRowForPhase2 as { beard_goal?: BeardGoal | null } | null)?.beard_goal ?? null;
  const hairProfile: HairProfile | null =
    (userRowForPhase2 as { hair_profile?: HairProfile | null } | null)?.hair_profile ?? null;
  const existingHairRecs: HairRecommendations | null =
    (userRowForPhase2 as { hair_recommendations?: HairRecommendations | null } | null)?.hair_recommendations ?? null;
  const careCategories: string[] =
    (userRowForPhase2 as { care_categories?: string[] } | null)?.care_categories ?? userProfile.careCategories;

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

  // Hair recs regenerate ONLY when hair_profile changes (during the hair
  // setup flow's analyzing screen — see generateAndSaveHairProfile). Scans
  // must never trigger hair recs generation: density/scalp drift is captured
  // in the next hair-setup edit, not the rescan. Reuse whatever's stored.
  const missingHairRecs =
    careCategories.includes('hair') &&
    !existingHairRecs &&
    hasValidHairProfile(hairProfile);
  if (missingHairRecs) {
    // Safety net: hair-setup should have produced these. Log so we notice.
    console.warn('[scanService] hair_profile present but hair_recommendations missing — user should complete hair setup');
  }

  // Makeup recs live at the user level — only regenerate when undertone,
  // depth_tier, or fitzpatrick_scale shifts. Most rescans reuse the stored
  // recs, which keeps Gemini output small and skips the makeup call.
  let needsMakeup = false;
  if (careCategories.includes('makeup')) {
    const { meta } = await getStoredMakeupRecs(userId);
    needsMakeup = shouldRegenerateMakeup(meta, {
      undertone:   analysis.skin_undertone ?? 'neutral',
      depth_tier:  fitzpatrickToDepthTier(analysis.fitzpatrick_scale) ?? 'medium',
      fitzpatrick: analysis.fitzpatrick_scale ?? 4,
    });
  }

  // Beard applicability: beard in care_categories and a beard was detected.
  const beardApplicable =
    careCategories.includes('beard') &&
    !!analysis.beard_density &&
    analysis.beard_density !== 'none';

  // ── Pre-write: stamp the scan row with everything we know now ──────────
  // observation is already on `analysis`. Per-section recs land via
  // writeRecommendationSection as each call completes.
  const observation = analysis.observation;
  const productRecs = buildProductRecommendations(productMap);
  const initialRecommendations: Recommendations = {
    observation: observation as Recommendations['observation'],
    skin:        { advice: '', steps: [] },
    beard:       null,
    makeup:      null,
    products:    productRecs,
  };

  const scoreOverall = analysis.score_skin ?? 0;
  const now      = new Date();
  const scanHour = now.getHours();
  const season   = getSeason(now, userProfile.city ?? '');

  const preWrite = {
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
    score_beard:             null,
    score_makeup:            null,
    score_overall:           scoreOverall,
    fitzpatrick_scale:       analysis.fitzpatrick_scale ?? null,
    skin_undertone:          analysis.skin_undertone ?? null,
    recommendations:         initialRecommendations,
    scan_hour:               scanHour,
    season,
    scan_type:               scanType,
  };

  onProgress?.('Saving your results…');
  const { error: preWriteErr } = await supabase
    .from('scans')
    .update(preWrite)
    .eq('id', scanId);
  if (preWriteErr) {
    console.error('[scanService] pre-write failed:', preWriteErr.message);
    throw new Error(`Failed to save scan: ${preWriteErr.message}`);
  }

  // ── Parallel section calls ─────────────────────────────────────────────
  onProgress?.('Generating recommendations…');

  const sectionPromises: Array<Promise<void>> = [];

  // Skin — always runs.
  callbacks?.onSectionStart?.('skin');
  const skinAgeRange = userProfile.ageRange ?? null;
  const skinMatched: MatchedProduct[] = matchedProducts.filter(p =>
    p && p.category && [
      'face_cleanser','moisturizer','spf_sunscreen',
      'serum_niacinamide','serum_hyaluronic_acid','serum_vitamin_c',
      'serum_retinol','serum_salicylic_acid','serum_azelaic_acid',
      'serum_brightening','serum_soothing','toner','eye_cream',
      'face_mask','face_oil','face_gel',
    ].includes(p.category)
  );
  sectionPromises.push(
    getSkinRecommendations(analysis, skinMatched, skinAgeRange, { scanId })
      .then(async (skin) => {
        await writeRecommendationSection(scanId, 'skin', skin);
        callbacks?.onSectionComplete?.('skin');
      })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err));
        console.error('[scanService] skin section failed:', e.message);
        callbacks?.onSectionFailed?.('skin', e);
      }),
  );

  // Beard — only when applicable.
  if (beardApplicable) {
    callbacks?.onSectionStart?.('beard');
    sectionPromises.push(
      getBeardRecommendations(analysis, beardGoal, { scanId })
        .then(async (beard) => {
          await writeRecommendationSection(scanId, 'beard', beard);
          callbacks?.onSectionComplete?.('beard');
        })
        .catch((err: unknown) => {
          const e = err instanceof Error ? err : new Error(String(err));
          console.error('[scanService] beard section failed:', e.message);
          callbacks?.onSectionFailed?.('beard', e);
        }),
    );
  }

  // Makeup — only when applicable AND regen is required.
  if (needsMakeup) {
    callbacks?.onSectionStart?.('makeup');
    sectionPromises.push(
      getMakeupRecommendations(analysis, { scanId })
        .then(async (makeup) => {
          await writeRecommendationSection(scanId, 'makeup', makeup);
          if (makeup) {
            try {
              await saveMakeupRecs(
                userId,
                makeup,
                analysis.skin_undertone ?? 'neutral',
                fitzpatrickToDepthTier(analysis.fitzpatrick_scale) ?? 'medium',
                analysis.fitzpatrick_scale ?? 4,
              );
            } catch (saveErr) {
              console.warn('[scanService] saveMakeupRecs failed (non-fatal):',
                saveErr instanceof Error ? saveErr.message : String(saveErr));
            }
          }
          callbacks?.onSectionComplete?.('makeup');
        })
        .catch((err: unknown) => {
          const e = err instanceof Error ? err : new Error(String(err));
          console.error('[scanService] makeup section failed:', e.message);
          callbacks?.onSectionFailed?.('makeup', e);
        }),
    );
  }

  // Delta computation + commentary run in parallel with the section calls.
  // Both depend only on the pre-write fields (skin_concerns_detailed,
  // score_skin) — independent of the Phase 2 Gemini section outputs — so
  // gating them behind the section join would add 30-50s of avoidable lag.
  // Lands the scan_deltas row in ~2-3s instead of after sections settle.
  if (scanType === 'rescan') {
    const userFeedback = getUserFeedback?.();
    sectionPromises.push(
      (async () => {
        try {
          await computeAndStoreScanDelta({
            userId,
            newScanId: scanId,
            userFeedback,
          });
          await generateAndStoreDeltaCommentary({
            scanId,
            userId,
            scanNumber,
          });
        } catch (e) {
          console.error('[scanService] delta pipeline failed (non-fatal):', {
            scanId,
            message: e instanceof Error ? e.message : String(e),
            stack:   e instanceof Error ? e.stack : undefined,
          });
        }
      })(),
    );
  }

  await Promise.allSettled(sectionPromises);

  // Read back the now-merged scan row so downstream work sees the union of
  // sections that succeeded. Sections that failed remain null on the scan;
  // the UI exposes a per-section retry that calls regenerateXxxRecs.
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('id', scanId)
    .single();

  if (error || !data) {
    console.error('[scanService] post-section read failed:', error?.message);
    throw new Error(`Failed to load scan after section writes: ${error?.message ?? 'unknown'}`);
  }
  console.log('[scanService] Phase 2 sections settled');

  // Note: hair_recommendations is no longer written here. Scans reuse the
  // recs already stored on users (see hair-setup's analyzing screen for the
  // generation path) — writing them back would be a no-op.

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
  callbacks?:    SectionCallbacks,
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
    callbacks,
  );
}

// Reconstruct a GeminiAnalysis from a stored scan row. Used by refresh +
// per-section regenerate paths so they don't have to re-run the vision call.
// observation lives on the scan's recommendations JSONB (not on top-level
// columns) so we re-attach it here when present.
function analysisFromScan(scan: Scan): GeminiAnalysis {
  const recs = scan.recommendations as Recommendations | null;
  return {
    face_shape:             scan.face_shape,
    skin_type:              scan.skin_type,
    skin_concerns:          scan.skin_concerns,
    skin_concerns_detailed: scan.skin_concerns_detailed ?? [],
    beard_density:          scan.beard_density,
    beard_condition:        scan.beard_condition,
    brow_condition:         scan.brow_condition,
    undereye:               scan.undereye,
    score_skin:             scan.score_skin,
    fitzpatrick_scale:      scan.fitzpatrick_scale ?? null,
    skin_undertone:         scan.skin_undertone ?? null,
    observation:            recs?.observation ?? undefined,
  } as GeminiAnalysis;
}

// Skin categories used to filter matchedProducts before passing into the
// skin recs call. Beard/makeup don't need pre-filtering — the per-section
// callers don't take matchedProducts.
const SKIN_CATEGORY_WHITELIST = [
  'face_cleanser', 'moisturizer', 'spf_sunscreen',
  'serum_niacinamide', 'serum_hyaluronic_acid', 'serum_vitamin_c',
  'serum_retinol', 'serum_salicylic_acid', 'serum_azelaic_acid',
  'serum_brightening', 'serum_soothing', 'toner', 'eye_cream',
  'face_mask', 'face_oil', 'face_gel',
];

// Regenerate recommendations for the user's latest scan using updated
// preferences. No camera or vision call — reconstructs GeminiAnalysis from
// the stored scan fields and runs the per-section calls in parallel,
// merging each into recommendations as it lands.
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
    const scanId = latestScan.id as string;

    const analysis = analysisFromScan(latestScan);

    console.log('[refreshRecommendations] step: matching products');
    onProgress?.('Matching products…');
    const productGender: 'all' | 'men' | 'women' =
      gender === 'woman' ? 'women' : gender === 'man' ? 'men' : 'all';

    const productMap = getProductsForProfile({
      categories:      [
        ...buildSkinCategories(analysis),
        ...buildBeardCategories(gender),
        ...buildMakeupCategories(gender, analysis),
      ],
      preferredBrands: preferredBrandsRaw,
      gender:          productGender,
      budget:          inferredBudget,
      skinType:        analysis.skin_type ?? undefined,
      concerns:        analysis.skin_concerns ?? undefined,
      city:            (userRow?.city as string | null) ?? undefined,
      beardGoal:       beardGoal ?? undefined,
    });
    const matchedProducts: MatchedProduct[] = Object.values(productMap).map(arr => arr[0]);

    // Refresh products array on the scan immediately — preferences may have
    // shifted the catalog matches even before any Gemini call completes.
    const productRecs = buildProductRecommendations(productMap);
    const existingRecs = (latestScan.recommendations as Recommendations | null) ?? null;
    const refreshedRecs: Recommendations = {
      observation: existingRecs?.observation as Recommendations['observation'],
      skin:        existingRecs?.skin   ?? ({ advice: '', steps: [] } as SkinRecommendation),
      beard:       existingRecs?.beard  ?? null,
      makeup:      existingRecs?.makeup ?? null,
      products:    productRecs,
    };
    await supabase.from('scans').update({ recommendations: refreshedRecs }).eq('id', scanId);

    console.log('[refreshRecommendations] step: generating recs');
    onProgress?.('Generating recommendations…');

    const beardApplicable =
      careCategories.includes('beard') &&
      !!analysis.beard_density &&
      analysis.beard_density !== 'none';

    let needsMakeup = false;
    if (careCategories.includes('makeup')) {
      const { meta } = await getStoredMakeupRecs(userId);
      needsMakeup = shouldRegenerateMakeup(meta, {
        undertone:   analysis.skin_undertone ?? 'neutral',
        depth_tier:  fitzpatrickToDepthTier(analysis.fitzpatrick_scale) ?? 'medium',
        fitzpatrick: analysis.fitzpatrick_scale ?? 4,
      });
    }

    const skinMatched = matchedProducts.filter(p =>
      p && p.category && SKIN_CATEGORY_WHITELIST.includes(p.category),
    );

    const promises: Array<Promise<void>> = [
      getSkinRecommendations(analysis, skinMatched, ageRange, { scanId })
        .then((skin) => writeRecommendationSection(scanId, 'skin', skin))
        .catch((err: unknown) => {
          console.error('[refreshRecommendations] skin failed:',
            err instanceof Error ? err.message : String(err));
        }),
    ];

    if (beardApplicable) {
      promises.push(
        getBeardRecommendations(analysis, beardGoal, { scanId })
          .then((beard) => writeRecommendationSection(scanId, 'beard', beard))
          .catch((err: unknown) => {
            console.error('[refreshRecommendations] beard failed:',
              err instanceof Error ? err.message : String(err));
          }),
      );
    }

    if (needsMakeup) {
      promises.push(
        getMakeupRecommendations(analysis, { scanId })
          .then(async (makeup) => {
            await writeRecommendationSection(scanId, 'makeup', makeup);
            try {
              await saveMakeupRecs(
                userId,
                makeup,
                analysis.skin_undertone ?? 'neutral',
                fitzpatrickToDepthTier(analysis.fitzpatrick_scale) ?? 'medium',
                analysis.fitzpatrick_scale ?? 4,
              );
            } catch (saveErr) {
              console.warn('[refreshRecommendations] saveMakeupRecs failed (non-fatal):',
                saveErr instanceof Error ? saveErr.message : String(saveErr));
            }
          })
          .catch((err: unknown) => {
            console.error('[refreshRecommendations] makeup failed:',
              err instanceof Error ? err.message : String(err));
          }),
      );
    }

    await Promise.allSettled(promises);

    console.log('[refreshRecommendations] step: saving');
    onProgress?.('Saving…');

    const { data: refreshedRow } = await supabase
      .from('scans')
      .select('*')
      .eq('id', scanId)
      .single();
    const updatedScan = (refreshedRow ?? latestScan) as Scan;

    try {
      await AsyncStorage.setItem(RECOMMENDATIONS_KEY(scanId), JSON.stringify(updatedScan));
      await AsyncStorage.setItem(LATEST_SCAN_KEY, JSON.stringify(updatedScan));
    } catch {
      // Non-critical — offline cache failure should not surface to user
    }

    try {
      await AsyncStorage.setItem(PRODUCT_MAP_KEY(scanId), JSON.stringify(productMap));
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

    return scanId;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[refreshRecommendations] CRASH:', msg);
    throw error;
  }
}

// ── Per-section regenerate (UI retry path) ──────────────────────────────────
// Each function loads the latest scan, reconstructs the analysis, calls the
// matching per-section recs function, and merges the result back into the
// scan's recommendations JSONB. They throw on failure so the UI can flip
// the section state back to 'failed' and re-offer retry.

async function loadScanForRegen(scanId: string): Promise<{
  scan:    Scan;
  userId:  string;
}> {
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('id', scanId)
    .single();
  if (error || !data) throw new Error(`Scan ${scanId} not found: ${error?.message ?? 'unknown'}`);
  const scan = data as Scan;
  return { scan, userId: scan.user_id as string };
}

export async function regenerateSkinRecs(scanId: string): Promise<SkinRecommendation> {
  const { scan, userId } = await loadScanForRegen(scanId);
  const analysis = analysisFromScan(scan);

  const { data: userRow } = await supabase
    .from('users')
    .select('gender, city, preferred_brands_v2, age_range, beard_goal')
    .eq('id', userId)
    .single();
  const gender             = (userRow?.gender as string | null) ?? 'man';
  const preferredBrandsRaw = (userRow as { preferred_brands_v2?: PreferredBrands } | null)
    ?.preferred_brands_v2 ?? { skin: [], hair: [], makeup: [] };
  const inferredBudget     = inferBudgetFromBrands(preferredBrandsRaw);
  const ageRange           = (userRow as { age_range?: string } | null)?.age_range ?? null;
  const beardGoal          = (userRow as { beard_goal?: BeardGoal | null } | null)?.beard_goal ?? null;
  const productGender: 'all' | 'men' | 'women' =
    gender === 'woman' ? 'women' : gender === 'man' ? 'men' : 'all';

  const productMap = getProductsForProfile({
    categories:      buildSkinCategories(analysis),
    preferredBrands: preferredBrandsRaw,
    gender:          productGender,
    budget:          inferredBudget,
    skinType:        analysis.skin_type ?? undefined,
    concerns:        analysis.skin_concerns ?? undefined,
    city:            (userRow?.city as string | null) ?? undefined,
    beardGoal:       beardGoal ?? undefined,
  });
  const matchedProducts: MatchedProduct[] = Object.values(productMap)
    .map(arr => arr[0])
    .filter(p => p && p.category && SKIN_CATEGORY_WHITELIST.includes(p.category));

  const skin = await getSkinRecommendations(analysis, matchedProducts, ageRange, { scanId });
  await writeRecommendationSection(scanId, 'skin', skin);
  return skin;
}

export async function regenerateBeardRecs(scanId: string): Promise<BeardRecommendation> {
  const { scan, userId } = await loadScanForRegen(scanId);
  const analysis = analysisFromScan(scan);

  const { data: userRow } = await supabase
    .from('users')
    .select('beard_goal')
    .eq('id', userId)
    .single();
  const beardGoal = (userRow as { beard_goal?: BeardGoal | null } | null)?.beard_goal ?? null;

  const beard = await getBeardRecommendations(analysis, beardGoal, { scanId });
  await writeRecommendationSection(scanId, 'beard', beard);
  return beard;
}

export async function regenerateMakeupRecs(scanId: string): Promise<MakeupRecommendation> {
  const { scan, userId } = await loadScanForRegen(scanId);
  const analysis = analysisFromScan(scan);

  const makeup = await getMakeupRecommendations(analysis, { scanId });
  await writeRecommendationSection(scanId, 'makeup', makeup);

  try {
    await saveMakeupRecs(
      userId,
      makeup,
      analysis.skin_undertone ?? 'neutral',
      fitzpatrickToDepthTier(analysis.fitzpatrick_scale) ?? 'medium',
      analysis.fitzpatrick_scale ?? 4,
    );
  } catch (saveErr) {
    console.warn('[regenerateMakeupRecs] saveMakeupRecs failed (non-fatal):',
      saveErr instanceof Error ? saveErr.message : String(saveErr));
  }

  return makeup;
}

/**
 * Re-runs scheduleRoutineForScan after a section regeneration.
 * Reads the updated scan + user hair data, then upserts routine_checkins
 * for all remaining days in the 28-day window. Idempotent — existing rows
 * are skipped; rows for the newly-regenerated section are inserted.
 */
export async function rescheduleAfterRegen(scanId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[rescheduleAfterRegen] no auth session');
    return;
  }

  const [{ data: scan, error: scanErr }, { data: userRow }] = await Promise.all([
    supabase.from('scans').select('*').eq('id', scanId).single(),
    supabase.from('users').select('hair_profile, hair_recommendations').eq('id', user.id).single(),
  ]);

  if (scanErr || !scan) {
    console.error('[rescheduleAfterRegen] scan fetch failed', scanErr);
    return;
  }

  try {
    await scheduleRoutineForScan({
      scanId,
      userId:          user.id,
      scan:            scan as Scan,
      userHairProfile: (userRow?.hair_profile as HairProfile | null) ?? null,
      userHairRoutine: (userRow?.hair_recommendations as HairRecommendations | null)?.routine ?? null,
    });
    console.log('[rescheduleAfterRegen] rescheduled routine for scan', scanId);
  } catch (e) {
    console.error('[rescheduleAfterRegen] schedule failed (non-fatal)', e);
    // Don't rethrow — regen UI already succeeded; routine will recover on next scan.
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

// ── Alternatives for a routine step ─────────────────────────────────────────
// Returns a ranked list of alternative MatchedProducts for a given step on
// a saved scan. Used by the product-detail "see alternatives" affordance.
// Inputs:
//   - scanId: identifies the scan we're getting alternatives for
//   - stepId: RoutineStep.step_id within recommendations.skin/beard.steps[]
//   - excludeProductIds: product IDs already shown (e.g. the prescribed pick)
//   - limit: how many alternatives to return (default 5)
export async function getAlternativesForStep(
  scanId:            string,
  stepId:            string,
  excludeProductIds: string[] = [],
  limit:             number = 5,
): Promise<MatchedProduct[]> {
  const { data: scanRow, error: scanErr } = await supabase
    .from('scans')
    .select('*')
    .eq('id', scanId)
    .single();
  if (scanErr || !scanRow) throw new Error(`Scan ${scanId} not found: ${scanErr?.message ?? 'unknown'}`);
  const scan = scanRow as Scan;

  // Find the step across skin / beard / hair recommendation slices.
  const recs = scan.recommendations as Recommendations | null;
  const allSteps: RoutineStep[] = [
    ...(recs?.skin?.steps ?? []),
    ...(recs?.beard?.steps ?? []),
  ];
  const step = allSteps.find(s => s.step_id === stepId);
  if (!step || !step.category) {
    throw new Error(`Step ${stepId} not found on scan ${scanId} or missing category`);
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('city, preferred_brands_v2, beard_goal')
    .eq('id', scan.user_id as string)
    .single();
  const preferredBrandsRaw = (userRow as { preferred_brands_v2?: PreferredBrands } | null)
    ?.preferred_brands_v2 ?? { skin: [], hair: [], makeup: [] };
  const beardGoal = (userRow as { beard_goal?: BeardGoal | null } | null)?.beard_goal ?? null;
  const city      = (userRow as { city?: string | null } | null)?.city ?? null;

  const brandList: string[] = [
    ...(preferredBrandsRaw.skin   ?? []),
    ...(preferredBrandsRaw.hair   ?? []),
    ...(preferredBrandsRaw.makeup ?? []),
  ];

  return getScoredProducts({
    category:          step.category,
    target_concern:    step.target_concern,
    beard_goal:        beardGoal ?? undefined,
    limit,
    excludeProductIds,
    userProfile: {
      skin_type:         scan.skin_type ?? undefined,
      primary_concerns:  scan.skin_concerns ?? undefined,
      brand_preferences: brandList,
      climate:           deriveClimateFromCity(city ?? undefined),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// REMOVED IN PHASE XI: logProductEvent
//
// This function previously wrote to product_events (and product_usage) on
// every buy-tap. It was a dead export at the time of removal — no UI
// callsite ever invoked it.
//
// Wire-up was intentionally deferred. The current product catalogue is a
// makeshift one with placeholder SKUs and brands that will be replaced when
// affiliate links are integrated. Capturing buy-tap telemetry against
// makeshift product identifiers would produce data that is correctly
// shaped but semantically junk — product IDs that won't exist post-rebuild,
// brands that may change, categories that may be re-taxonomized.
//
// Both product_events and product_usage tables remain in the schema
// (see phase_00_baseline_telemetry.sql and phase_xi_create_missing_tables.sql)
// ready for use when the rebuild lands. At that point a properly designed
// telemetry function should be added — likely separate functions for tap
// events (writing to product_events) and product-usage state changes
// (writing to product_usage with an actual using_it value, populated from
// a "I'm using this" UI affordance that doesn't exist yet).
// ─────────────────────────────────────────────────────────────────────────
