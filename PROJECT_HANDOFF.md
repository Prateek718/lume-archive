# Lumé — Project Handoff

## What the app is
Lumé is a React Native + Expo app that analyses a user's face via AI (Gemini vision) and delivers personalised grooming recommendations. V1 is customer-only — no stylist profiles, bookings, or payments.

**Stack:** React Native + Expo (managed), TypeScript strict, Supabase (auth/db), Expo Router, Gemini 2.5 Flash-Lite (vision), Gemini 2.5 Flash (text recs), Cloudflare R2 (image storage).

---

## Design system (light, warm theme)

| Token | Value | Usage |
|---|---|---|
| `Colors.background` | `#F7F4EF` | Screen backgrounds |
| `Colors.surface` | `#EDE6DC` | Input / nested backgrounds |
| `Colors.card` | `#FFFFFF` | Card backgrounds |
| `Colors.text` | `#2C2420` | Primary text |
| `Colors.text2` | `#8A7E76` | Secondary text |
| `Colors.text3` | `#B8AEA8` | Tertiary / placeholder |
| `Colors.accent` | `#C17B5C` | CTAs, highlights, active tab |
| `Colors.green` | `#7A9E7E` | Healthy / positive pills |
| `Colors.border` | `#E8E0D5` | Card borders, dividers |

Typography: Georgia serif for titles, system sans for body. All screens light theme; StatusBar style `dark`.

---

## Scan architecture (two-phase)

**Phase 1** (~18s): Gemini vision analysis only. Returns `PartialScan` (recommendations: null). `ObservationScreen` shown immediately after phase 1.

**Phase 2** (~32s): Runs in background after phase 1. Calls `getRecommendationsFromGemini` with full analysis + matched products + ageRange. Writes complete `Scan` record to Supabase.

### Key functions
- `runScanPhase1(userId, imageUri, gender)` → `PartialScan`
- `runScanPhase2(userId, partialScan, gender, matchedProducts, ageRange)` → `Scan`
- `runScan(userId, imageUri, gender)` → `Scan` (thin backwards-compat wrapper)
- `refreshRecommendations(scanId, gender)` → `Scan` (re-runs phase 2 from existing partial scan)

---

## AI prompt architecture (`lib/gemini.ts`)

### `buildRecsPrompt(gender, analysis, matchedProducts, ageRange)`
The core prompt builder for grooming recommendations. Key rules baked in:

**SKIN ROUTINE RULES**
- Foundation: Cleanser (AM+PM) + Moisturiser (AM+PM) — always, even oily skin
- Treatments: SPF in AM only; Retinol/AHA in PM only
- Serum limit: max 1 serum per routine. Priority for oily/acne: niacinamide > vitamin C. Priority for dry/sensitive: hyaluronic acid > vitamin C.
- Toner: only if oily or acne-prone AND no niacinamide serum being added
- Step count: min 2, max 4 per time-of-day

**BEARD RULES** (men only)
- Beard wash + beard oil always recommended if any beard density
- Beard balm only if medium/heavy density

**MAKEUP RULES** (women only)
- Techniques not products — specific to face shape + features detected

### `getRecommendationsFromGemini(gender, analysis, matchedProducts, ageRange)`
Calls Gemini with the built prompt, parses JSON response.

### `analyseWithGemini(imageUrl, gender)`
Calls Gemini vision. Logs timing per phase.

---

## Types (`types/index.ts`)

```ts
// Partial scan — after phase 1, before recommendations
interface PartialScan {
  id: string;
  user_id: string;
  face_shape: string;
  skin_type: string;
  skin_concerns: string[];
  // ... all vision fields ...
  score_hair: number;
  score_skin: number;
  score_beard: number | null;
  score_makeup: number | null;
  score_overall: number;
  tier_label: string;
  recommendations: null;  // <-- always null for PartialScan
  created_at: string;
}

// Full scan — after phase 2
interface Scan extends Omit<PartialScan, 'recommendations'> {
  recommendations: Recommendations;
}

// Routine step (skin, beard, makeup)
interface RoutineStep {
  label: string;    // e.g. "Cleanse"
  product: string;  // e.g. "Gentle foaming cleanser"
  order: number;
  // NOTE: no `level` field — hair routines have level, others don't
}

// Hair routine step (different — has level)
interface HairRoutineStep {
  label: string;
  product: string;
  order: number;
  level: string;    // 'basic' | 'advanced'
}
```

**Removed:** `NotNeededItem` interface and all `not_needed?` fields from `SkinRecommendation`, `BeardRecommendation`, `MakeupRecommendation`, `HairRecommendations`.

---

## Screen inventory

### `app/(auth)/`
- `splash.tsx` — animated splash, navigates to login
- `login.tsx` — phone + Google sign-in
- `otp.tsx` — OTP verification
- `onboarding.tsx` — name, gender, city
- `signup.tsx` — account creation

