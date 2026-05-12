// Gate 7 — measure realistic worst-case payload sizes for the five new
// Phase XIII Edge Functions plus gemini-vision (calibration). Edge runtime
// caps request bodies at 6 MB. We construct payloads from real type bounds
// in the codebase (CANONICAL_CONCERNS, MatchedProduct, HairProfile,
// MakeupSwatch, Pick<Scan, ...>) and report the serialized JSON byte size
// for each.
//
// Run: npx tsx scripts/gate7-measure.ts

const SIX_MB = 6 * 1024 * 1024;

const SKIN_CONCERNS_CANONICAL = [
  'acne', 'oiliness', 'dehydration', 'dryness', 'sensitivity',
  'uneven_texture', 'fine_lines', 'dullness',
  'hyperpigmentation', 'uneven_tone', 'dark_circles', 'puffiness',
] as const;

const ZONES = ['forehead', 'left_cheek', 'right_cheek', 'nose', 'chin', 't_zone'];
const SKIN_CATEGORIES = [
  'face_cleanser', 'moisturizer', 'spf_sunscreen',
  'serum_niacinamide', 'serum_hyaluronic_acid', 'serum_vitamin_c',
  'serum_retinol', 'serum_salicylic_acid', 'serum_azelaic_acid',
  'serum_brightening', 'serum_soothing', 'toner', 'eye_cream',
  'face_mask', 'face_oil',
];
const HAIR_CATEGORIES = [
  'hair_shampoo', 'hair_conditioner', 'hair_mask',
  'hair_serum', 'hair_oil', 'scalp_treatment',
  'leave_in_conditioner', 'hair_styling',
];

// ── Sub-shape builders ──────────────────────────────────────────────────────

function makeSkinConcernsDetailed() {
  return SKIN_CONCERNS_CANONICAL.map(concern => ({
    concern,
    severity: 'significant' as const,
    zones: ZONES.slice(),
    notes: 'Pronounced presence across the t-zone and lower face with active inflammation, visible enlarged pores around the nose and chin, and post-inflammatory pigment along the jawline that should respond to consistent care over 8-12 weeks.',
    display_label: 'Pronounced presence across the lower face',
  }));
}

function makeMatchedProduct(category: string, index: number) {
  return {
    id: `brand_${category}_${index}_long_product_identifier`,
    category,
    name: `Hydrating Resurfacing ${category.replace(/_/g, ' ')} Edition`,
    brand: 'Some Indian D2C Brand',
    attributes: ['fragrance_free', 'non_comedogenic', 'dermatologist_tested', 'paraben_free', 'sulfate_free'],
    price_inr: 1499,
    price_tier: 'premium',
    actives: ['niacinamide', 'hyaluronic_acid', 'ceramides', 'salicylic_acid', 'panthenol'],
    why_this_one: 'Targets the moderate t-zone oiliness and post-acne marks while staying gentle enough for daily use on the cheeks where the barrier reads thinner. Niacinamide at 5% regulates sebum without stripping; ceramides reinforce the barrier overnight; non-comedogenic formula avoids re-triggering breakouts around the chin and jawline.',
    retailer_urls: {
      nykaa: 'https://www.nykaa.com/some-very-long-brand-and-product-slug-here-with-utm-tracking',
      amazon: 'https://www.amazon.in/s?k=some+brand+product+search+terms+with+modifiers',
      brand_direct: 'https://example.co.in/products/some-brand-product-direct-link-page',
    },
    suitable_for_concerns: ['oiliness', 'acne', 'hyperpigmentation'],
    suitable_skin_types: ['oily', 'combination', 'normal'],
    fragrance_free: true,
    primary_concern_target: 'oiliness',
  };
}

function makeGeminiAnalysis() {
  return {
    skin_type: 'combination',
    skin_concerns: SKIN_CONCERNS_CANONICAL.slice(),
    skin_concerns_detailed: makeSkinConcernsDetailed(),
    fitzpatrick_scale: 4,
    skin_undertone: 'warm',
    age_range: '25-34',
    beard_density: 'medium',
    beard_condition: 'somewhat_dry',
    beard_coverage_zones: ['chin', 'jawline', 'upper_lip', 'cheeks'],
    face_shape: 'oval',
    visible_traits: [
      'enlarged pores t-zone',
      'mild redness around nostrils',
      'post-acne marks left cheek',
      'fine lines beginning at outer eye',
      'uneven tone across forehead',
    ],
    confidence: 0.82,
    observation_note: 'Skin reads combination with the t-zone running oilier than the cheeks; mild dehydration shows up as tightness across the forehead despite the oil. Post-acne marks along the jawline are settling but visible. The barrier looks generally intact but mildly compromised around the nostrils.',
  };
}

// ── Payload builders (one per edge function) ────────────────────────────────

