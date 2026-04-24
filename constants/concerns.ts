// ============================================================
// Lumé Canonical Concerns
// ----------------------------------------------------------------
// The single source of truth for what users can have diagnosed,
// what products can treat, and what scan deltas can measure.
//
// Adding a new concern:
//   1. Add it to CANONICAL_CONCERNS below
//   2. Add normalization aliases if Gemini might emit variants
//   3. Update lib/gemini.ts prompts to teach the new value
//   4. Audit products.json to tag appropriate products
//
// Removing a concern:
//   Don't. Retire via deprecation — rename in UI, keep the
//   enum entry so historical scan data doesn't break.
// ============================================================

export const CANONICAL_CONCERNS = [
  // Skin — active state
  'acne',
  'oiliness',
  'dehydration',
  'dryness',
  'sensitivity',

  // Skin — textural
  'uneven_texture',
  'fine_lines',
  'dullness',

  // Skin — pigmentation
  'hyperpigmentation',
  'uneven_tone',

  // Skin — periorbital
  'dark_circles',
  'puffiness',

  // Hair — scalp
  'dandruff',
  'oily_scalp',
  'dry_scalp',
  'itchy_scalp',

  // Hair — strand
  'hair_fall',
  'frizz',
  'damage',
  'dullness_hair',

  // Beard
  'patchiness',
  'rough_texture',
  'itchiness_beard',
] as const;

export type CanonicalConcern = typeof CANONICAL_CONCERNS[number];

const CANONICAL_SET = new Set<string>(CANONICAL_CONCERNS);

// ─── Normalization map ────────────────────────────────────────
// Maps: current catalog strings + plausible Gemini emissions +
// common typos/synonyms → canonical concern.
// Keys are lowercase, space-or-underscore normalized.

