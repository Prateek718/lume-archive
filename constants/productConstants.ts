// ============================================================
// Lumé Product Database — scoring-based matching engine.
// Reads from ./products.json. Only new-schema entries are loaded;
// legacy-shape entries are skipped so the app degrades gracefully
// until products.json is swapped.
// ============================================================

import productsJson from './products.json';
import type {
  PreferredBrands,
  BudgetTier,
  MatchedProduct,
  BeardGoal,
} from '../types';

// ─── Schema ────────────────────────────────────────────────────────────────────

export type BrandTier =
  | 'indian_d2c'
  | 'indian_legacy'
  | 'indian_d2c_men'
  | 'indian_ayurvedic_premium'
  | 'indian_ayurvedic_mass'
  | 'international_available_in_india'
  | 'international_premium';

export type PriceTier = 'entry' | 'mid' | 'premium';

export interface Product {
  id:                     string;
  name:                   string;
  brand:                  string;
  brand_tier:             BrandTier;
  category:               string;
  price_inr:              number;
  price_tier:             PriceTier;
  actives:                string[];
  fragrance_free:         boolean;
  suitable_for_concerns:  string[];
  suitable_skin_types:    string[];
  climate_suitability:    string[];
  trusted_by_beginners:   boolean;
  is_ayurvedic:           boolean;
  retailer_urls:          { nykaa?: string; amazon?: string; brand_direct?: string };

  // Runtime-only flag, set by match helpers.
  isPreferredBrand?:      boolean;
}

// ─── Load and validate catalogue ───────────────────────────────────────────────
// Accept either `{ products: [...] }` or a raw array. Entries that do not match
// the new schema are silently skipped — this keeps the app running even if
// products.json still has the pre-migration shape.

function isNewSchemaProduct(raw: unknown): raw is Product {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.brand === 'string' &&
    typeof r.brand_tier === 'string' &&
    typeof r.category === 'string' &&
    typeof r.price_inr === 'number' &&
    (r.price_tier === 'entry' || r.price_tier === 'mid' || r.price_tier === 'premium') &&
    Array.isArray(r.actives) &&
    typeof r.fragrance_free === 'boolean' &&
    Array.isArray(r.suitable_for_concerns) &&
    Array.isArray(r.suitable_skin_types) &&
    Array.isArray(r.climate_suitability) &&
    typeof r.trusted_by_beginners === 'boolean' &&
    typeof r.is_ayurvedic === 'boolean' &&
    !!r.retailer_urls && typeof r.retailer_urls === 'object'
  );
}

const rawList: unknown[] = (() => {
  const root = productsJson as unknown;
  if (root && typeof root === 'object') {
    const arr = (root as { products?: unknown[] }).products;
    if (Array.isArray(arr)) return arr;
  }
  if (Array.isArray(root)) return root;
  return [];
})();

export const PRODUCTS: Product[] = rawList.filter(isNewSchemaProduct);

if (rawList.length > 0 && PRODUCTS.length === 0) {
  console.warn(
    `[productConstants] products.json has ${rawList.length} entries but none ` +
    `match the new schema. Scoring will return empty lists until swapped.`,
  );
}

// ─── Brand-tier heuristic buckets ──────────────────────────────────────────────
// Used by the budget inference helper. Case-sensitive exact matches against the
// names as they appear in the brand-picker screen.

const ENTRY_TIER_BRANDS = new Set<string>([
  'Minimalist', 'Himalaya', 'The Derma Co', 'Plum', 'Dot & Key',
  'Pilgrim', 'Foxtale', 'Mamaearth', 'WOW Skin Science', 'WOW',
  'Biotique', 'Good Vibes', 'Nivea', 'Garnier',
]);

const PREMIUM_TIER_BRANDS = new Set<string>([
  'CeraVe', 'Cetaphil', 'La Roche-Posay', "Paula's Choice", 'Bioderma',
  'Kama Ayurveda', 'Forest Essentials', 'Kérastase', 'Kerastase',
  'Laneige', 'NARS', 'Estée Lauder', 'Estee Lauder',
  'SK-II', 'La Mer', 'Shiseido', 'Sulwhasoo', 'Tatcha',
  'Charlotte Tilbury', 'Dior', 'Chanel', 'YSL Beauty',
  'Giorgio Armani', 'Lancôme', 'Clinique', 'Drunk Elephant',
  'Sunday Riley', 'SkinCeuticals', 'Fresh',
]);