// gemini-vision: dominated by the base64 image. A ~110 KB compressed JPEG
// becomes ~(110 * 4/3) ≈ 147 KB as a base64 string.
function buildVisionPayload() {
  const base64Len = Math.ceil(110 * 1024 * 4 / 3);
  return {
    imageBase64: 'A'.repeat(base64Len),
    mimeType: 'image/jpeg',
    gender: 'man',
    scanId: '00000000-0000-0000-0000-000000000000',
  };
}

function buildSkinRecsPayload() {
  return {
    analysis: makeGeminiAnalysis(),
    matchedProducts: SKIN_CATEGORIES.map((c, i) => makeMatchedProduct(c, i)),
    ageRange: '25-34',
    scanId: '00000000-0000-0000-0000-000000000000',
  };
}

function buildBeardRecsPayload() {
  return {
    analysis: makeGeminiAnalysis(),
    beardGoal: 'fuller',
    scanId: '00000000-0000-0000-0000-000000000000',
  };
}

function buildMakeupRecsPayload() {
  return {
    analysis: makeGeminiAnalysis(),
    scanId: '00000000-0000-0000-0000-000000000000',
  };
}

function buildHairRecsPayload() {
  return {
    profile: {
      hair_length: 'medium',
      scalp_type: 'oily',
      scalp_concern: 'dandruff',
      sun_exposure: 'high',
      primary_concern: ['hair_fall', 'frizz', 'damage', 'dullness_hair'],
      texture: 'wavy',
      wash_frequency: 'every_2_3_days',
      oils_regularly: true,
      chemically_treated: 'coloured',
    },
    faceShape: 'oval',
    gender: 'woman',
    city: 'Mumbai',
    budget: 'premium',
    matchedHairProducts: HAIR_CATEGORIES.map((c, i) => makeMatchedProduct(c, i)),
    scanId: '00000000-0000-0000-0000-000000000000',
  };
}

function buildDeltaCommentaryPayload() {
  const detailed = makeSkinConcernsDetailed();
  return {
    ctx: {
      scan_number: 4,
      days_between: 28,
      previous_concerns: SKIN_CONCERNS_CANONICAL.slice(),
      current_concerns: SKIN_CONCERNS_CANONICAL.slice(),
      previous_concerns_detailed: detailed,
      current_concerns_detailed: detailed,
      concerns_improved: ['acne', 'oiliness', 'dullness'],
      concerns_persistent: ['hyperpigmentation', 'uneven_tone', 'dark_circles'],
      concerns_new: ['fine_lines', 'puffiness'],
      concerns_worsened: ['dehydration', 'dryness'],
    },
    scanId: '00000000-0000-0000-0000-000000000000',
  };
}

// ── Measurement ──────────────────────────────────────────────────────────────

function measure(label: string, payload: unknown) {
  const json = JSON.stringify(payload);
  const bytes = Buffer.byteLength(json, 'utf8');
  const pct = (bytes / SIX_MB) * 100;
  return { label, bytes, pct };
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

const results = [
  measure('gemini-vision (calibration)', buildVisionPayload()),
  measure('gemini-skin-recs',            buildSkinRecsPayload()),
  measure('gemini-beard-recs',           buildBeardRecsPayload()),
  measure('gemini-makeup-recs',          buildMakeupRecsPayload()),
  measure('gemini-hair-recs',            buildHairRecsPayload()),
  measure('gemini-delta-commentary',     buildDeltaCommentaryPayload()),
];

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));

console.log('');
console.log('Phase XIII Gate 7 — Edge Function payload sizing');
console.log('6 MB limit = ' + SIX_MB.toLocaleString() + ' bytes');
console.log('─'.repeat(72));
for (const r of results) {
  const line = `${pad(r.label + ':', 34)} ${pad(r.bytes.toLocaleString() + ' B', 14)} (${pad(fmtBytes(r.bytes), 9)} / ${r.pct.toFixed(2)}% of 6 MB)`;
  console.log(line);
}

const largest  = results.reduce((a, b) => (b.bytes > a.bytes ? b : a));
const headroom = SIX_MB - largest.bytes;
const headPct  = (headroom / SIX_MB) * 100;

console.log('─'.repeat(72));
console.log(`Largest:  ${largest.label} at ${largest.bytes.toLocaleString()} B (${fmtBytes(largest.bytes)}).`);
console.log(`Headroom: ${headroom.toLocaleString()} B (${fmtBytes(headroom)} / ${headPct.toFixed(2)}% of 6 MB).`);

let verdict: 'PASS' | 'NEEDS-REVIEW' | 'FAIL';
if      (largest.pct < 50) verdict = 'PASS';
else if (largest.pct < 90) verdict = 'NEEDS-REVIEW';
else                        verdict = 'FAIL';

console.log(`Verdict:  ${verdict}  (PASS <50%, NEEDS-REVIEW 50-90%, FAIL >90%).`);
console.log('');
