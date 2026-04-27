// All TypeScript types for Lumé.
// These mirror the Supabase database tables exactly.

// ─── Makeup palette primitives ────────────────────────────────────────────────
// Shared by lib/gemini.ts (palette lookup) and the Recommendations shape.
// Kept here to avoid a circular import between types/ and lib/gemini.ts.
export type Undertone = 'warm' | 'cool' | 'neutral';
export type DepthTier = 'fair' | 'light_medium' | 'medium' | 'tan' | 'deep';

// ─── Skin concern severity (new — 2026-04-23) ────────────────────────────────
// Attached to each concern flagged by the vision call so the UI can render
// a severity chip and so recommendations can weight intensity of actives.
export type SkinConcernSeverity = 'mild' | 'moderate' | 'significant';

export interface SkinConcernObservation {
  concern:       string;                      // e.g. "dehydration", "acne"
  severity:      SkinConcernSeverity;
  zones?:        string[];                    // e.g. ["t_zone", "cheeks"]
  notes?:        string;                      // short evidence description
  display_label?: string;                     // 2-5 word human-readable label for UI, context-aware (severity + zones)
}

// ─── Brand preferences ────────────────────────────────────────────────────────
export interface PreferredBrands {
  skin:    string[];
  hair:    string[];
  makeup:  string[];
  beard?:  string[];   // optional — present for male/other users post Phase D
}

export type BudgetTier = 'budget' | 'mid' | 'premium';

export type BrandPhilosophy =
  | 'ingredient_focused'
  | 'natural_ayurvedic'
  | 'professional_salon'
  | 'luxury'
  | 'mass_market';

// ─── Beard goal ──────────────────────────────────────────────────────────────
// Captured during the first scan with detected beard density. Drives which
// beard products get prescribed and which actives the scoring boosts.
// User-facing labels — these strings are stored verbatim in DB.
export type BeardGoal =
  | 'fuller'
  | 'sharper'
  | 'shorter'
  | 'longer'
  | 'none';

// ─── User ────────────────────────────────────────────────────────────────────
// Matches the public.users table.
export interface User {
  id:                     string;           // uuid — matches auth.users id
  display_name:           string | null;
  gender:                 'man' | 'woman' | 'other' | 'prefer_not_to_say' | null;
  city:                   string | null;
  avatar_url:             string | null;
  referral_code:          string | null;
  referred_by:            string | null;    // uuid of referring user
  push_token:             string | null;
  notification_reminders: boolean;
  notification_routine:   boolean;
  last_scan_at:           string | null;    // ISO timestamp
  onboarding_complete:    boolean;
  care_categories:        Array<'skin' | 'hair' | 'beard' | 'makeup'>;
  age_range?:             '18-25' | '26-35' | '36-45' | '46-55' | '55+' | null;
  created_at:             string;           // ISO timestamp
  hair_profile:           HairProfile | null;
  hair_recommendations:   HairRecommendations | null;
  preferred_brands_v2:    PreferredBrands | null;
  budget?:                string;
  traits?:                UserTraits;
  beard_goal?:            BeardGoal | null;
}

// ─── Stable diagnostic traits ────────────────────────────────────────────────
// Persisted in users.traits (JSONB). Locked after the first confident scan
// (or after user confirmation on a borderline scan) and carried forward into
// subsequent scans unless overridden. State fields (scores, concerns, density)
// do NOT get tracked here — they're re-measured every scan.
export interface UserTrait {
  value:      string;
  confidence: number;                                        // 0.0–1.0, model confidence at lock time
  locked_at:  string;                                        // ISO timestamp
  source:     'first_scan_auto' | 'user_confirmed' | 'overridden';
}

export interface UserTraits {
  face_shape?:     UserTrait;
  hair_texture?:   UserTrait;
  skin_undertone?: UserTrait;
}

// Shape of a pending trait decision surfaced by lib/traits.ts.
// Non-persisted; UI-only. Attached to PartialScan via `_pendingTraitDecisions`.
export interface PendingTraitDecision {
  trait:       'face_shape' | 'hair_texture' | 'skin_undertone';
  kind:        'confirm' | 'override';    // confirm = no persisted trait yet; override = disagrees with locked
  primary:     string;                     // model's top pick
  alternative: string;                     // model's second pick (or locked value for overrides)
  confidence:  number;
}