const AYURVEDIC_BRANDS = new Set<string>([
  'Kama Ayurveda', 'Forest Essentials', 'Himalaya', 'Biotique',
  'Indulekha', 'Good Vibes', 'WOW Skin Science', 'WOW', 'Mamaearth',
]);

// ─── Canonical category enum ───────────────────────────────────────────────────
// The full set of category IDs the scoring engine and prompts agree on. Any
// free-text category coming from Gemini is normalised into one of these via
// normalizeCategory() before it reaches the scorer.

export const CANONICAL_CATEGORIES = [
  'face_cleanser',
  'moisturizer',
  'serum_niacinamide',
  'serum_hyaluronic_acid',
  'serum_vitamin_c',
  'serum_retinol',
  'serum_salicylic_acid',
  'serum_azelaic_acid',
  'serum_brightening',
  'serum_soothing',
  'spf_sunscreen',
  'toner',
  'eye_cream',
  'face_mask',
  'face_oil',
  'face_gel',
  'beard_wash',
  'beard_oil',
  'beard_balm',
  'hair_shampoo',
  'hair_conditioner',
  'hair_oil',
  'hair_serum',
  'hair_mask',
  'brow_pencil',
  'concealer',
  'foundation_base',
  'bb_cream',
] as const;

export type CategoryGroup = 'skin' | 'hair' | 'beard' | 'makeup';

const SKIN_CATEGORY_SET = new Set<string>([
  'face_cleanser', 'moisturizer',
  'serum_niacinamide', 'serum_hyaluronic_acid', 'serum_vitamin_c',
  'serum_retinol', 'serum_salicylic_acid', 'serum_azelaic_acid',
  'serum_brightening', 'serum_soothing',
  'spf_sunscreen', 'toner', 'eye_cream',
  'face_mask', 'face_oil', 'face_gel',
]);
const HAIR_CATEGORY_SET = new Set<string>([
  'hair_shampoo', 'hair_conditioner', 'hair_oil', 'hair_serum', 'hair_mask',
]);
const BEARD_CATEGORY_SET = new Set<string>([
  'beard_wash', 'beard_oil', 'beard_balm',
]);
const MAKEUP_CATEGORY_SET = new Set<string>([
  'brow_pencil', 'concealer', 'foundation_base', 'bb_cream',
]);

// Returns the brand list (sorted, unique) for a category group, derived
// directly from the catalogue. Used by my-brands.tsx so the brand picker
// stays in sync with whichever products the catalogue actually contains.
export function getBrandsForCategoryGroup(group: CategoryGroup): string[] {
  const set =
    group === 'skin'   ? SKIN_CATEGORY_SET   :
    group === 'hair'   ? HAIR_CATEGORY_SET   :
    group === 'beard'  ? BEARD_CATEGORY_SET  :
    MAKEUP_CATEGORY_SET;
  const brands = new Set<string>();
  for (const p of PRODUCTS) {
    if (set.has(p.category)) brands.add(p.brand);
  }
  return [...brands].sort();
}

// ─── Free-text → canonical category mapping ────────────────────────────────────
// Gemini sometimes emits free-text category names ("gel moisturiser",
// "ha serum") even when instructed not to. This map keeps the scorer fed with
// stable IDs regardless. Case-insensitive, space-insensitive matching.

