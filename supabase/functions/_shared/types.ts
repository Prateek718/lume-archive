// Phase XIII server-side type duplications.
//
// Mirrors the client-side definitions in types/index.ts that the request /
// response contracts depend on. Pure type definitions — no runtime cost.
// Kept in sync manually; a CI diff is out of scope for v1 (see §2.6 of the
// architecture doc).

// ─── Skin observation primitives (mirror types/index.ts:7-21) ────────────────
export type Undertone = "warm" | "cool" | "neutral";
export type DepthTier = "fair" | "light_medium" | "medium" | "tan" | "deep";
export type SkinConcernSeverity = "mild" | "moderate" | "significant";

export interface SkinConcernObservation {
  concern:        string;
  severity:       SkinConcernSeverity;
  zones?:         string[];
  notes?:         string;
  display_label?: string;
}

// ─── ScanObservation primitives (mirror types/index.ts:300-312) ──────────────
export interface ScanInsight {
  number:   "01" | "02" | "03";
  headline: string;
  body:     string;
}

export interface ScanObservation {
  title:        string;
  issue_label:  string;
  dek:          string;
  insights:     [ScanInsight, ScanInsight, ScanInsight];
  trait_chips:  string[];
}

// ─── Cost-tracking primitives (mirror lib/geminiUsage.ts) ────────────────────
export type CallType =
  | "vision"
  | "skin_recs"
  | "beard_recs"
  | "makeup_recs"
  | "hair_recs"
  | "delta_commentary";

export type ModelName =
  | "gemini-2.5-pro"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite";

// ─── Vision request / response (§1.1 of architecture doc) ────────────────────
export interface GeminiVisionRequest {
  imageBase64:         string;
  city:                string | null;
  gender:              "man" | "woman";
  careCategories:      string[];
  ageRange:            string | null;
  previousScanSummary: string | null;
  scanId:              string;
  scanNumber:          number;
}

export interface GeminiVisionResponse {
  face_shape:               string | null;
  skin_type:                string | null;
  skin_concerns:            string[];
  skin_concerns_detailed:   SkinConcernObservation[];
  beard_density:            "none" | "light" | "medium" | "heavy" | null;
  beard_condition:          "well_groomed" | "needs_shaping" | "patchy" | "untrimmed" | null;
  brow_condition:           "well_defined" | "sparse" | "ungroomed" | "over_plucked" | null;
  undereye:                 "dark_circles" | "puffiness" | "normal" | null;
  score_skin:               number | null;
  fitzpatrick_scale:        number | null;
  skin_undertone:           "warm" | "cool" | "neutral" | null;
  observation:              ScanObservation;
  confidence?: {
    face_shape?:     number;
    skin_undertone?: number;
  };
  alternatives?: {
    face_shape?:     string | null;
    skin_undertone?: string | null;
  };
}

// ─── Delta commentary primitives (mirror lib/gemini/delta.ts:26-52) ──────────
export interface DekLine {
  number:   "01" | "02" | "03";
  headline: string;
  body:     string;
}

export interface DeltaScanContext {
  scan_number:                number;
  days_between:               number;
  previous_concerns:          string[];
  current_concerns:           string[];
  previous_concerns_detailed: SkinConcernObservation[];
  current_concerns_detailed:  SkinConcernObservation[];
  concerns_improved:          string[];
  concerns_persistent:        string[];
  concerns_new:               string[];
  concerns_worsened:          string[];
}

// Slim Scan projection — mirrors Pick<Scan, 'skin_concerns' | 'skin_concerns_detailed'>
// from types/index.ts:341-350. We duplicate just the two fields delta needs
// so the server doesn't have to import the entire Scan shape.
export interface DeltaScanInput {
  skin_concerns:           string[] | null;
  skin_concerns_detailed?: SkinConcernObservation[];
}

// ─── Delta commentary request / response (§1.6 of architecture doc) ──────────
export interface GeminiDeltaCommentaryRequest {
  previousScan: DeltaScanInput;
  currentScan:  DeltaScanInput;
  scanDelta: {
    days_between:        number;
    concerns_improved:   string[];
    concerns_new:        string[];
    concerns_persistent: string[];
  };
  scanNumber: number;
  scanId:     string | null;
}

export interface GeminiDeltaCommentaryResponse {
  cover_dek:     string;
  cover_lines:   [DekLine, DekLine, DekLine];
  concern_notes: { [concernKey: string]: string };
  closing_line:  string;
}

// ─── Beard primitives (mirror types/index.ts:44-49, 238-255) ─────────────────
export type BeardGoal = "fuller" | "sharper" | "shorter" | "longer" | "none";

