# Lumé — Codebase ⇄ Database Map (Phase XI Audit)

Read-only audit. State only. No fixes proposed.

Generated: 2026-05-06
Scope: `C:\Projects\lume_v1`
Migration set: `supabase/migrations/*.sql` (13 files)
Inputs: every `supabase.from('…')` / `.rpc('…')` touchpoint, all migrations, `types/index.ts`, all `services/*`, all `lib/*` that import supabase, `hooks/useScan.tsx`, every `app/**/*.tsx` that imports supabase, plus historical `supabase-setup.sql` and `supabase-salons.sql`.

---

## 1. Supabase client touchpoints (grouped by table)

Every `supabase.from('<table>')` and `supabase.rpc('<fn>')` call in the codebase. `R` = read, `W` = write (insert/update/upsert/delete). Format: `path:line  R|W  brief`.

### Table: `users`

| File | Line | R/W | Notes |
|---|---|---|---|
| `app/_layout.tsx` | 92 | R | onboarding_complete |
| `app/recommendations.tsx` | 254 | R | care_categories, hair_profile, hair_recommendations, makeup_recommendations |
| `app/skin-detail.tsx` | 227 | R | hair_recommendations + scan recs context |
| `app/hair-detail.tsx` | 225 | R | hair_recommendations |
| `app/beard-detail.tsx` | 171 | R | hair_recommendations (shared loader) |
| `app/makeup-detail.tsx` | 97 | R | makeup_recommendations |
| `app/(auth)/onboarding.tsx` | 110 | W | UPSERT id, display_name, age_range, city, gender, care_categories, onboarding_complete |
| `app/(profile)/care-categories.tsx` | 37 | R | gender, care_categories |
| `app/(profile)/care-categories.tsx` | 60 | W | UPDATE care_categories |
| `app/(profile)/hair-profile.tsx` | 96 | R | hair_profile |
| `app/(profile)/hair-profile.tsx` | 149 | W | UPDATE hair_profile |
| `app/(profile)/my-brands.tsx` | 71 | R | preferred_brands_v2 |
| `app/(profile)/my-brands.tsx` | 101 | W | UPDATE preferred_brands_v2 |
| `app/(profile)/notifications.tsx` | 78 | R | 7× notify_* + push_token |
| `app/(profile)/notifications.tsx` | 102 | W | UPDATE notify_* |
| `app/(profile)/settings.tsx` | 52 | R | display_name, city, gender |
| `app/(profile)/add-from-routine.tsx` | 142 | R | hair_recommendations |
| `app/(tabs)/profile.tsx` | 53 | R | care_categories |
| `app/(tabs)/routine.tsx` | 109 | R | care_categories, hair_recommendations |
| `hooks/useScan.tsx` | 296 | R | preferred_brands_v2, hair_profile, traits, age_range, gender |
| `hooks/useScan.tsx` | 334 | W | UPDATE last_scan_at, scan_bonus_count, scan_bonus_period |
| `hooks/useScan.tsx` | 369 | W | UPDATE hair_recommendations |
| `lib/makeupRecs.ts` | 22 | R | makeup_recommendations, makeup_recommendations_meta |
| `lib/makeupRecs.ts` | 41 | W | UPDATE makeup_recommendations, makeup_recommendations_meta |
| `lib/profileData.ts` | 143 | R | display_name, city |
| `lib/profileData.ts` | 154 | R | created_at |
| `lib/traits.ts` | 165 | R | traits |
| `lib/traits.ts` | 178 | W | UPDATE traits |
| `lib/traits.ts` | 196 | W | UPDATE face_shape_confirmed_at |
| `lib/traits.ts` | 206 | R | face_shape_confirmed_at |
| `services/scanService.ts` | 174 | R | hair_profile, gender, age_range, care_categories, traits, preferred_brands_v2 |
| `services/scanService.ts` | 429 | R | care_categories, gender (regen prep) |
| `services/scanService.ts` | 734 | R | preferred_brands_v2 |
| `services/scanService.ts` | 978 | R | hair_recommendations |
| `services/scanService.ts` | 1022 | W | UPDATE hair_recommendations |
| `services/scanService.ts` | 1189 | R | preferred_brands_v2 |
| `services/scanService.ts` | 1388 | R | hair_profile |
| `services/scanService.ts` | 1425 | W | UPDATE hair_profile, hair_recommendations |
| `services/scanService.ts` | 1474 | R | hair_profile, hair_recommendations |
| `services/scanService.ts` | 1590 | R | hair_recommendations, hair_profile |
| `services/scanService.ts` | 1621 | W | UPDATE hair_recommendations, hair_profile |
| `services/scanService.ts` | 1663 | R | gender, care_categories |
| `services/habitService.ts` | 324 | R | hair_recommendations |