const CATEGORY_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'moisturizer',          aliases: ['moisturizer', 'moisturiser', 'gel moisturiser', 'gel moisturizer', 'lightweight moisturiser', 'lightweight moisturizer', 'water cream', 'cream moisturiser', 'cream moisturizer', 'heavy moisturiser', 'heavy moisturizer', 'fragrance free moisturiser', 'fragrance-free moisturiser'] },
  { canonical: 'serum_niacinamide',    aliases: ['niacinamide serum', 'niacinamide 10%', 'niacinamide', 'pore serum'] },
  { canonical: 'serum_hyaluronic_acid', aliases: ['hyaluronic acid serum', 'ha serum', 'hyaluronic serum', 'hydration serum'] },
  { canonical: 'serum_vitamin_c',      aliases: ['vitamin c serum', 'vit c serum', 'brightening serum with vitamin c', 'vitamin c'] },
  { canonical: 'serum_retinol',        aliases: ['retinol serum', 'retinoid serum', 'retinol', 'retinoid'] },
  { canonical: 'serum_salicylic_acid', aliases: ['salicylic acid serum', 'bha serum', 'salicylic acid'] },
  { canonical: 'serum_azelaic_acid',   aliases: ['azelaic acid serum', 'azelaic acid'] },
  { canonical: 'serum_brightening',    aliases: ['brightening serum', 'alpha arbutin serum', 'pigmentation serum', 'alpha arbutin'] },
  { canonical: 'serum_soothing',       aliases: ['calming serum', 'soothing serum', 'centella serum', 'cica serum'] },
  { canonical: 'spf_sunscreen',        aliases: ['sunscreen', 'spf', 'sun cream', 'spf 50', 'spf 30', 'mineral sunscreen', 'sunscreen spf 50'] },
  { canonical: 'toner',                aliases: ['toner', 'exfoliating toner', 'bha toner', 'aha toner'] },
  { canonical: 'eye_cream',            aliases: ['eye cream', 'under eye cream', 'eye serum', 'undereye cream'] },
  { canonical: 'face_cleanser',        aliases: ['cleanser', 'face wash', 'gentle cleanser', 'face cleanser', 'gel cleanser', 'cream cleanser', 'salicylic cleanser', 'foaming cleanser'] },
  { canonical: 'face_mask',            aliases: ['face mask', 'face pack', 'clay mask', 'sheet mask'] },
  { canonical: 'face_oil',             aliases: ['face oil', 'facial oil'] },
  { canonical: 'face_gel',             aliases: ['face gel', 'aloe gel'] },
  { canonical: 'beard_wash',           aliases: ['beard wash', 'beard cleanser', 'beard shampoo'] },
  { canonical: 'beard_oil',            aliases: ['beard oil', 'growth oil', 'beard growth oil'] },
  { canonical: 'beard_balm',           aliases: ['beard balm', 'beard butter', 'beard wax'] },
  { canonical: 'hair_shampoo',         aliases: ['shampoo', 'hair shampoo', 'anti dandruff shampoo', 'anti-dandruff shampoo', 'clarifying shampoo'] },
  { canonical: 'hair_conditioner',     aliases: ['conditioner', 'hair conditioner', 'leave in conditioner', 'leave-in conditioner'] },
  { canonical: 'hair_oil',             aliases: ['hair oil', 'scalp oil'] },
  { canonical: 'hair_serum',           aliases: ['hair serum', 'scalp serum'] },
  { canonical: 'hair_mask',            aliases: ['hair mask', 'hair treatment', 'scalp treatment', 'scalp_treatment', 'hair_scalp_treatment'] },
  { canonical: 'brow_pencil',          aliases: ['brow pencil', 'brow gel', 'eyebrow pencil', 'eyebrow_pencil'] },
  { canonical: 'concealer',            aliases: ['concealer'] },
  { canonical: 'foundation_base',      aliases: ['foundation', 'mousse foundation', 'foundation_fair', 'foundation_medium', 'foundation_deep'] },
  { canonical: 'bb_cream',             aliases: ['bb cream', 'tinted moisturiser', 'tinted moisturizer', 'cc cream'] },
];

const ALIAS_LOOKUP = (() => {
  const map = new Map<string, string>();
  for (const { canonical, aliases } of CATEGORY_ALIASES) {
    map.set(canonical.toLowerCase(), canonical);
    for (const a of aliases) {
      map.set(a.toLowerCase().replace(/\s+/g, ' ').trim(), canonical);
    }
  }
  return map;
})();

const CANONICAL_CATEGORY_SET = new Set<string>(CANONICAL_CATEGORIES);