export interface BeardRoutineStep {
  step_id:             "beard_wash" | "beard_oil" | "beard_balm";
  label:               string;
  product:             string;
  order:               number;
  category:            string;
  clinical_reasoning:  string;
}

export interface BeardStyle {
  name:        string;
  why:         string;
  maintenance: "low" | "medium" | "high";
}

// ─── Beard recs request / response (§1.3 of architecture doc) ────────────────
export interface GeminiBeardRecsRequest {
  analysis:  GeminiVisionResponse;
  beardGoal: BeardGoal | null;
  scanId:    string | null;
}

export interface GeminiBeardRecsResponse {
  advice:             string;
  beard_shape_intro:  string | null;
  steps:              BeardRoutineStep[];
  beard_styles:       BeardStyle[];
}

// ─── Makeup primitives (mirror types/index.ts:261-284) ───────────────────────
export interface MakeupSwatch {
  hex:          string;
  category:     "foundation" | "lip" | "blush" | "eye" | "highlighter" | "bronzer";
  name:         string;
  description:  string;
  search_query: string;
}

export interface MakeupPalette {
  undertone:     Undertone;
  depth_tier:    DepthTier;
  hero_line:     string;
  trait_chips:   string[];
  prose:         string;
  swatches:      MakeupSwatch[] | string[];
  shade_families: {
    foundation:  string;
    lip:         string;
    blush:       string;
    concealer:   string;
  };
}

// ─── Makeup recs request / response (§1.4 of architecture doc) ───────────────
export interface GeminiMakeupRecsRequest {
  analysis: GeminiVisionResponse;
  scanId:   string | null;
}

export interface GeminiMakeupRecsResponse {
  advice:     string;
  techniques: string[];
  palette:    MakeupPalette | null;
}

// ─── Hair primitives (mirror types/index.ts:113-178) ─────────────────────────
export interface HairProfile {
  hair_length:          "bald" | "very_short" | "short" | "medium" | "long";
  scalp_type:           "oily" | "normal" | "dry" | "combination";
  scalp_concern?:       "dry_flaky" | "oily_shiny" | "sensitive" | "none";
  sun_exposure?:        boolean;
  primary_concern?:     string[];
  texture?:             "straight" | "wavy" | "curly" | "coily";
  wash_frequency?:      "daily" | "every_2_3_days" | "once_a_week" | "less_than_weekly";
  oils_regularly?:      boolean;
  chemically_treated?:  "none" | "color" | "straightening" | "perming" | "multiple";
}

export interface MatchedProduct {
  id?:           string;
  category:      string;
  name:          string;
  brand:         string;
  attributes:    string[];
  price_inr?:    number;
  price_tier?:   "entry" | "mid" | "premium";
  actives?:      string[];
  why_this_one?: string;
  retailer_urls?: { nykaa?: string; amazon?: string; brand_direct?: string };
}

export interface HairStyle {
  name:         string;
  why:          string;
  maintenance:  "low" | "medium" | "high";
  climate_note: string | null;
}

export interface HairRoutineStep {
  step_id:             string;
  label:               string;
  product:             string;
  cadence:             "every_wash" | "weekly" | "monthly";
  level:               "simple" | "balanced" | "full";
  order:               number;
  category?:           string;
  clinical_reasoning?: string;
}

export interface HairProductPick {
  category:    string;
  name:        string;
  brand:       string;
  reason:      string;
  match_score: number;
  attributes?: string[];
}

// ─── Hair recs request / response (§1.5 of architecture doc) ─────────────────
export interface GeminiHairRecsRequest {
  profile:         HairProfile;
  faceShape:       string | null;
  gender:          string;
  city:            string | null;
  budget:          "affordable" | "premium";
  matchedProducts: MatchedProduct[];
  scanId:          string | null;
}

export interface GeminiHairRecsResponse {
  advice:                string;
  styles:                string[];
  styles_detailed:       HairStyle[];
  condition_explanation: string;
  routine:               HairRoutineStep[];
  products:              HairProductPick[];
}

// ─── Skin primitives (mirror types/index.ts:213-236) ─────────────────────────
export interface RoutineStep {
  step_id:             string;
  label:               string;
  product:             string;
  order:               number;
  level?:              string;
  time_of_day?:        ("am" | "pm")[];
  target_concern?:     string;
  clinical_reasoning?: string;
  category?:           string;
  cadence?:            "daily" | "every_wash" | "weekly" | "monthly";
}

// ─── Skin recs request / response (§1.2 of architecture doc) ─────────────────
export interface GeminiSkinRecsRequest {
  analysis:        GeminiVisionResponse;
  matchedProducts: MatchedProduct[];
  ageRange:        string | null;
  scanId:          string | null;
}

export interface GeminiSkinRecsResponse {
  advice:       string;
  routine_note: string;
  steps:        RoutineStep[];
}