### Table: `scans`

| File | Line | R/W | Notes |
|---|---|---|---|
| `app/_layout.tsx` | 103 | R | count |
| `app/recommendations.tsx` | 261 / 266 / 308 | R/W | full row read; UPDATE recommendations |
| `app/skin-detail.tsx` | 234 / 239 | R | full row + delta context |
| `app/hair-detail.tsx` | 232 / 237 | R | full row |
| `app/beard-detail.tsx` | 178 / 183 | R | full row |
| `app/makeup-detail.tsx` | 104 / 109 | R | full row |
| `app/(profile)/add-from-routine.tsx` | 146 | R | recommendations |
| `app/(profile)/scan-history.tsx` | (per profileData.fetchScanHistory) | R | indirect |
| `app/(scan)/issue-cover.tsx` | 94 / 105 | R | latest scan |
| `app/(scan)/observation.tsx` | 53 | R | scan record |
| `app/(scan)/scan-delta.tsx` | 178 / 202 | R | from/to scans |
| `app/(hair-setup)/analyzing.tsx` | 57 | R | scan id |
| `app/(tabs)/routine.tsx` | 114 / 121 | R | latest scan + recommendations |
| `hooks/useScan.tsx` | 189 | W | INSERT scan placeholder |
| `hooks/useScan.tsx` | 257 | W | UPDATE skin_concerns_detailed, etc. |
| `hooks/useScan.tsx` | 430 / 492 | R/W | post-scan reads & finalize |
| `lib/milestones.ts` | 232 / 283 | R | scan_count + tier checks |
| `lib/profileData.ts` | 88 / 144 / 149 / 174 / 259 / 436 / 470 | R | scan history, latest, count |
| `services/deltaService.ts` | 114 / 127 | R | from/to scans for delta compute |
| `services/habitService.ts` | 321 | R | recommendations for routine schedule |
| `services/scanService.ts` | 143 | W | INSERT scan |
| `services/scanService.ts` | 409 / 417 / 444 | R/W | scan finalize, scan_type, recommendations |
| `services/scanService.ts` | 478 | W | DELETE scan (rollback path) |
| `services/scanService.ts` | 597 / 615 / 637 / 646 / 671 / 685 | R/W | per-scan recs read, partial updates |
| `services/scanService.ts` | 838 / 961 | R | scan context for recs |
| `services/scanService.ts` | 1009 / 1205 / 1250 / 1325 | R/W | regen routines (skin/beard/makeup) — UPDATE recommendations |
| `services/scanService.ts` | 1374 | R | scan_id resolve |
| `services/scanService.ts` | 1473 | R | scan + user combined load |
| `services/scanService.ts` | 1644 | R | latest scan |

### Table: `routine_checkins`

| File | Line | R/W | Notes |
|---|---|---|---|
| `lib/milestones.ts` | 92 | R | streak compute |
| `lib/profileData.ts` | 92 / 280 | R | adherence stats |
| `services/deltaService.ts` | 168 / 256 | R | adherence within window |
| `services/habitService.ts` | 125 | W | UPSERT checkin |
| `services/habitService.ts` | 147 | W | DELETE (uncheckin) |
| `services/habitService.ts` | 174 | W | UPSERT bulk |
| `services/habitService.ts` | 191 | R | day rows |
| `services/habitService.ts` | 212 | R | rows for scan_id |
| `services/habitService.ts` | 237 | R | range query |
| `services/habitService.ts` | 305 / 467 | R/W | scheduling + supersede |

### Table: `user_kit`

| File | Line | R/W | Notes |
|---|---|---|---|
| `components/detail/ProductDetailSheet.tsx` | 92 | W | INSERT kit row from buy CTA |
| `lib/profileData.ts` | 213 | R | active kit |
| `services/deltaService.ts` | 245 | R | active kit during delta |
| `services/kitService.ts` | 47 / 57 / 88 / 100 / 109 | R/W | productIdFor / addProductToKit / fetchActiveKit / removeKitItem / markKitReordered |

### Table: `scan_deltas`

| File | Line | R/W | Notes |
|---|---|---|---|
| `app/(scan)/observation.tsx` | 79 | R | delta lookup |
| `services/deltaService.ts` | 284 / 327 / 343 | R/W | upsert delta + fetch by ids |

### Table: `user_milestones`

| File | Line | R/W | Notes |
|---|---|---|---|
| `lib/milestones.ts` | 56 | R | earned set |
| `lib/milestones.ts` | 72 | W | INSERT |
| `lib/milestones.ts` | 308 / 327 / 348 | R/W | uncelebrated read + mark celebrated |
| `lib/profileData.ts` | 96 / 374 | R | counts and earned for header |