// Normalise free-text category descriptors to canonical IDs. Canonical IDs
// pass through silently. Free text falls through to fuzzy alias matching, and
// only unmatched inputs emit a warning — so Sprint 2+ prompts that already emit
// canonical IDs don't spam the logs.
export function normalizeCategory(input: string | null | undefined): string {
  if (!input) return '';
  if (CANONICAL_CATEGORY_SET.has(input)) return input;

  const key = input.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
  const hit = ALIAS_LOOKUP.get(key);
  if (hit) return hit;
  // Try the no-space variant too (e.g. "haserum")
  const collapsed = key.replace(/\s+/g, '');
  for (const [k, v] of ALIAS_LOOKUP) {
    if (k.replace(/\s+/g, '') === collapsed) return v;
  }
  const snake = key.replace(/\s+/g, '_');
  if (!CANONICAL_CATEGORY_SET.has(snake)) {
    console.warn(`[normalizeCategory] no match for "${input}" — falling back to "${snake}"`);
  }
  return snake;
}

// ─── Budget inference ──────────────────────────────────────────────────────────

// Takes a flat list of brand names and returns the likely budget band.
// - any premium brand → 'premium'
// - >50% entry-tier   → 'entry'
// - else              → 'mid'
export function inferBudgetFromBrandList(brandList: string[]): PriceTier {
  if (!brandList || brandList.length === 0) return 'mid';
  if (brandList.some(b => PREMIUM_TIER_BRANDS.has(b))) return 'premium';
  const entryCount = brandList.filter(b => ENTRY_TIER_BRANDS.has(b)).length;
  if (entryCount / brandList.length > 0.5) return 'entry';
  return 'mid';
}

// Legacy wrapper retained for callers that pass a PreferredBrands struct and
// expect the `BudgetTier` shape ('budget' | 'mid' | 'premium').
export function inferBudgetFromBrands(brands: PreferredBrands): BudgetTier {
  const all = [
    ...(brands?.skin   ?? []),
    ...(brands?.hair   ?? []),
    ...(brands?.makeup ?? []),
  ];
  const tier = inferBudgetFromBrandList(all);
  return tier === 'entry' ? 'budget' : tier;
}

// ─── Climate lookup ────────────────────────────────────────────────────────────
// Simple table mapping major Indian cities to climate categories used by
// the scoring function. Unknown cities fall back to 'temperate'.
export function deriveClimateFromCity(city: string | null | undefined): string {
  if (!city) return 'temperate';
  const key = city.trim().toLowerCase();

  const humid    = new Set(['mumbai', 'chennai', 'kolkata', 'goa', 'bangalore', 'bengaluru', 'cochin', 'kochi']);
  const tropical = new Set(['delhi', 'new delhi', 'jaipur', 'lucknow', 'hyderabad', 'ahmedabad', 'bhopal', 'nagpur', 'surat', 'pune']);
  const cold     = new Set(['shimla', 'darjeeling', 'manali', 'srinagar', 'dehradun', 'gangtok', 'leh']);

  if (humid.has(key))    return 'humid';
  if (tropical.has(key)) return 'tropical';
  if (cold.has(key))     return 'cold';
  return 'temperate';
}

// ─── Scoring engine ────────────────────────────────────────────────────────────

export interface UserProfileForScoring {
  skin_type?:         string;
  primary_concerns?:  string[];
  brand_preferences?: string[];
  climate?:           string;
  is_new_user?:       boolean;
}

type ScoredMatchedProduct = MatchedProduct & { score: number; why_this_one: string };

const TIER_RANK: Record<PriceTier, number> = { entry: 0, mid: 1, premium: 2 };

// Active-ingredient buckets used by beard-goal scoring boosts.
const BEARD_CONDITION_ACTIVES = new Set<string>(['argan_oil', 'jojoba_oil', 'sandalwood_oil', 'sweet_almond_oil', 'castor_oil', 'shea_butter', 'cocoa_butter']);
const BEARD_CATEGORIES_FOR_BOOST = new Set<string>(['beard_oil', 'beard_balm', 'beard_wash']);

