// All TypeScript types for Lumé.
// These mirror the Supabase database tables exactly.

// ─── User ────────────────────────────────────────────────────────────────────
// Matches the public.users table.
export interface User {
  id:                     string;           // uuid — matches auth.users id
  display_name:           string | null;
  gender:                 'man' | 'woman' | 'other' | null;
  city:                   string | null;
  avatar_url:             string | null;
  referral_code:          string | null;
  referred_by:            string | null;    // uuid of referring user
  push_token:             string | null;
  notification_reminders: boolean;
  notification_routine:   boolean;
  last_scan_at:           string | null;    // ISO timestamp
  onboarding_complete:    boolean;
  created_at:             string;           // ISO timestamp
}

// ─── Recommendations ─────────────────────────────────────────────────────────
// Matches the recommendations JSONB column inside the scans table.
export interface HairRecommendation {
  summary: string;         // one-sentence summary
  advice:  string;         // exact words to say to stylist
  styles:  string[];       // 3 style name suggestions
}

export interface SkinRecommendation {
  summary:  string;
  advice:   string;
  routine:  string[];      // ordered list of routine steps
}

export interface BeardRecommendation {
  summary: string;
  advice:  string;         // exact words to say to barber
}

export interface MakeupRecommendation {
  summary: string;
  advice:  string;
}

export interface Recommendations {
  hair:   HairRecommendation;
  skin:   SkinRecommendation;
  beard:  BeardRecommendation | null;   // men only
  makeup: MakeupRecommendation | null;  // women only
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
  skin_concerns:     string[] | null;
  hair_texture:      'straight' | 'wavy' | 'curly' | 'coily' | null;
  hair_condition:    'healthy' | 'dry' | 'damaged' | 'oily' | 'thinning' | null;
  beard_density:     'none' | 'light' | 'medium' | 'heavy' | null;  // men only
  beard_condition:   string | null;
  brow_condition:    string | null;
  undereye:          string | null;

  // Scores
  score_hair:        number | null;    // 0-100
  score_skin:        number | null;    // 0-100
  score_beard:       number | null;    // 0-100, null for women
  score_makeup:      number | null;    // 0-100, null for men
  score_overall:     number | null;    // average of applicable categories

  tier_label:        string | null;    // e.g. 'Sharp', 'Polished'

  // AI-generated advice from Claude Haiku
  recommendations:   Recommendations | null;

  stylist_mentioned: string | null;    // optional name/handle tagged by user
  share_count:       number;
  created_at:        string;           // ISO timestamp
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