### Table: `salon_profiles`

| File | Line | R/W | Notes |
|---|---|---|---|
| `services/salonService.ts` | 39 / 90 / 222 | R/W | claim + merge |

### Table: `salon_ratings`

| File | Line | R/W | Notes |
|---|---|---|---|
| `services/salonService.ts` | 43 / 114 / 146 / 176 / 258 | R/W | submit / fetch / aggregate |

### Table: `gemini_usage`

| File | Line | R/W | Notes |
|---|---|---|---|
| `lib/geminiUsage.ts` | 49 | W | INSERT usage telemetry (NO MIGRATION — see §7) |

### Table: `routine_logs`

| File | Line | R/W | Notes |
|---|---|---|---|
| `services/scanService.ts` | 215 | W | INSERT step log (NO MIGRATION — see §7) |

### Table: `product_events`

| File | Line | R/W | Notes |
|---|---|---|---|
| `services/scanService.ts` | 1705 | W | INSERT product event (NO MIGRATION — see §7) |

### Table: `product_usage`

| File | Line | R/W | Notes |
|---|---|---|---|
| `services/scanService.ts` | 1715 | W | INSERT product usage (NO MIGRATION — see §7) |

### Table: `waitlist`

NO code references found. Defined in `phase_00_baseline_users_and_helpers.sql` and historical `supabase-setup.sql` but never read or written by the app.

### RPCs

| File | Line | RPC | Notes |
|---|---|---|---|
| `services/userService.ts` | (deleteUserAccount) | `delete_user` | defined in `phase_7c_delete_account.sql` |

---

## 2. Per-table analysis

For each table: defined columns (from migrations), columns referenced in code, drift, files using it, and whether it appears alive.

### `users` — ALIVE

**Defined columns** (from `phase_00_baseline_users_and_helpers.sql` + later ALTERs):
`id, display_name, gender, city, avatar_url, referral_code, referred_by, push_token, notification_reminders, notification_routine, last_scan_at, onboarding_complete, created_at, scan_bonus_count, scan_bonus_period, routine_level, preferred_brands, hair_profile, hair_recommendations, preferred_brands_v2, traits, beard_goal, age_range, care_categories, face_shape_confirmed_at, makeup_recommendations, makeup_recommendations_meta, notify_morning_routine, notify_evening_routine, notify_weekly_summary, notify_rescan, notify_milestones, notify_morning_time, notify_evening_time`

CHECK constraints: `users_age_range_check` (phase_00), `users_beard_goal_check` `('fuller','sharper','shorter','longer','none')` (phase_3a — this REPLACES the original phase_00 list, then phase_d also tries to define it — drift, see §8), `users_gender_check` `('man','woman')` (phase_x_gender_binary).

UNIQUE: `users_referral_code_key`.

**Code-referenced columns:** `id, display_name, gender, city, avatar_url, referral_code, push_token, last_scan_at, onboarding_complete, created_at, scan_bonus_count, scan_bonus_period, hair_profile, hair_recommendations, preferred_brands_v2, traits, age_range, care_categories, face_shape_confirmed_at, makeup_recommendations, makeup_recommendations_meta, notify_morning_routine, notify_evening_routine, notify_weekly_summary, notify_rescan, notify_milestones, notify_morning_time, notify_evening_time`.

**Defined-but-never-referenced columns:**
- `referred_by` — defined (phase_00, FK added in phase_7c) but no `.from('users')` ever reads or writes it. Onboarding does not set it.
- `notification_reminders` (boolean default true) — older flag; superseded by phase_7b notify_* booleans. Never read or written by code.
- `notification_routine` (boolean default true) — same as above. Superseded.
- `routine_level` (text default 'simple') — defined in phase_00. Never referenced.
- `preferred_brands` (jsonb default '[]') — legacy v1 column; superseded by `preferred_brands_v2`. Never referenced.
- `beard_goal` — column exists but no `.from('users').select('beard_goal')` or update found. (`UserTraits.beard_goal` in `types/index.ts` is unrelated — it lives in the `traits` jsonb.)

**Code-referenced but not present in any committed migration:**
None — all referenced columns are in phase_00 or a later ALTER.

**Files using:** see §1 above (44 touchpoints).

---

### `scans` — ALIVE (most-touched table)

**Defined columns** (from migrations only): `skin_concerns_detailed jsonb` (phase_4a3), `scan_type text CHECK ('first','rescan')` (phase_3a). NO `CREATE TABLE public.scans` statement exists in `supabase/migrations/*` — the table was created in the Supabase dashboard and was never captured into a baseline migration. See §7.