export function getScoredProducts(params: {
  category:        string;
  target_concern?: string;
  userProfile:     UserProfileForScoring;
  beard_goal?:     BeardGoal;
}): ScoredMatchedProduct[] {
  const canonical        = normalizeCategory(params.category);
  const { userProfile }  = params;
  const targetConcern    = params.target_concern;
  const beardGoal        = params.beard_goal;
  const brandPrefs       = userProfile.brand_preferences ?? [];
  const inferredBudget   = inferBudgetFromBrandList(brandPrefs);
  const primaryConcerns  = userProfile.primary_concerns ?? [];
  const brandSet         = new Set(brandPrefs.map(b => b.toLowerCase()));
  const hasAyurvedicPref = brandPrefs.some(b => AYURVEDIC_BRANDS.has(b));

  const scored = PRODUCTS
    .filter(p => p.category === canonical)
    .map(product => {
      let score = 50;  // category gate passed

      if (brandSet.has(product.brand.toLowerCase())) score += 15;

      // Price tier match, symmetric
      const diff = TIER_RANK[product.price_tier] - TIER_RANK[inferredBudget];
      if (diff === 0)        score += 20;
      else if (diff === 1)   score -= 10;
      else if (diff === 2)   score -= 30;
      // diff < 0 (product cheaper than inferred budget) → 0 delta

      if (userProfile.is_new_user && product.trusted_by_beginners) score += 10;

      // Concern overlap (capped at +10)
      const overlap = primaryConcerns.filter(c => product.suitable_for_concerns.includes(c)).length;
      score += Math.min(overlap * 3, 10);

      // Direct target_concern match (Treat steps): heavy boost for products
      // explicitly suitable for the prescribed concern.
      if (targetConcern && product.suitable_for_concerns.includes(targetConcern)) {
        score += 15;
      }

      // Skin-type soft gate
      if (userProfile.skin_type) {
        const supportsType =
          product.suitable_skin_types.includes(userProfile.skin_type) ||
          product.suitable_skin_types.includes('all');
        if (!supportsType) score -= 20;
        else               score += 5;
      }

      if (userProfile.climate && product.climate_suitability.includes(userProfile.climate)) {
        score += 5;
      }

      // Beard-goal boosts — only meaningful for beard categories.
      // 'fuller' and 'longer' both emphasise conditioning to support healthy
      // existing growth. We do NOT boost growth actives unless the goal is
      // explicitly growth-focused — Lumé does not promise new follicle growth.
      if (beardGoal && BEARD_CATEGORIES_FOR_BOOST.has(product.category)) {
        if (beardGoal === 'fuller' || beardGoal === 'longer') {
          if (product.actives.some(a => BEARD_CONDITION_ACTIVES.has(a))) score += 10;
        }
      }

      // Ayurvedic products only surface to users with an ayurvedic brand preference.
      if (product.is_ayurvedic && !hasAyurvedicPref) score -= 15;

      return { product, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ product, score }) => {
    const matched = toMatchedProduct(product);
    const why_this_one = buildWhyThisOne(product, userProfile);
    return { ...matched, why_this_one, score };
  });
}

function toMatchedProduct(p: Product): MatchedProduct {
  return {
    id:             p.id,
    category:       p.category,
    name:           p.name,
    brand:          p.brand,
    attributes:     [],
    price_inr:      p.price_inr,
    price_tier:     p.price_tier,
    actives:        p.actives,
    retailer_urls:  p.retailer_urls,
    // Legacy shim — some callers and storage rows still read flat nykaa_url.
    nykaa_url:      p.retailer_urls?.nykaa,
  };
}

// Template-based rationale. Kept short — the UI truncates to ~2 lines.
function buildWhyThisOne(p: Product, profile: UserProfileForScoring): string {
  const tierLabel =
    p.price_tier === 'entry'   ? 'Entry-tier' :
    p.price_tier === 'premium' ? 'Premium'    :
    'Mid-tier';

  const primaryActive = p.actives[0];
  const ingredientCue = primaryActive ? ` ${primaryActive}` : '';

  const skinCue =
    profile.skin_type &&
    (p.suitable_skin_types.includes(profile.skin_type) || p.suitable_skin_types.includes('all'))
      ? ` for ${profile.skin_type} skin`
      : '';

  const concernMatch = (profile.primary_concerns ?? [])
    .find(c => p.suitable_for_concerns.includes(c));
  const concernCue = concernMatch ? `, targets ${concernMatch.replace(/_/g, ' ')}` : '';

  const fragranceCue = p.fragrance_free ? '. Fragrance-free.' : '.';

  return `${tierLabel} pick${ingredientCue}${skinCue}${concernCue}${fragranceCue}`;
}