// ─── Hair Profile ─────────────────────────────────────────────────────────────
// Stored in users.hair_profile JSONB column.
export interface HairProfile {
  hair_length:          'bald' | 'very_short' | 'short' | 'medium' | 'long';
  scalp_type:           'oily' | 'normal' | 'dry' | 'combination';
  scalp_concern?:       'dry_flaky' | 'oily_shiny' | 'sensitive' | 'none';
  sun_exposure?:        boolean;
  primary_concern?:     string[];
  texture?:             'straight' | 'wavy' | 'curly' | 'coily';
  wash_frequency?:      'daily' | 'every_2_3_days' | 'once_a_week' | 'less_than_weekly';
  oils_regularly?:      boolean;
  chemically_treated?:  'none' | 'color' | 'straightening' | 'perming' | 'multiple';
}

export function isBaldProfile(profile: HairProfile | null | undefined): boolean {
  return profile?.hair_length === 'bald';
}

// Stored in users.hair_recommendations JSONB column. Generated by Gemini
// from the user's hair profile — independent of the face scan.
export interface HairRecommendations {
  advice:                string;
  styles:                string[];
  styles_detailed?:      HairStyleRecommendation[];
  condition_explanation: string;
  routine:               HairRoutineStep[];
  products:              ProductRecommendation[];

  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. */
  summary?:              string;
  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. Content now lives per-step in `routine[].cadence`. */
  wash_frequency?:       string;
  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. Content now lives per-step in `routine[]`. */
  wash_steps?:           string[];
  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. Content now lives per-step in `routine[]` via `cadence: "weekly"`. */
  weekly_treatment?:     string;
}

export interface HairRoutineStep {
  step_id:             string;       // e.g. "hair_shampoo", "hair_conditioner"
  label:               string;
  product:             string;
  cadence:             'every_wash' | 'weekly' | 'monthly';
  level:               'simple' | 'balanced' | 'full';
  order:               number;
  category?:           string;       // canonical category id (Phase D+)
  clinical_reasoning?: string;       // 1-2 sentences tied to user's hair profile
}

// ─── Recommendations ─────────────────────────────────────────────────────────
// Matches the recommendations JSONB column inside the scans table.

export interface HairStyleRecommendation {
  name:           string;
  why:            string;
  maintenance:    'low' | 'medium' | 'high';
  climate_note:   string | null;

  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. Replaced by `why`. */
  why_face_shape?: string;
  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. Replaced by `why`. */
  why_texture?:    string;
  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. Avoid entries are no longer returned. */
  avoid?:          boolean;
  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. */
  avoid_reason?:   string;
}

// A product already matched from the catalogue and passed to Claude for reasons.
export interface MatchedProduct {
  id?:         string;          // stable id from PRODUCTS catalogue; undefined for legacy matches
  category:    string;
  name:        string;
  brand:       string;
  attributes:  string[];

  // New-schema fields — populated by getScoredProducts.
  price_inr?:      number;
  price_tier?:     'entry' | 'mid' | 'premium';
  actives?:        string[];
  why_this_one?:   string;      // per-user rationale string generated by scoring
  retailer_urls?:  { nykaa?: string; amazon?: string; brand_direct?: string };

  /** @deprecated — replaced by `why_this_one` from scoring. Still populated on legacy matches. */
  why_good?:   string;
  /** @deprecated — old-schema field, unused by new scoring. Present only on legacy matches. */
  is_featured?: boolean;
  /** @deprecated — use `retailer_urls.nykaa` instead. Still populated on legacy matches. */
  nykaa_url?:  string;
}

// One product recommendation stored inside Recommendations — contains the
// matched product identity (name, brand) and Claude's personalised reason.
export interface ProductRecommendation {
  category:    string;
  name:        string;
  brand:       string;
  attributes?: string[];  // preserved for legacy scans
  reason:      string;
  match_score: number;
}

export interface RoutineStep {
  step_id:             string;        // canonical id, e.g. "skin_cleanse", "skin_treat_1", "beard_wash"
  label:               string;        // short noun, e.g. "Cleanse", "Treat", "Moisturize", "Protect"
  product:             string;        // generic descriptor, e.g. "Niacinamide serum"
  level:               string;        // legacy field — retained for older scans, unused by new schema
  order:               number;        // display order within the routine
  time_of_day?:        ('am' | 'pm')[]; // which slots this step applies to. Required on new-schema steps.
  target_concern?:     string;         // populated only for Treat steps (e.g. 'acne', 'hyperpigmentation')
  clinical_reasoning?: string;         // 1–2 sentences tying the step to this user's scan
  category?:           string;         // canonical category id (face_cleanser, serum_niacinamide, ...)
  cadence?:            'daily' | 'every_wash' | 'weekly' | 'monthly';
}

