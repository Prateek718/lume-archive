// ============================================================
// Lumé Canonical Actives
// ----------------------------------------------------------------
// Deduped, normalized active ingredient vocabulary.
// Used for scoring boosts, rationale generation, and search.
// ============================================================

// Canonical form for each active. When two existing catalog values
// collapse to one (ceramide + ceramides → ceramides), the canonical
// version is what new products should use.
export const CANONICAL_ACTIVES = [
  // Actives - skin therapeutic
  'niacinamide',
  'salicylic_acid',
  'retinol',
  'retinal', // retinaldehyde — distinct from retinol, different potency
  'hydroxypinacolone_retinoate',
  'azelaic_acid',
  'glycolic_acid',
  'lactic_acid',
  'lactobionic_acid',
  'mandelic_acid',
  'kojic_acid',
  'alpha_arbutin',
  'tranexamic_acid',
  'vitamin_c',
  'ethyl_ascorbic_acid',
  'ferulic_acid',
  'bha',
  'pha',
  'gluconolactone',

  // Hydrators & humectants
  'hyaluronic_acid',
  'glycerin',
  'squalane',
  'panthenol',
  'pro_vitamin_b5',
  'amino_acids',

  // Barrier & calming
  'ceramides', // canonical: plural form. Deprecate "ceramide" singular.
  'centella_asiatica',
  'madecassoside',
  'allantoin',
  'colloidal_oat',
  'bisabolol',
  'licorice_root',
  'sepicalm',
  'zinc_pca',
  'zinc_oxide',

  // Peptides & growth
  'peptides',
  'matrixyl',
  'copper_peptides',
  'redensyl',
  'procapil',
  'anagain',
  'baicapil',
  'caffeine',
  'biotin',

  // UV filters
  'titanium_dioxide',
  'avobenzone',
  'octocrylene',
  'tinosorb_s',
  'tinosorb_m',
  'mexoryl_sx',
  'mexoryl_xl',
  'uvinul_a_plus',

  // Antioxidants
  'vitamin_e',
  'green_tea_extract',
  'grape_seed_extract',
  'resveratrol',
  'antioxidants',

  // Oils & butters
  'argan_oil',
  'jojoba_oil',
  'sweet_almond_oil',
  'marula_oil',
  'rosehip_oil',
  'squalane_oil',
  'shea_butter',
  'kokum_butter',
  'cocoa_butter',
  'castor_oil',
  'coconut_oil',
  'sesame_oil',

  // Ayurvedic / botanical
  'bhringraj',
  'brahmi',
  'amla',             // canonical. Deprecate "amla_extract"
  'kumkumadi_tailam',
  'saffron',
  'turmeric',
  'kokum',
  'manjishtha',
  'neem',             // canonical. Deprecate "neem_extract"
  'tulsi',
  'hibiscus',
  'indigo',
  'kesar',

  // Hair-specific
  'sandalwood_oil',   // canonical. Deprecate "sandalwood" (oil is the product form)
  'cedarwood_oil',
  'onion_oil',        // canonical. Deprecate "onion_extract"
  'rosemary_oil',
  'tea_tree_oil',
  'peppermint_oil',
  'plant_keratin',
  'keratin_actives',

  // Scalp-specific therapeutics
  'piroctone_olamine',
  'ketoconazole',
  'salicylic_acid_scalp', // distinct tag for scalp-targeted salicylic
  'zinc_pyrithione',
  'selenium_sulfide',

  // Miscellaneous but useful
  'witch_hazel',
  'rose_water',
  'aloe_vera',
  'cucumber_extract',
  'chamomile_extract',
  'green_coffee',
] as const;

export type CanonicalActive = typeof CANONICAL_ACTIVES[number];

const CANONICAL_ACTIVES_SET = new Set<string>(CANONICAL_ACTIVES);

// Map old catalog variants → canonical form
const ACTIVE_ALIASES: Record<string, CanonicalActive> = {
  'ceramide': 'ceramides',
  'amla_extract': 'amla',
  'onion_extract': 'onion_oil',
  'sandalwood': 'sandalwood_oil',
  'neem_extract': 'neem',
  'vitamin_b5': 'panthenol', // synonyms
};

/**
 * Normalize an active name. Returns canonical form or null if unrecognized.
 * Canonical values pass through. Aliased values map. Unknown values log + return null.
 */
export function normalizeActive(input: string | null | undefined): CanonicalActive | null {
  if (!input || typeof input !== 'string') return null;
  const key = input.toLowerCase().replace(/[-\s]+/g, '_').trim();
  if (CANONICAL_ACTIVES_SET.has(key)) return key as CanonicalActive;
  if (ACTIVE_ALIASES[key]) return ACTIVE_ALIASES[key];
  return null;
}

export function normalizeActives(inputs: (string | null | undefined)[]): CanonicalActive[] {
  const out = new Set<CanonicalActive>();
  for (const raw of inputs) {
    const n = normalizeActive(raw);
    if (n) out.add(n);
    else if (raw) console.warn(`[normalizeActive] unmatched: "${raw}"`);
  }
  return [...out];
}