**Inferred live columns** (from code reads/writes + historical `supabase-setup.sql`):
`id (uuid pk), user_id (uuid fk), image_url, face_shape, skin_type, skin_concerns (text[]), skin_concerns_detailed (jsonb), beard_density, beard_condition, brow_condition, undereye, fitzpatrick_scale, skin_tone, skin_undertone, score_skin, score_beard, score_makeup, score_overall, tier_label, recommendations (jsonb), share_count, created_at, scan_type, scan_hour, season, makeup_recommendations (jsonb)?` — at least these are written or read by `services/scanService.ts` and `hooks/useScan.tsx`.

`stylist_mentioned (boolean)` is in `supabase-setup.sql` and `types/index.ts` (`Scan.stylist_mentioned`) but I found NO code reads or writes — see §4 and §8.

**Drift / risk:** because there is no baseline migration, a fresh DB created from `supabase/migrations/` alone will fail — the scans-altering migrations (phase_3a, phase_4a3) reference a table that was not created. This is the single largest schema-capture gap.

**Files using:** see §1 (40+ touchpoints — heaviest in `services/scanService.ts`, `lib/profileData.ts`, `hooks/useScan.tsx`, `lib/milestones.ts`).

---

### `routine_checkins` — ALIVE

**Defined columns** (`phase_c_habit_engine.sql`): `id, user_id, scan_id, day_index, period (morning|evening), step_id, kit_item_id, checked_at, created_at` (+ RLS).

**Code-referenced columns:** `user_id, scan_id, day_index, period, step_id, kit_item_id, checked_at, superseded_at` (referenced via supersede UPDATE in `habitService.ts:467`).

**Drift:** `superseded_at` is written by `habitService.supersedePreviousScanRows` (`services/habitService.ts:467`) but is NOT in `phase_c_habit_engine.sql`. Either the column was added later (not captured in a migration) or this UPDATE silently no-ops.

**Files using:** `lib/milestones.ts`, `lib/profileData.ts`, `services/deltaService.ts`, `services/habitService.ts`.

---

### `user_kit` — ALIVE

**Defined columns** (`phase_c_habit_engine.sql`): `id, user_id, scan_id, step_id, product_id, brand, name, image_url, affiliate_url, price_text, started_at, archived_at, created_at` (+ RLS).

**Code-referenced columns:** all of the above plus `reordered_at` (`services/kitService.ts:109` `markKitReordered`). `reordered_at` not in any migration — drift.

**Files using:** `components/detail/ProductDetailSheet.tsx`, `lib/profileData.ts`, `services/deltaService.ts`, `services/kitService.ts`.

---

### `scan_deltas` — ALIVE

**Defined columns** — DEFINED IN TWO MIGRATIONS:
- `phase_c_habit_engine.sql` — initial declaration: `id, user_id, from_scan_id, to_scan_id, score_delta, concerns_resolved, concerns_emerged, commentary, created_at`.
- `phase_f_scan_deltas.sql` — re-declares with `user_feedback (text default null)` added.

**Code-referenced columns:** `id, user_id, from_scan_id, to_scan_id, score_delta, score_skin_delta, score_beard_delta, score_makeup_delta, adherence_pct, concerns_resolved, concerns_emerged, commentary, observation_text, observation_type, user_feedback, created_at` — `services/deltaService.ts` reads/writes more columns than either migration declares.

**Drift:** `score_skin_delta`, `score_beard_delta`, `score_makeup_delta`, `adherence_pct`, `observation_text`, `observation_type` exist in code but no migration creates them. Either added live (not captured) or silently dropped at insert time.

**Files using:** `app/(scan)/observation.tsx`, `services/deltaService.ts`.

---

### `user_milestones` — ALIVE

**Defined columns** (`phase_e_milestones.sql`): `id, user_id, milestone_id, earned_at, celebrated_at, created_at` (+ RLS).

**Code-referenced columns:** matches.

**Files using:** `lib/milestones.ts`, `lib/profileData.ts`.

---

### `salon_profiles` — ALIVE

**Defined columns** (`phase_x_discover_salon_rebuild.sql`): `google_place_id (pk), name, address, lat, lng, claimed_by_user_id, claim_status, lume_score, lume_score_count, created_at`.

**Code-referenced columns:** matches.

**Files using:** `services/salonService.ts`.

---

### `salon_ratings` — ALIVE

**Defined columns** (`phase_x_discover_salon_rebuild.sql` + `phase_x_one_rating_per_user.sql` UNIQUE): `id, user_id, google_place_id, rating, comment, created_at`.

**Code-referenced columns:** matches.