const CONCERN_ALIASES: Record<string, CanonicalConcern> = {
  // acne cluster
  'acne': 'acne',
  'active_acne': 'acne',
  'breakouts': 'acne',
  'pimples': 'acne',
  'blemishes': 'acne',
  'blackheads': 'acne',
  'whiteheads': 'acne',
  'congestion': 'acne',

  // oiliness cluster
  'oiliness': 'oiliness',
  'oily_skin': 'oiliness',
  'excess_oil': 'oiliness',
  'shine': 'oiliness',
  'sebum': 'oiliness',
  'sebum_regulation': 'oiliness',
  'enlarged_pores': 'oiliness',

  // dehydration (lack of water)
  'dehydration': 'dehydration',
  'dehydrated_skin': 'dehydration',
  'lack_of_hydration': 'dehydration',
  'hydration': 'dehydration',
  'tight_skin': 'dehydration',

  // dryness (lack of oil)
  'dryness': 'dryness',
  'dry_skin': 'dryness',
  'flaking': 'dryness',
  'flaky_skin': 'dryness',
  'rough_skin': 'dryness',

  // sensitivity
  'sensitivity': 'sensitivity',
  'sensitive_skin': 'sensitivity',
  'redness': 'sensitivity',
  'reactive_skin': 'sensitivity',
  'rosacea': 'sensitivity',
  'compromised_barrier': 'sensitivity',
  'barrier_damage': 'sensitivity',
  'irritation': 'sensitivity',

  // textural
  // NOTE: 'rough_texture' itself is a canonical concern (beard). It is
  // caught by the pre-check in normalizeConcern and never falls through
  // here; its entry lives further down with the beard cluster.
  'uneven_texture': 'uneven_texture',
  'texture': 'uneven_texture',
  'bumps': 'uneven_texture',
  'uneven_skin_texture': 'uneven_texture',

  // fine lines / aging
  'fine_lines': 'fine_lines',
  'anti_aging': 'fine_lines',
  'aging': 'fine_lines',
  'wrinkles': 'fine_lines',
  'early_aging': 'fine_lines',
  'premature_aging': 'fine_lines',

  // dullness
  'dullness': 'dullness',
  'dull_skin': 'dullness',
  'lack_of_glow': 'dullness',
  'fatigue': 'dullness',
  'tired_skin': 'dullness',

  // hyperpigmentation
  'hyperpigmentation': 'hyperpigmentation',
  'dark_spots': 'hyperpigmentation',
  'post_acne_marks': 'hyperpigmentation',
  'acne_marks': 'hyperpigmentation',
  'acne_scars': 'hyperpigmentation',
  'pigmentation': 'hyperpigmentation',
  'melasma': 'hyperpigmentation',
  'sun_spots': 'hyperpigmentation',
  'pih': 'hyperpigmentation',

  // uneven tone (subtler)
  'uneven_tone': 'uneven_tone',
  'uneven_skin_tone': 'uneven_tone',
  'blotchiness': 'uneven_tone',
  'mottling': 'uneven_tone',

  // periorbital
  'dark_circles': 'dark_circles',
  'under_eye_circles': 'dark_circles',
  'periorbital_darkening': 'dark_circles',
  'under_eye_darkness': 'dark_circles',
  'under_eye_hollows': 'dark_circles',

  'puffiness': 'puffiness',
  'under_eye_bags': 'puffiness',
  'eye_puffiness': 'puffiness',
  'bags': 'puffiness',

  // hair — scalp
  'dandruff': 'dandruff',
  'flaky_scalp': 'dandruff',
  'scalp_flakes': 'dandruff',

  'oily_scalp': 'oily_scalp',
  'greasy_scalp': 'oily_scalp',
  'scalp_oiliness': 'oily_scalp',
  'scalp_buildup': 'oily_scalp',

  'dry_scalp': 'dry_scalp',
  'scalp_dryness': 'dry_scalp',

  'itchy_scalp': 'itchy_scalp',
  'sensitive_scalp': 'itchy_scalp',
  'scalp_irritation': 'itchy_scalp',

  // hair — strand
  'hair_fall': 'hair_fall',
  'hair_thinning': 'hair_fall',
  'thinning': 'hair_fall',
  'hair_loss': 'hair_fall',
  'shedding': 'hair_fall',
  'hair_growth': 'hair_fall', // growth-supporting products target hair_fall

  'frizz': 'frizz',
  'frizzy_hair': 'frizz',
  'unruly_hair': 'frizz',

  'damage': 'damage',
  'damaged_hair': 'damage',
  'chemical_damage': 'damage',
  'heat_damage': 'damage',
  'split_ends': 'damage',
  'weakened_hair': 'damage',

  'dullness_hair': 'dullness_hair',
  'dull_hair': 'dullness_hair',
  'lifeless_hair': 'dullness_hair',

  // beard
  'patchiness': 'patchiness',
  'patchy_beard': 'patchiness',
  'beard_patches': 'patchiness',
  'uneven_beard': 'patchiness',

  'rough_texture': 'rough_texture', // note: overlaps with skin uneven_texture — disambiguated by product category
  'coarse_beard': 'rough_texture',
  'beard_softness': 'rough_texture',
  'beard_conditioning': 'rough_texture',

  'itchiness_beard': 'itchiness_beard',
  'itchy_beard': 'itchiness_beard',
  'beard_itch': 'itchiness_beard',
};

/**
 * Normalize a concern string to its canonical form.
 * Handles case, underscore/space variants, and common synonyms.
 *
 * @returns canonical concern, or null if no match found
 */
export function normalizeConcern(input: string | null | undefined): CanonicalConcern | null {
  if (!input || typeof input !== 'string') return null;

  const key = input
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/[^a-z_]/g, '')
    .trim();

  if (CANONICAL_SET.has(key)) return key as CanonicalConcern;
  if (CONCERN_ALIASES[key]) return CONCERN_ALIASES[key];

  return null;
}

/**
 * Normalize an array of concern strings. Drops unmatched entries
 * with a warning. Deduplicates the output.
 */
export function normalizeConcerns(inputs: (string | null | undefined)[]): CanonicalConcern[] {
  const out = new Set<CanonicalConcern>();
  for (const raw of inputs) {
    const normalized = normalizeConcern(raw);
    if (normalized) {
      out.add(normalized);
    } else if (raw && typeof raw === 'string' && raw.trim()) {
      console.warn(`[normalizeConcern] unmatched: "${raw}"`);
    }
  }
  return [...out];
}

/**
 * Type guard — narrows a string to CanonicalConcern at the type level.
 */
export function isCanonicalConcern(s: string): s is CanonicalConcern {
  return CANONICAL_SET.has(s);
}