// ─── Nykaa URL helper ──────────────────────────────────────────────────────────
// Handles both new-schema (retailer_urls.nykaa) and legacy flat nykaa_url.
export function getProductNykaaUrl(
  p: Product | MatchedProduct | null | undefined,
): string | null {
  if (!p) return null;
  const direct = (p as { retailer_urls?: { nykaa?: string } }).retailer_urls?.nykaa;
  if (direct) return direct;
  const legacy = (p as { nykaa_url?: string }).nykaa_url;
  return legacy ?? null;
}

// ─── Backward-compat wrappers ─────────────────────────────────────────────────
// These preserve the old call sites (scan service, detail screens). Under the
// hood they all route through getScoredProducts.

export function getProductsForBrands(params: {
  category:            string;
  preferredBrands:     PreferredBrands | string[];
  fallbackTier?:       BudgetTier;
  gender?:             'all' | 'men' | 'women';
  requiredAttributes?: string[];
  categoryType?:       'skin' | 'hair' | 'makeup' | 'beard';
  limit?:              number;
}): Product[] {
  const { category, limit = 1 } = params;

  const brandList: string[] = Array.isArray(params.preferredBrands)
    ? params.preferredBrands
    : (() => {
        const pb = params.preferredBrands;
        const ct = params.categoryType;
        if (ct === 'skin')   return pb.skin   ?? [];
        if (ct === 'hair')   return pb.hair   ?? [];
        if (ct === 'makeup') return pb.makeup ?? [];
        if (ct === 'beard')  return pb.skin   ?? [];
        return [
          ...(pb.skin   ?? []),
          ...(pb.hair   ?? []),
          ...(pb.makeup ?? []),
        ];
      })();

  const scored = getScoredProducts({
    category,
    userProfile: { brand_preferences: brandList },
  });

  return scored
    .slice(0, limit)
    .map(sp => PRODUCTS.find(p => p.id === sp.id))
    .filter((p): p is Product => !!p)
    .map(p => ({
      ...p,
      isPreferredBrand: brandList.some(
        b => p.brand.toLowerCase() === b.toLowerCase(),
      ),
    }));
}

export function getProductsForProfile(params: {
  categories:      {
    category:        string;
    attributes:      string[];
    categoryType:    'skin' | 'hair' | 'makeup' | 'beard';
    target_concern?: string;
  }[];
  preferredBrands: PreferredBrands | string[];
  gender:          'all' | 'men' | 'women';
  budget:          BudgetTier;
  skinType?:       string;
  concerns?:       string[];
  city?:           string;
  isNewUser?:      boolean;
  beardGoal?:      BeardGoal;
}): Record<string, MatchedProduct[]> {
  const { categories, preferredBrands } = params;

  const brandList: string[] = Array.isArray(preferredBrands)
    ? preferredBrands
    : [
        ...(preferredBrands.skin   ?? []),
        ...(preferredBrands.hair   ?? []),
        ...(preferredBrands.makeup ?? []),
      ];

  const climate = params.city ? deriveClimateFromCity(params.city) : 'temperate';
  const results: Record<string, MatchedProduct[]> = {};

  for (const { category, target_concern } of categories) {
    const canonical = normalizeCategory(category);
    const scored = getScoredProducts({
      category:        canonical,
      target_concern,
      beard_goal:      params.beardGoal,
      userProfile: {
        skin_type:         params.skinType,
        primary_concerns:  params.concerns,
        brand_preferences: brandList,
        climate,
        is_new_user:       params.isNewUser,
      },
    });
    if (scored.length > 0) results[canonical] = scored;
  }
  return results;
}

/**
 * @deprecated Prefer `getScoredProducts` (single-category) or
 * `getProductsForProfile` (batch). Kept as an alias so existing callers
 * don't break — under the hood it routes through the scoring engine.
 */
export const getMatchedProducts = getProductsForProfile;
