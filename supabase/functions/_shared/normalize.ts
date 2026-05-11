// Canonical concern normalization. Mirrors constants/concerns.ts so the
// server can sanitize Gemini's emitted concern strings before persisting.
// Used by gemini-skin-recs (XIII-b). Co-located here in XIII-a so the file
// tree is complete per §2.7 of the architecture doc.

export const CANONICAL_CONCERNS = [
  // Skin — active state
  "acne",
  "oiliness",
  "dehydration",
  "dryness",
  "sensitivity",

  // Skin — textural
  "uneven_texture",
  "fine_lines",
  "dullness",

  // Skin — pigmentation
  "hyperpigmentation",
  "uneven_tone",

  // Skin — periorbital
  "dark_circles",
  "puffiness",

  // Hair — scalp
  "dandruff",
  "oily_scalp",
  "dry_scalp",
  "itchy_scalp",

  // Hair — strand
  "hair_fall",
  "frizz",
  "damage",
  "dullness_hair",

  // Beard
  "patchiness",
  "rough_texture",
  "itchiness_beard",
] as const;

export type CanonicalConcern = typeof CANONICAL_CONCERNS[number];

export const CANONICAL_SET = new Set<string>(CANONICAL_CONCERNS);

export const CONCERN_ALIASES: Record<string, CanonicalConcern> = {
  // acne cluster
  "acne": "acne",
  "active_acne": "acne",
  "breakouts": "acne",
  "pimples": "acne",
  "blemishes": "acne",
  "blackheads": "acne",
  "whiteheads": "acne",
  "congestion": "acne",

  // oiliness cluster
  "oiliness": "oiliness",
  "oily_skin": "oiliness",
  "excess_oil": "oiliness",
  "shine": "oiliness",
  "sebum": "oiliness",
  "sebum_regulation": "oiliness",
  "enlarged_pores": "oiliness",

  // dehydration
  "dehydration": "dehydration",
  "dehydrated_skin": "dehydration",
  "lack_of_hydration": "dehydration",
  "hydration": "dehydration",
  "tight_skin": "dehydration",

  // dryness
  "dryness": "dryness",
  "dry_skin": "dryness",
  "flaking": "dryness",
  "flaky_skin": "dryness",
  "rough_skin": "dryness",

  // sensitivity
  "sensitivity": "sensitivity",
  "sensitive_skin": "sensitivity",
  "redness": "sensitivity",
  "reactive_skin": "sensitivity",
  "rosacea": "sensitivity",
  "compromised_barrier": "sensitivity",
  "barrier_damage": "sensitivity",
  "irritation": "sensitivity",

  // textural
  "uneven_texture": "uneven_texture",
  "texture": "uneven_texture",
  "bumps": "uneven_texture",
  "uneven_skin_texture": "uneven_texture",

  // fine lines / aging
  "fine_lines": "fine_lines",
  "anti_aging": "fine_lines",
  "aging": "fine_lines",
  "wrinkles": "fine_lines",
  "early_aging": "fine_lines",
  "premature_aging": "fine_lines",

  // dullness
  "dullness": "dullness",
  "dull_skin": "dullness",
  "lack_of_glow": "dullness",
  "fatigue": "dullness",
  "tired_skin": "dullness",

  // hyperpigmentation
  "hyperpigmentation": "hyperpigmentation",
  "dark_spots": "hyperpigmentation",
  "post_acne_marks": "hyperpigmentation",
  "acne_marks": "hyperpigmentation",
  "acne_scars": "hyperpigmentation",
  "pigmentation": "hyperpigmentation",
  "melasma": "hyperpigmentation",
  "sun_spots": "hyperpigmentation",
  "pih": "hyperpigmentation",

  // uneven tone
  "uneven_tone": "uneven_tone",
  "uneven_skin_tone": "uneven_tone",
  "blotchiness": "uneven_tone",
  "mottling": "uneven_tone",

  // periorbital
  "dark_circles": "dark_circles",
  "under_eye_circles": "dark_circles",
  "periorbital_darkening": "dark_circles",
  "under_eye_darkness": "dark_circles",
  "under_eye_hollows": "dark_circles",

  "puffiness": "puffiness",
  "under_eye_bags": "puffiness",
  "eye_puffiness": "puffiness",
  "bags": "puffiness",

  // hair — scalp
  "dandruff": "dandruff",
  "flaky_scalp": "dandruff",
  "scalp_flakes": "dandruff",

  "oily_scalp": "oily_scalp",
  "greasy_scalp": "oily_scalp",
  "scalp_oiliness": "oily_scalp",
  "scalp_buildup": "oily_scalp",

  "dry_scalp": "dry_scalp",
  "scalp_dryness": "dry_scalp",

  "itchy_scalp": "itchy_scalp",
  "sensitive_scalp": "itchy_scalp",
  "scalp_irritation": "itchy_scalp",

  // hair — strand
  "hair_fall": "hair_fall",
  "hair_thinning": "hair_fall",
  "thinning": "hair_fall",
  "hair_loss": "hair_fall",
  "shedding": "hair_fall",
  "hair_growth": "hair_fall",

  "frizz": "frizz",
  "frizzy_hair": "frizz",
  "unruly_hair": "frizz",

  "damage": "damage",
  "damaged_hair": "damage",
  "chemical_damage": "damage",
  "heat_damage": "damage",
  "split_ends": "damage",
  "weakened_hair": "damage",

  "dullness_hair": "dullness_hair",
  "dull_hair": "dullness_hair",
  "lifeless_hair": "dullness_hair",

  // beard
  "patchiness": "patchiness",
  "patchy_beard": "patchiness",
  "beard_patches": "patchiness",
  "uneven_beard": "patchiness",

  "rough_texture": "rough_texture",
  "coarse_beard": "rough_texture",
  "beard_softness": "rough_texture",
  "beard_conditioning": "rough_texture",

  "itchiness_beard": "itchiness_beard",
  "itchy_beard": "itchiness_beard",
  "beard_itch": "itchiness_beard",
};

export function normalizeConcern(input: string | null | undefined): CanonicalConcern | null {
  if (!input || typeof input !== "string") return null;

  const key = input
    .toLowerCase()
    .replace(/[-\s]+/g, "_")
    .replace(/[^a-z_]/g, "")
    .trim();

  if (CANONICAL_SET.has(key)) return key as CanonicalConcern;
  if (CONCERN_ALIASES[key])   return CONCERN_ALIASES[key];

  return null;
}