**Drift caution:** historical `supabase-salons.sql` (NOT a migration — see §6) defined `salon_ratings` with `rating_stylist_skill, rating_cleanliness, rating_value, would_return` columns. None are referenced by current code. The current migration set replaced this with a single `rating` integer.

**Files using:** `services/salonService.ts`.

---

### `waitlist` — DEFINED, NEVER REFERENCED

**Defined columns** (phase_00): `id, email, city, created_at`.

**Code references:** zero. See §6.

---

### `gemini_usage` — REFERENCED IN CODE, NO MIGRATION

INSERTed by `lib/geminiUsage.ts:49` with payload `{user_id, scan_id, call_type, model, input_tokens, output_tokens, cost_usd, duration_ms, success, error_message}`. No migration creates this table — see §7.

---

### `routine_logs` — REFERENCED IN CODE, NO MIGRATION

INSERTed by `services/scanService.ts:215`. No migration. See §7.

---

### `product_events` — REFERENCED IN CODE, NO MIGRATION

INSERTed by `services/scanService.ts:1705`. No migration. See §7.

---

### `product_usage` — REFERENCED IN CODE, NO MIGRATION

INSERTed by `services/scanService.ts:1715`. No migration. See §7.

---

## 3. Type definitions vs runtime usage

Source of truth: `types/index.ts` (533 lines).

### `User` interface (~line 30)

Fields declared: `id, email?, display_name?, age_range?, city?, gender?, avatar_url?, hair_profile?, hair_recommendations?, traits?, preferred_brands_v2?, care_categories, beard_goal?, push_token?, last_scan_at?, scan_bonus_count?, scan_bonus_period?, makeup_recommendations?, makeup_recommendations_meta?, face_shape_confirmed_at?, onboarding_complete?, created_at?` (paraphrased).

Drift vs DB / code:
- `User.email` — declared, but never read from `users` table (auth uses `supabase.auth.getUser()`). Phantom field on the User type.
- `User.beard_goal` — declared, but no `.from('users').select('beard_goal')` exists. The live "beard goal" data flows through `UserTraits.beard_goal` in the `traits` jsonb instead.
- Notification booleans (`notify_morning_routine` etc.) and times — present in DB and read by `app/(profile)/notifications.tsx`, but NOT in the `User` interface. The screen types its own `NotificationPrefs`-style object inline.
- `routine_level`, `preferred_brands`, `referred_by`, `referral_code`, `notification_reminders`, `notification_routine` — none in the User type, none read by code, present in DB. Dead columns.

### `Scan` interface (~line 80)

Fields declared include `id, user_id, image_url?, face_shape?, skin_type?, skin_concerns, skin_concerns_detailed?, beard_density?, beard_condition?, brow_condition?, undereye?, fitzpatrick_scale?, skin_tone?, skin_undertone?, score_skin?, score_beard?, score_makeup?, score_overall?, tier_label?, recommendations?, stylist_mentioned?, share_count?, created_at, scan_type?, scan_hour?, season?, makeup_recommendations?`.

Drift:
- `stylist_mentioned` — declared, but I found NO `.from('scans')` that selects or writes this column. Orphan field. See §4.
- `share_count` — declared, no `.from('scans')` references it.

### `HairRecommendations` (~line 200)

Five fields explicitly marked `@deprecated`:
- `summary` — "kept for legacy scans only"
- `wash_frequency`
- `wash_steps`
- `weekly_treatment`
- `routine` (on SkinRecommendation similarly)

These are used only by legacy-scan rendering paths. Current generation pipeline (`services/scanService.ts`) does not write them.

### `ProductRecommendation` / `MatchedProduct`

`ProductRecommendation.attributes` marked `@deprecated`. `MatchedProduct.why_good`, `MatchedProduct.is_featured`, `MatchedProduct.nykaa_url` marked `@deprecated`.

### `BeardStyleItem.not_recommended` — marked `@deprecated`.

### `SalonProfile`, `SalonRating`, `NearbySalon` — current; align with migrations.

### `RescanFeedback`, `UserTraits`, `BeardGoal` — current; `UserTraits` aligns with `users.traits` jsonb usage in `lib/traits.ts`.

### Type-vs-DB summary

| Type field | DB column | Status |
|---|---|---|
| `User.email` | (none) | type-only; auth-derived |
| `User.beard_goal` | `users.beard_goal` | both exist; never read by code |
| `Scan.stylist_mentioned` | `scans.stylist_mentioned` (assumed live) | both exist; never read by code |
| `Scan.share_count` | `scans.share_count` (assumed live) | both exist; never read by code |
| (notification fields) | `users.notify_*` | DB has them, code reads them, type missing them |
| `User.routine_level / preferred_brands / referred_by / referral_code / notification_reminders / notification_routine` | DB has them | type missing them, code does not touch them |