### `app/(tabs)/`
- `scan.tsx` — scan home + camera + ObservationScreen + results reveal
- `discover.tsx` — map + nearby salons
- `profile.tsx` — user profile + settings
- `routine.tsx` — routine tracker (new, untracked)

### `app/`
- `recommendations.tsx` — category cards (Hair, Skin, Beard/Makeup) with score strip
- `skin-detail.tsx` — tabs: Analysis | Routine (Products tab removed)
- `hair-detail.tsx` — hair routine + product recommendations
- `beard-detail.tsx` — beard routine + products
- `makeup-detail.tsx` — makeup techniques + products
- `hair-profile.tsx` — hair profile setup (new, untracked)

### `app/salons/`
- `nearby.tsx`, `salon-detail.tsx`, `salon-profile-create.tsx`, `rate-salon.tsx`, `rate-stylist.tsx`

### `app/profile/`
- `my-brands.tsx`, `routine-level.tsx`

---

## Key components

### `components/ProductPickerSheet.tsx`
Bottom sheet modal for browsing matched products per routine step.

Props:
```ts
interface ProductPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  stepName: string;       // e.g. "Cleanse"
  categoryName: string;   // e.g. "face_cleanser"
  reason: string;         // why this product type was recommended
  products: MatchedProduct[];
  nykaaUrl?: (product: MatchedProduct) => string;  // optional custom URL builder
}
```

Has a `CATEGORY_LABELS` map (27 entries) converting raw category keys to display names. Featured products (`is_featured: true`) get a gold-bordered card with "Featured" badge.

---

## `skin-detail.tsx` — current state

- **Tabs:** `'analysis' | 'routine'` only. Products tab was removed.
- **Default tab:** `'routine'`
- **StepRow component:**
  ```tsx
  function StepRow({ n, label, product, productCount, onPress }) {
    // Shows: [circle n] [label — product]
    // If onPress + productCount > 0: shows "X products matched to your skin" subtitle
    // Wraps in TouchableOpacity if onPress provided
  }
  ```
- **"YOUR SKIN NEEDS" card:** Uses `Colors.card` background + border, no italic, strips leading/trailing quotes from advice text.
- Routine steps mapped via `getCategoryForStep(label)` → category key → `productMap[category]` for count.

---

## `recommendations.tsx` — current state

- `skinStepCount`: unique product count across AM+PM (using Set on `step.product`)
- Skin meta: `"${skinStepCount} products · AM + PM routine"`
- Beard meta: `"${beardProductCount} products · Daily"`
- Hair meta: `"${hairRecs?.routine?.length ?? 0} steps · ${hairRecs?.products?.length ?? 0} products"` (or "Set up hair profile")
- Concern pill text: words capitalised, underscores replaced with spaces
- Positive tags (green pill): `['normal', 'healthy', 'well_groomed', 'balanced', 'Bald / Shaved']`

---

## Constants

### `constants/products.json`
Master product catalogue. Each entry has: `name`, `brand`, `category`, `is_featured`, `why_good`, `nykaa_url` (optional).

### `constants/productConstants.ts`
Category arrays: `SKIN_CATS`, `BEARD_CATS`, `MAKEUP_CATS`, `HAIR_CATS`.
Helper: `getMatchedProducts(categories, brands)` → `MatchedProduct[]`.

### `constants/theme.ts`
All design tokens. Single source of truth. Import as `{ Colors, Typography, Spacing }`.

---

## Supabase tables (relevant columns)

**`users`:** `id`, `display_name`, `gender`, `city`, `age_range`, `hair_profile` (jsonb), `hair_recommendations` (jsonb), `push_token`, `notification_reminders`, `notification_routine`, `last_scan_at`, `onboarding_complete`

**`scans`:** `id`, `user_id`, `face_shape`, `skin_type`, `skin_concerns`, `hair_texture`, `hair_condition`, `beard_density`, `brow_shape`, `undereye`, `score_hair`, `score_skin`, `score_beard`, `score_makeup`, `score_overall`, `tier_label`, `recommendations` (jsonb), `created_at`

---

## Open items / known state

- `app/(tabs)/routine.tsx` — new file, not yet committed
- `app/hair-profile.tsx` — new file, not yet committed  
- `services/notificationService.ts` — new file, not yet committed
- `app/(tabs)/history.tsx` — deleted
- `constants/tiers.ts` — deleted
- `lib/claude.ts` — deleted (Claude Haiku replaced by Gemini for text recs)

---

## Env vars needed

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_GEMINI_API_KEY
EXPO_PUBLIC_R2_ACCOUNT_ID
EXPO_PUBLIC_R2_ACCESS_KEY
EXPO_PUBLIC_R2_BUCKET=lume-scans
```
