// Brand archetype taxonomy for the My brands screen. Groups the 58 brands in
// constants/products.json into 7 archetypes, each tied to one or more care
// categories. The filter helper takes the user's care_categories and returns
// only the archetype groups (and brands inside them) that the user can act on.

import {
  getBrandsForCategoryGroup,
  type CategoryGroup,
} from '../constants/productConstants';

// ─── Archetypes ────────────────────────────────────────────────────────────

export const BRAND_ARCHETYPES: Record<string, string[]> = {
  'Indian D2C': [
    'Minimalist', 'The Derma Co', 'Plum', 'Foxtale', 'Dot & Key',
    'Deconstruct', 'Pilgrim', 'Aqualogica', "Re'equil",
  ],
  'Indian Heritage': [
    'Forest Essentials', 'Kama Ayurveda', 'Biotique', 'Khadi Natural',
    'Soultree', 'Indulekha', 'Dabur', 'Himalaya', 'Lotus', 'Parachute',
    'Arata',
  ],
  'Mass-market Indian': [
    'Mamaearth', 'WOW Skin Science', 'Sugar', "Pond's",
  ],
  'Beard-focused': [
    'Beardo', 'The Man Company', 'Bombay Shaving Company', 'Ustraa',
    'Murdock London', 'Proraso',
  ],
  'Hair-specialist': [
    'Olaplex', 'Kérastase', "L'Oréal Professionnel", 'Wella Professionals',
    'Livon', 'Streax', 'Pantene', 'Head & Shoulders', 'Nizoral', 'Dove',
  ],
  'International (skin)': [
    'Cetaphil', 'CeraVe', 'La Roche-Posay', 'Bioderma', 'Sebamed',
    'Neutrogena', 'COSRX', 'Anua', 'Laneige', "Paula's Choice",
    'The Ordinary', 'Thayers',
  ],
  'Makeup': [
    'NARS', 'Anastasia Beverly Hills', 'Estée Lauder', 'Maybelline',
    "L'Oréal Paris", 'Lakmé',
  ],
};

export const ARCHETYPE_TO_CARE: Record<string, CategoryGroup[]> = {
  'Indian D2C':           ['skin', 'hair'],
  'Indian Heritage':      ['skin', 'hair'],
  'Mass-market Indian':   ['skin', 'hair'],
  'Beard-focused':        ['beard'],
  'Hair-specialist':      ['hair'],
  'International (skin)': ['skin'],
  'Makeup':               ['makeup'],
};

// Stable display order for the section list.
export const ARCHETYPE_ORDER: string[] = [
  'Indian D2C',
  'Indian Heritage',
  'Mass-market Indian',
  'Beard-focused',
  'Hair-specialist',
  'International (skin)',
  'Makeup',
];

// ─── Filter ────────────────────────────────────────────────────────────────

export interface ArchetypeGroup {
  archetype: string;
  brands:    string[];
}

// Returns archetype groups visible to a user with the given care categories.
// Two filters apply: (1) the archetype must serve at least one of the user's
// care categories, and (2) each brand inside must appear in the catalogue for
// at least one of those served categories. Brands inside each group come back
// alphabetised; groups follow ARCHETYPE_ORDER.
export function getFilteredBrandsByArchetype(
  careCategories: CategoryGroup[],
): ArchetypeGroup[] {
  if (!careCategories || careCategories.length === 0) return [];
  const careSet = new Set<CategoryGroup>(careCategories);

  // Build per-care-category brand sets once, derived from the catalogue.
  const brandsByGroup: Record<CategoryGroup, Set<string>> = {
    skin:   new Set(getBrandsForCategoryGroup('skin')),
    hair:   new Set(getBrandsForCategoryGroup('hair')),
    beard:  new Set(getBrandsForCategoryGroup('beard')),
    makeup: new Set(getBrandsForCategoryGroup('makeup')),
  };

  const groups: ArchetypeGroup[] = [];
  for (const archetype of ARCHETYPE_ORDER) {
    const archCares = ARCHETYPE_TO_CARE[archetype] ?? [];
    const overlap = archCares.filter(c => careSet.has(c));
    if (overlap.length === 0) continue;

    // Union of catalogue brands across the user's served categories for this
    // archetype.
    const catalogueBrands = new Set<string>();
    for (const c of overlap) {
      for (const b of brandsByGroup[c]) catalogueBrands.add(b);
    }

    const brandList = (BRAND_ARCHETYPES[archetype] ?? [])
      .filter(b => catalogueBrands.has(b))
      .sort((a, b) => a.localeCompare(b));

    if (brandList.length > 0) groups.push({ archetype, brands: brandList });
  }
  return groups;
}