---

## 4. Stylist-related code (flagged abandoned)

User flagged stylist functionality as fully abandoned. Findings:

### Migrations
- `phase_x_discover_salon_rebuild.sql` explicitly drops legacy stylist tables: `drop table if exists stylist_ratings cascade;` and references to `shadow_stylists`. The current model is `salon_profiles` + `salon_ratings`. Clean migration-side.

### Active code
- `salonService.ts` — uses ONLY the new salon tables. No stylist references.
- `locationService.ts` — Google Places only; no stylist concept.

### Residual stylist references found
1. `types/index.ts` — `Scan.stylist_mentioned?: boolean` (declared, never read or written anywhere in `app/`, `services/`, `lib/`, `hooks/`, `components/`).
2. `supabase-setup.sql` — historical bootstrap script (NOT a migration). Defines `scans.stylist_mentioned`, `shadow_stylists` table.
3. `supabase-salons.sql` — historical (NOT a migration). Defines `stylist_ratings` table and `salon_ratings.rating_stylist_skill` column. Both superseded by `phase_x_discover_salon_rebuild.sql`.

### Verdict
The runtime stylist code path is gone. Remaining surface area is:
- One orphan field on `Scan` interface (`stylist_mentioned`).
- A column in the live DB (assumed) called `scans.stylist_mentioned` that no code reads.
- Two historical SQL files in repo root not in `supabase/migrations/`.
- No screens, services, RPCs, or hooks reference stylists.

---

## 5. Service files audit (`services/*`)

For each: one-line summary, tables touched, exported functions, dead exports.

### `services/scanService.ts` (1729 lines)
- **Summary:** orchestrates scan creation, two-phase Gemini analysis, recommendations generation, regeneration routines for skin/beard/makeup, hair-profile (re)build, and step-product event logging.
- **Tables:** `scans`, `users`, `routine_logs`, `product_events`, `product_usage`.
- **Exports:** `logRoutineStep`, `runScanPhase1`, `runScanPhase2`, `finalizeTraitsAndRunPhase2`, `refreshRecommendations`, `regenerateSkinRecs`, `regenerateBeardRecs`, `regenerateMakeupRecs`, `rescheduleAfterRegen`, `getSavedRecommendations`, `getLatestSavedScan`, `getProductMap`, `buildHairCategories`, `generateAndSaveHairProfile`, `getAlternativesForStep`, `logProductEvent`.
- **Possibly dead:** `logRoutineStep` and `logProductEvent` write to `routine_logs` / `product_events` / `product_usage`, NONE of which exist as migrations (§7). If these tables were never created in live DB, those writes silently fail. Need to verify whether these are called.
- **Notable:** file begins with four large `/* SQL */` comment blocks documenting tables that were "created via Supabase dashboard" — historical setup notes left in source. See §8.

### `services/deltaService.ts`
- **Summary:** computes scan-to-scan deltas (score deltas, concerns resolved/emerged, adherence over the window) and stores them.
- **Tables:** `scans`, `routine_checkins`, `user_kit`, `scan_deltas`.
- **Exports:** `computeAndStoreScanDelta`, `fetchScanDeltaByToScanId`, `fetchDeltaToScanIds`.
- **Dead:** none apparent. `fetchDeltaToScanIds` is read; commentary fields are read by `app/(scan)/observation.tsx`.

### `services/habitService.ts`
- **Summary:** schedules routine rows from a scan's recommendations, records check-ins (single + bulk + undo), supersedes prior scan rows, fetches today/past adherence.
- **Tables:** `routine_checkins`, `scans`, `users`.
- **Exports:** `scheduleRoutineForScan`, `supersedePreviousScanRows`, `recordCheckin`, `unrecordCheckin`, `recordBulkCheckin`, `fetchDailyAdherence`, `fetchTodayRoutine`, `fetchPastDayRoutine`, `backfillKitItemIdForStep`.
- **Dead:** none confirmed dead. `backfillKitItemIdForStep` worth confirming reachability.
- **Drift:** writes `superseded_at` (not in migration).

### `services/kitService.ts`
- **Summary:** add/list/remove kit items; product-id resolution; reorder timestamp.
- **Tables:** `user_kit`.
- **Exports:** `productIdFor`, `addProductToKitFromBuy`, `fetchActiveKit`, `removeKitItem`, `markKitReordered`.
- **Dead:** none apparent.