export interface SkinRecommendation {
  advice:        string;
  steps?:        RoutineStep[];
  routine_note?: string;   // 2-3 sentence editorial meta-observation on the routine itself, pulled-quote style

  /** @deprecated — pre-2026-04-21 scans store routine as { morning, evening }. New scans use `steps`. Read both for back-compat. */
  routine?: { morning: RoutineStep[]; evening: RoutineStep[] };

  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. Preview now derives from first sentence of `advice`. */
  summary?: string;
}

export interface BeardStyleItem {
  name:             string;
  maintenance:      'low' | 'medium' | 'high';
  why:              string;   // max 18 words, imperative, single reason

  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. Not-recommended styles are no longer returned. */
  not_recommended?: boolean;
}

export interface BeardRecommendation {
  advice:             string;    // imperative voice, 2 sentences max
  beard_shape_intro?: string | null;  // optional editorial bridge sentence; null when missing or face-shape contaminated
  beard_styles?:      BeardStyleItem[];
  steps?:             RoutineStep[]; // beard routine steps (beard_wash, beard_oil, beard_balm)

  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. Preview now derives from first sentence of `advice`. */
  summary?:           string;
}

// One swatch in the makeup palette. New-schema scans (post 2026-04-26) emit
// MakeupSwatch objects with category + searchable name + descriptive prose.
// Pre-2026-04-26 scans store swatches as bare hex strings — see
// MakeupPalette.swatches below for the union and the legacy detector.
export interface MakeupSwatch {
  hex:          string;     // e.g. "#C58A6E"
  category:     'foundation' | 'lip' | 'blush' | 'eye' | 'highlighter' | 'bronzer';
  name:         string;     // searchable shade name, e.g. "Warm Beige Foundation"
  description:  string;     // 2-3 sentences, italic-serif body — why it flatters
  search_query: string;     // exact Nykaa search string
}

export interface MakeupPalette {
  undertone:     Undertone;
  depth_tier:    DepthTier;
  hero_line:     string;                       // "A warm, medium palette."
  trait_chips:   string[];                     // exactly 3 short chips
  prose:         string;                       // 2-3 sentence paragraph
  // Legacy scans store swatches as `string[]` (bare hex). New scans store
  // `MakeupSwatch[]`. Detect at the call site via `typeof s[0] === 'string'`.
  swatches:      MakeupSwatch[] | string[];
  shade_families: {
    foundation:  string;
    lip:         string;
    blush:       string;
    concealer:   string;
  };
}

export interface MakeupRecommendation {
  advice:      string;
  techniques:  string[];
  palette?:    MakeupPalette | null;

  /** @deprecated — removed from Gemini schema on 2026-04-20. Still present on scans created before this date. Preview now derives from first sentence of `advice`. */
  summary?:    string;
}

// ─── Observation (Phase 3B) ──────────────────────────────────────────────────
// Editorial first-reveal shown immediately after a scan. Three numbered
// insights + trait chips. Emitted first in the recs response so it streams
// first — the UX win we bought the streaming infrastructure for.

export interface ScanInsight {
  number:   '01' | '02' | '03';
  headline: string;    // 2-4 words, editorial — e.g. "Mostly well" or "Oil is louder"
  body:     string;    // 1-2 sentences, max ~150 chars
}

export interface ScanObservation {
  title:        string;              // Display text, e.g. "A first observation."
  issue_label:  string;              // ChapterLabel text, e.g. "Issue one · cover"
  dek:          string;              // italic sub-title, 6-10 words
  insights:     [ScanInsight, ScanInsight, ScanInsight];  // always exactly 3
  trait_chips:  string[];            // 4-7 short lowercase descriptors
}

export interface Recommendations {
  observation: ScanObservation;            // always present — first reveal after scan
  skin:     SkinRecommendation;
  beard:    BeardRecommendation | null;    // men only
  makeup:   MakeupRecommendation | null;  // women only
  products: ProductRecommendation[];      // all matched products across sections
}

// ─── Scan ─────────────────────────────────────────────────────────────────────
// Matches the public.scans table.
export interface Scan {
  id:                string;    // uuid
  user_id:           string;    // uuid
  image_url:         string | null;

