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