### `services/salonService.ts`
- **Summary:** Discover-tab data layer: merge Google Places with Lumé scoring, fetch profile + ratings, submit user rating, claim flow.
- **Tables:** `salon_profiles`, `salon_ratings`.
- **Exports:** `mergeWithLumeData`, `fetchSalonProfile`, `fetchSalonRatings`, `fetchUserRating`, `submitRating`, `submitClaim`, `fetchRecentRatings`.
- **Dead:** none confirmed.

### `services/locationService.ts`
- **Summary:** Google Places nearby-salon search and current-location lookup. NO Supabase.
- **Exports:** `getCurrentLocation`, `fetchNearbySalons`, `priceLevelGlyph`.
- **Dead:** none apparent.

### `services/notificationService.ts`
- **Summary:** schedules and cancels the rescan-due nudge via Expo Notifications. NO Supabase.
- **Exports:** `scheduleRescanNudge`, `cancelRescanNudge`.
- **Dead:** none apparent.

### `services/userService.ts`
- **Summary:** account deletion via `delete_user` RPC.
- **RPC:** `delete_user`.
- **Exports:** `deleteUserAccount`.
- **Dead:** none apparent.

---

## 6. Tables in migrations but never read by code

| Table | Defined in | Code references |
|---|---|---|
| `waitlist` | `phase_00_baseline_users_and_helpers.sql` | NONE |

All other migration-defined tables (`users`, `routine_checkins`, `user_kit`, `scan_deltas`, `user_milestones`, `salon_profiles`, `salon_ratings`) are read by code. The dropped tables (`stylist_ratings`, `shadow_stylists`) are gone from migrations and gone from code.

Note: historical files outside `supabase/migrations/` define more legacy tables that are not currently in either migrations or code:
- `supabase-setup.sql` (repo root) — defines `shadow_stylists`.
- `supabase-salons.sql` (repo root) — defines `stylist_ratings` and a fatter `salon_ratings`.

These are not migrations; whether the live DB still has these objects is unknown.

---

## 7. Tables read by code but missing from any migration

Critical gap. Listed by severity.

| Table | Touchpoints | Operation | Severity |
|---|---|---|---|
| `scans` | 40+ | INSERT/SELECT/UPDATE/DELETE — the central table | **CRITICAL** — only ALTERs exist in migrations (phase_3a, phase_4a3); no `CREATE TABLE` |
| `gemini_usage` | `lib/geminiUsage.ts:49` | INSERT cost telemetry | HIGH |
| `routine_logs` | `services/scanService.ts:215` | INSERT step log | HIGH |
| `product_events` | `services/scanService.ts:1705` | INSERT product event | HIGH |
| `product_usage` | `services/scanService.ts:1715` | INSERT product usage | HIGH |

**Drift on existing migrated tables** (column-level — code writes columns no migration declares):
- `routine_checkins.superseded_at` — written by `habitService.supersedePreviousScanRows`.
- `user_kit.reordered_at` — written by `kitService.markKitReordered`.
- `scan_deltas.score_skin_delta`, `score_beard_delta`, `score_makeup_delta`, `adherence_pct`, `observation_text`, `observation_type` — written by `deltaService.computeAndStoreScanDelta`.

A fresh DB built only from `supabase/migrations/` would not match the live schema. Some of these writes may silently no-op (if the column was created live but not captured) or fail (if the table itself was never created live either, e.g. `routine_logs`/`product_events`/`product_usage`/`gemini_usage`).

---

## 8. Suspicious patterns

### a. Dead-but-still-shipped historical SQL in `services/scanService.ts`
The top of the file contains four `/*  …  */` blocks with full DDL for `routine_logs`, `product_usage`, `scan_deltas`, `product_events`, `product_confirmations`. These are documentation comments captured from "tables created via Supabase dashboard" and they pre-date the migrations folder. They duplicate (and partially conflict with) what `phase_c_habit_engine.sql` and `phase_f_scan_deltas.sql` later defined.

### b. Conflicting / duplicate migration definitions
- `phase_d_prescription_routine.sql` ALTERs `users.beard_goal` with the OLD enum values `('clean_simple','healthy_groomed','growing_thickening','styled')`. `phase_3a_beard_goal_taxonomy.sql` ALREADY established the NEW set `('fuller','sharper','shorter','longer','none')`. Filename ordering puts phase_3a before phase_d, so phase_d would attempt to override. Result depends on whether phase_d ran first historically; either way the file in source is wrong relative to current taxonomy.
- `scan_deltas` table is declared in BOTH `phase_c_habit_engine.sql` and `phase_f_scan_deltas.sql`. `phase_f` is `create table if not exists` so it no-ops on the second run, but two source-of-truths is a smell.