  // Face analysis from Gemini
  face_shape:        'oval' | 'round' | 'square' | 'heart' | 'oblong' | 'diamond' | null;
  skin_type:         'oily' | 'dry' | 'combination' | 'normal' | 'sensitive' | null;
  skin_concerns:     string[] | null;        // legacy — mirrored from skin_concerns_detailed[].concern
  skin_concerns_detailed?: SkinConcernObservation[];   // new — severity + zones per concern
  beard_density:     'none' | 'light' | 'medium' | 'heavy' | null;  // men only
  beard_condition:   string | null;
  brow_condition:    string | null;
  undereye:          string | null;
  fitzpatrick_scale?: number | null;
  skin_tone?:         string | null;
  skin_undertone?:    'warm' | 'cool' | 'neutral' | null;

  // Scores
  score_skin:        number | null;    // 0-100
  score_beard:       number | null;    // 0-100, null for women
  score_makeup:      number | null;    // 0-100, null for men
  score_overall:     number | null;    // average of applicable categories

  tier_label?:       string | null;    // kept for DB compatibility only — not used in UI

  // AI-generated advice from Claude Haiku
  recommendations:   Recommendations | null;

  stylist_mentioned: string | null;    // optional name/handle tagged by user
  share_count:       number;
  created_at:        string;           // ISO timestamp

  // Phase A.5 — trait confidence surfaced from the vision call.
  // Optional because legacy scans in the DB won't have them.
  confidence?: {
    face_shape?:     number;
    hair_texture?:   number;
    skin_undertone?: number;
  };
  alternatives?: {
    face_shape?:     string | null;
    hair_texture?:   string | null;
    skin_undertone?: string | null;
  };
}

// ─── Partial Scan ─────────────────────────────────────────────────────────────
// Represents the scan state after phase 1 (vision only) completes.
// All analysis fields are present; recommendations are null until phase 2 finishes.
export interface PartialScan {
  id:                string;
  user_id:           string;
  face_shape:        string | null;
  skin_type:         string | null;
  skin_concerns:     string[] | null;
  beard_density:     string | null;
  beard_condition:   string | null;
  brow_condition:    string | null;
  undereye:          string | null;
  fitzpatrick_scale: number | null;
  skin_tone:         string | null;
  skin_undertone:    string | null;
  score_skin:        number | null;
  score_beard:       number | null;
  score_makeup:      number | null;
  score_overall:     number | null;
  recommendations:   null;
  created_at:        string;

  // Phase A.5 — trait confidence surfaced from the vision call.
  // Missing on legacy scans — runtime callers must default to 0.5.
  confidence?: {
    face_shape?:     number;
    hair_texture?:   number;
    skin_undertone?: number;
  };
  alternatives?: {
    face_shape?:     string | null;
    hair_texture?:   string | null;
    skin_undertone?: string | null;
  };

  // UI-only, never persisted. Set by runScanPhase1 when trait resolution
  // needs user input before Phase 2 can run.
  _pendingTraitDecisions?: {
    confirmations: PendingTraitDecision[];
    overrides:     PendingTraitDecision[];
  };
}

// ─── Shadow Stylist ───────────────────────────────────────────────────────────
// Matches the public.shadow_stylists table.
// These are stylists users mention who haven't signed up yet.
export interface ShadowStylist {
  id:               string;
  name:             string | null;
  instagram_handle: string | null;
  salon_name:       string | null;
  city:             string | null;
  mention_count:    number;
  mentioned_by:     string[];   // array of user uuids
  source:           string[];   // e.g. ['user_mention']
  outreach_status:  'none' | 'contacted' | 'onboarded';
  created_at:       string;
}

// ─── Waitlist ─────────────────────────────────────────────────────────────────
// Matches the public.waitlist table.
export interface Waitlist {
  id:         string;
  email:      string;
  city:       string | null;
  created_at: string;
}

// ─── Rescan Feedback ──────────────────────────────────────────────────────────
// Migrated from components/RescanFeedbackFlow.tsx during Phase 0 demolition.
// Collected on the 2nd+ scan while Gemini generates recommendations, and
// persisted on the scan_delta row at delta-computation time.
export type SubjectiveImprovement =
  | 'much_better'
  | 'slightly_better'
  | 'same'
  | 'slightly_worse'
  | 'much_worse';

export type AdherenceBlocker =
  | 'travel'
  | 'ran_out'
  | 'too_busy'
  | 'product_wrong'
  | 'lost_motivation'
  | 'more_consistent_than_thought';

export interface RescanFeedback {
  subjective_improvement?: SubjectiveImprovement;
  adherence_blockers?:     AdherenceBlocker[];
  irritation_flags?:       string[]; // kit_item_ids
}