### c. Many `@deprecated` markers in `types/index.ts` for legacy-scan compatibility
- `HairRecommendations.summary`, `.wash_frequency`, `.wash_steps`, `.weekly_treatment`
- `SkinRecommendation.routine`, `.summary`
- `ProductRecommendation.attributes`
- `MatchedProduct.why_good`, `.is_featured`, `.nykaa_url`
- `BeardStyleItem.not_recommended`
Each is "kept for legacy scans only" — kept for backward-render of historical scan rows.

### d. Type vs DB drift — `User.email` and `User.beard_goal`
- `User.email` is in the type but never read from the DB (auth-derived only).
- `User.beard_goal` is in the type AND the DB column exists, but no `.from('users').select('beard_goal')` or update exists. The active path is `traits.beard_goal` (jsonb).

### e. Orphan column: `scans.stylist_mentioned`
Lives in `types/index.ts`, lives in historical `supabase-setup.sql`, presumably lives in live DB. Zero code reads or writes.

### f. Defined columns on `users` with no readers/writers
`referred_by`, `notification_reminders`, `notification_routine`, `routine_level`, `preferred_brands` (v1). All present in `phase_00_baseline_users_and_helpers.sql`; all dead at the code level.

### g. `waitlist` table defined but app never inserts
Either waitlist sign-ups happen out-of-band (web, manual), or the feature was never built into the app. No screen exists for it.

### h. `_layout.tsx` reads `scans` count just to gate routing
`app/_layout.tsx:103` issues a count(*) on `scans` to decide initial route. Cheap but worth noting if perf becomes a concern (this fires on cold start).

### i. Exported but possibly unreached
- `services/scanService.ts: getProductMap, getAlternativesForStep, logRoutineStep, logProductEvent, buildHairCategories` — exports whose call-sites I did not verify in this audit. Worth a follow-up reachability check.
- `services/habitService.ts: backfillKitItemIdForStep` — exported, callsite not confirmed.

### j. Two non-migration SQL files in repo root
`supabase-setup.sql` and `supabase-salons.sql` at repo root predate the `supabase/migrations/` workflow. They contain definitions that conflict with the current migration set (stylist tables, fatter salon_ratings). They should be either moved out of repo, deleted, or marked archive — currently they look authoritative to a new reader.

---

## 9. Open questions for the user

1. **`scans` baseline migration** — is there a `phase_00_baseline_scans.sql` planned (analogous to `phase_00_baseline_users_and_helpers.sql`)? Without it the migrations folder cannot rebuild a fresh DB. The live `scans` schema needs to be captured.

2. **`gemini_usage`, `routine_logs`, `product_events`, `product_usage`** — do these tables exist in live DB? If yes, capture them as migrations. If no, the writes in `lib/geminiUsage.ts` and `services/scanService.ts` are silently failing — confirm whether telemetry and step-event logging are actually working in production.

3. **Drift columns** (`routine_checkins.superseded_at`, `user_kit.reordered_at`, `scan_deltas.score_skin_delta` / `score_beard_delta` / `score_makeup_delta` / `adherence_pct` / `observation_text` / `observation_type`) — were these added live and not captured, or are they planned-but-not-yet-added? Each is currently written by code with no migration backing.

4. **Dead `users` columns** — `referred_by`, `notification_reminders`, `notification_routine`, `routine_level`, `preferred_brands` (v1), `beard_goal` (column, not the trait). Drop them, or are they being held for a feature that's coming back?

5. **`scans.stylist_mentioned`** — drop the column and remove from `types/index.ts` `Scan.stylist_mentioned`?

6. **`waitlist`** — is this actively used (e.g. web waitlist outside the app)? If not, archive it.

7. **`User.email` / `User.beard_goal`** in `types/index.ts` — remove from type? `email` is auth-derived; `beard_goal` lives in `traits` jsonb in practice.

8. **`@deprecated` legacy fields in `types/index.ts`** — when is the legacy-scan render path expected to be retired? Currently all old fields must remain to render historical scans.

9. **`phase_d_prescription_routine.sql` beard_goal conflict** — phase_d declares the OLD enum values; phase_3a declares the NEW. Was phase_d ever applied to live? Should it be removed from the migrations folder or rewritten to match phase_3a?

10. **Two SQL files in repo root** (`supabase-setup.sql`, `supabase-salons.sql`) — keep, archive, or delete? They conflict with current migrations and reference dropped/legacy schema.

11. **Possibly-unreached service exports** (`getProductMap`, `getAlternativesForStep`, `logRoutineStep`, `logProductEvent`, `buildHairCategories`, `backfillKitItemIdForStep`) — confirm reachability or remove.

12. **`scanService.ts` historical SQL comment blocks** — keep as documentation, or remove now that real migration files exist?

---

End of audit.
