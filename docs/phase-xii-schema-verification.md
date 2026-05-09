# Phase XII — Schema verification (read-only)

> Read-only investigation. No edits, migrations, or commits. The brief said
> "trust nothing from prior reports — re-verify from the live DB and the live
> code." The live DB introspection path was attempted but the **PostgREST API
> blocks `information_schema` and `pg_catalog`** even with the anon key
> (`PGRST205` — "Could not find the table 'public.information_schema.tables'").
> So the authoritative source for this report is:
>
> 1. The migration files in `supabase/migrations/` (which are explicitly
>    structured as a baseline + diffs and are claimed to fully reproduce the
>    live DB — see the comment block at the top of `phase_00_baseline_rls.sql`:
>    *"After this migration runs, all schema in the live database is
>    reproducible from supabase/migrations/."*).
> 2. The application code that reads/writes those tables.
>
> Anywhere a fact is structural-from-migrations vs. behavioural-from-code, that
> is called out. Anything that requires `SELECT` against live data (sample
> rows) is listed verbatim in §11 for Prateek to run.
>
> Date prepared: 2026-05-08.

---

## 1. All tables in the public schema

Derived from `CREATE TABLE` statements in `supabase/migrations/`. Listed in
filename-sort order of the migration that creates them, so the reader can
trace each table back to its declaration.

| Table | Defining migration | Notes |
|---|---|---|
| `public.users` | `phase_00_baseline_users_and_helpers.sql:24` | Mirrors `auth.users` 1:1 via `handle_new_user` trigger. |
| `public.waitlist` | `phase_00_baseline_users_and_helpers.sql:102` | **DROPPED** in `phase_xi_drop_deadwood.sql:92`. |
| `public.scans` | `phase_00_baseline_scans.sql:31` | Originally 31 columns; 9 dropped in Phase XI. |
| `public.gemini_usage` | `phase_00_baseline_telemetry.sql:59` | AI cost telemetry. |
| `public.product_events` | `phase_00_baseline_telemetry.sql:115` | Product interaction telemetry. |
| `public.routine_checkins` | `phase_c_habit_engine.sql:15` | Per-step per-day adherence log. |
| `public.user_kit` | `phase_c_habit_engine.sql:44` | User product kit (NOT named `kit_items`). |
| `public.scan_deltas` | `phase_c_habit_engine.sql:80`, re-asserted in `phase_f_scan_deltas.sql:9` | One row per rescan. |
| `public.user_milestones` | `phase_e_milestones.sql:7` | Earned outcome moments. |
| `public.salon_profiles` | `phase_x_discover_salon_rebuild.sql:13` | Discover tab; CASCADE-dropped + recreated by this migration. |
| `public.salon_ratings` | `phase_x_discover_salon_rebuild.sql:37` | Discover tab; CASCADE-dropped + recreated by this migration. |
| `public.routine_logs` | `phase_xi_create_missing_tables.sql:52` | Created in Phase XI to back the silently-failing inserts. |
| `public.product_usage` | `phase_xi_create_missing_tables.sql:90` | Same — created in Phase XI. |

**Dropped tables (no longer present):**

- `waitlist` — `phase_xi_drop_deadwood.sql:92`.
- `stylist_ratings` and `shadow_stylists` — `phase_x_discover_salon_rebuild.sql:7-8` (`drop … cascade`).

**Live-DB count to verify:** 12 tables in `public` (the count in §11).

---

## 2. Column listings for the routine / product / scan / user / kit / catalog / event / usage / delta tables

### 2.1 `public.users`

Source: `phase_00_baseline_users_and_helpers.sql:24-59` (33 columns), then
five columns dropped in `phase_xi_drop_deadwood.sql:78-82`. Net: **28 columns**.

| Column | Type | Default | Phase XI status |
|---|---|---|---|
| `id` | `uuid` (PK) | — | — |
| `display_name` | `text` | — | — |
| `gender` | `text` | — | CHECK: `man | woman` (or null) |
| `city` | `text` | — | — |
| `avatar_url` | `text` | — | — |
| `referral_code` | `text` | — | UNIQUE INDEX `users_referral_code_key` |
| `referred_by` | `uuid` | — | FK → `users(id) ON DELETE SET NULL` (`phase_7c_delete_account.sql:11-14`) |
| ~~`push_token`~~ | `text` | — | **DROPPED** `phase_xi_drop_deadwood.sql:78` |
| ~~`notification_reminders`~~ | `boolean` | `true` | **DROPPED** `phase_xi_drop_deadwood.sql:79` |
| ~~`notification_routine`~~ | `boolean` | `true` | **DROPPED** `phase_xi_drop_deadwood.sql:80` |
| `last_scan_at` | `timestamptz` | — | — |
| `onboarding_complete` | `boolean` | `false` | — |
| `created_at` | `timestamptz` | `now()` | — |
| `scan_bonus_count` | `integer` | `0` | — |
| `scan_bonus_period` | `text` | — | — |
| ~~`routine_level`~~ | `text` | `'simple'` | **DROPPED** `phase_xi_drop_deadwood.sql:81` |
| ~~`preferred_brands`~~ | `jsonb` | `'[]'` | **DROPPED** `phase_xi_drop_deadwood.sql:82` |
| `hair_profile` | `jsonb` | `'{}'` | TS shape: `HairProfile` (`types/index.ts:113`) |
| `hair_recommendations` | `jsonb` | — | TS shape: `HairRecommendations` (`types/index.ts:131`) |
| `preferred_brands_v2` | `jsonb` | `{"hair":[],"skin":[],"makeup":[]}` | TS shape: `PreferredBrands` (`types/index.ts:24`) |
| `traits` | `jsonb` | `'{}'` | TS shape: `UserTraits` (`types/index.ts:95`) |
| `beard_goal` | `text` | — | CHECK: `fuller | sharper | shorter | longer | none` (or null), set in `phase_3a_beard_goal_taxonomy.sql:19-20` (replaced earlier `clean_simple|healthy_groomed|growing_thickening|styled` enum). |
| `age_range` | `text` | — | CHECK: `18-25 | 26-35 | 36-45 | 46-55 | 55+` |
| `care_categories` | `text[]` | `array['skin','hair']` | NOT NULL |
| `face_shape_confirmed_at` | `timestamptz` | — | — |
| `makeup_recommendations` | `jsonb` | — | TS shape: `MakeupRecommendation` (`types/index.ts:286`) |
| `makeup_recommendations_meta` | `jsonb` | — | Drives the regen check in `runScanPhase2` |
| `notify_morning_routine` | `boolean` | `true` | `phase_7b_notifications.sql:11` |
| `notify_evening_routine` | `boolean` | `true` | `phase_7b_notifications.sql:12` |
| `notify_weekly_summary` | `boolean` | `true` | `phase_7b_notifications.sql:13` |
| `notify_rescan` | `boolean` | `true` | `phase_7b_notifications.sql:14` |
| `notify_milestones` | `boolean` | `false` | `phase_7b_notifications.sql:15` |
| `notify_morning_time` | `text` | `'07:30'` | HH:MM 24-hour |
| `notify_evening_time` | `text` | `'22:00'` | HH:MM 24-hour |

### 2.2 `public.scans`

Source: `phase_00_baseline_scans.sql:31-63` (31 columns), then nine columns
dropped in `phase_xi_drop_deadwood.sql:63-71`. Net: **22 columns**.

| Column | Type | Phase XI status |
|---|---|---|
| `id` | `uuid` (PK) | default `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `users(id) ON DELETE CASCADE` |
| `image_url` | `text` | — |
| `face_shape` | `text` | CHECK: `oval | round | square | heart | oblong | diamond` |
| `skin_type` | `text` | CHECK: `oily | dry | combination | normal | sensitive` |
| `skin_concerns` | `text[]` | legacy — names only |
| ~~`hair_texture`~~ | `text` | **DROPPED** |
| ~~`hair_condition`~~ | `text` | **DROPPED** |
| `beard_density` | `text` | CHECK: `none | light | medium | heavy` |
| ~~`brow_shape`~~ | `text` | **DROPPED** |
| `undereye` | `text` | CHECK: `dark_circles | puffiness | normal | dark | puffy | hollow` |
| ~~`score_hair`~~ | `integer` | **DROPPED** |
| `score_skin` | `integer` | CHECK: 0–100 |
| `score_beard` | `integer` | CHECK: 0–100 (null on new scans, see TS comment `types/index.ts:362-365`) |
| `score_makeup` | `integer` | CHECK: 0–100 (null on new scans) |
| `score_overall` | `integer` | CHECK: 0–100 |
| ~~`tier_label`~~ | `text` | **DROPPED** |
| `recommendations` | `jsonb` | TS shape: `Recommendations` (`types/index.ts:330`) — see §7 |
| ~~`stylist_mentioned`~~ | `text` | **DROPPED** |
| ~~`share_count`~~ | `integer` | **DROPPED** |
| `created_at` | `timestamptz` | default `now()` |
| `beard_condition` | `text` | — |
| `brow_condition` | `text` | — |
| `scan_hour` | `integer` | — |
| `season` | `text` | — |
| `scan_type` | `text` | CHECK: `first | rescan` (`phase_3a_beard_goal_taxonomy.sql:22-25`) |
| `fitzpatrick_scale` | `integer` | — |
| ~~`skin_tone`~~ | `text` | **DROPPED** `phase_xi_drop_deadwood.sql:71` |
| `skin_undertone` | `text` | — |
| ~~`skin_age`~~ | `integer` | **DROPPED** |
| `skin_concerns_detailed` | `jsonb` | added `phase_4a3_skin_concerns_detailed_column.sql:19`; GIN index |

### 2.3 `public.routine_checkins`

Source: `phase_c_habit_engine.sql:15-29`. **10 columns**.

```sql
CREATE TABLE IF NOT EXISTS routine_checkins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_id         uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  step_id         text NOT NULL,
  date            date NOT NULL,
  time_of_day     text NOT NULL CHECK (time_of_day IN ('am','pm','weekly','monthly','daily')),
  completed_at    timestamptz,
  kit_item_id     uuid,
  superseded      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, step_id, date)
);
```

FK on `kit_item_id` is added separately in `phase_c_habit_engine.sql:69-71`:

```sql
ALTER TABLE routine_checkins
  ADD CONSTRAINT fk_routine_checkins_kit_item
  FOREIGN KEY (kit_item_id) REFERENCES user_kit(id) ON DELETE SET NULL;
```

`updated_at` is maintained by trigger `trg_routine_checkins_updated_at` →
`set_updated_at()` (`phase_c_habit_engine.sql:118-129`).

### 2.4 `public.user_kit` — this is the table the brief calls "kit_items"

Source: `phase_c_habit_engine.sql:44-56`. **10 columns.** There is no
`kit_items` table; there never was. Every code reference uses `user_kit` —
see §8.

```sql
CREATE TABLE IF NOT EXISTS user_kit (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id               text NOT NULL,
  step_id                  text,
  acquired_via             text NOT NULL CHECK (acquired_via IN ('lume_affiliate','already_owned','replaced')),
  acquired_at              timestamptz NOT NULL DEFAULT now(),
  last_reorder_at          timestamptz,
  estimated_duration_days  integer,
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
```

`product_id` is a **text** id pointing into the bundled JSON catalogue
(`constants/products.json`) — see §9. There is no FK because there is no
products table.

### 2.5 `public.routine_logs` (created in Phase XI)

Source: `phase_xi_create_missing_tables.sql:52-61`. **8 columns.**

```sql
create table if not exists public.routine_logs (
  id            uuid         primary key default gen_random_uuid(),
  user_id       uuid         references public.users(id) on delete cascade,
  scan_id       uuid         references public.scans(id) on delete set null,
  step_label    text         not null,
  step_product  text,
  category      text,
  completed_at  timestamptz  not null default now(),
  created_at    timestamptz  not null default now()
);
```

This is **not** the same as `routine_checkins`. The design intent is
documented in `phase_xi_create_missing_tables.sql:46-50`: *"Records each
routine step the user completes. Written by services/scanService.ts
logRoutineStep() after a step is checked off."* In practice it duplicates
adherence telemetry and overlaps significantly with `routine_checkins.completed_at` —
see §11 for the contradiction.

### 2.6 `public.product_events` (telemetry)

Source: `phase_00_baseline_telemetry.sql:115-125`, then FKs corrected in
`phase_xi_fixes_and_indexes.sql:82-91`. **9 columns.**

```sql
create table if not exists public.product_events (
  id            uuid         primary key default gen_random_uuid(),
  user_id       uuid         references public.users(id) on delete cascade,  -- standardised in phase_xi
  scan_id       uuid         references public.scans(id)  on delete set null, -- standardised in phase_xi
  product_id    text         not null,
  product_name  text,
  brand         text,
  category      text,
  event_type    text,
  created_at    timestamptz  default now()
);
```

### 2.7 `public.product_usage` (created in Phase XI)

Source: `phase_xi_create_missing_tables.sql:90-100`. **9 columns.**

```sql
create table if not exists public.product_usage (
  id            uuid         primary key default gen_random_uuid(),
  user_id       uuid         references public.users(id) on delete cascade,
  scan_id       uuid         references public.scans(id) on delete set null,
  product_id    text         not null,
  product_name  text,
  brand         text,
  category      text,
  using_it      boolean,
  created_at    timestamptz  not null default now()
);
```

`using_it` is documented (`phase_xi_create_missing_tables.sql:33-38`) as
*"reserved for the planned product recommendation engine rebuild. The
application currently writes it as null on every insert."* See §11 — the
prior Phase XI cleanup commit mentions the call-site was *removed* in the
process of dropping `logProductEvent`, so this table may now be receiving
nothing at all. Needs verification (§11).

### 2.8 `public.scan_deltas`

Source: `phase_c_habit_engine.sql:80-105`, with `user_feedback` added in
`phase_f_scan_deltas.sql:43`. **15 columns.**

```sql
CREATE TABLE IF NOT EXISTS scan_deltas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_scan_id           uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  to_scan_id             uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  days_between           integer NOT NULL,
  score_changes          jsonb NOT NULL DEFAULT '{}'::jsonb,
  concerns_improved      text[] NOT NULL DEFAULT ARRAY[]::text[],
  concerns_new           text[] NOT NULL DEFAULT ARRAY[]::text[],
  concerns_persistent    text[] NOT NULL DEFAULT ARRAY[]::text[],
  adherence_overall      numeric(5,2),
  adherence_by_category  jsonb NOT NULL DEFAULT '{}'::jsonb,
  adherence_weekly       jsonb NOT NULL DEFAULT '[]'::jsonb,
  streak_longest         integer,
  streak_at_rescan       integer,
  freezes_used           integer NOT NULL DEFAULT 0,
  products_used          jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_feedback          jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (to_scan_id)
);
```

### 2.9 `public.gemini_usage`

Source: `phase_00_baseline_telemetry.sql:59-73`. **13 columns** (one is
generated).

```sql
create table if not exists public.gemini_usage (
  id              uuid         primary key default gen_random_uuid(),
  user_id         uuid         references public.users(id) on delete cascade, -- standardised in phase_xi
  scan_id         uuid         references public.scans(id) on delete set null,
  call_type       text         not null,                       -- CHECK enum, see §4
  model           text         not null,
  input_tokens    integer      not null,
  output_tokens   integer      not null,
  cost_usd        numeric      not null,
  duration_ms     integer      not null,
  success         boolean      not null default true,
  error_message   text,
  created_at      timestamptz  not null default now(),
  cost_inr        numeric      generated always as (cost_usd * 95::numeric) stored
);
```

### 2.10 `public.user_milestones`

Source: `phase_e_milestones.sql:7-15`. **6 columns** + UNIQUE (user, key).

```sql
CREATE TABLE IF NOT EXISTS user_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_key   text NOT NULL,
  earned_at       timestamptz NOT NULL DEFAULT now(),
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  celebrated      boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, milestone_key)
);
```

### 2.11 Salon tables — captured for completeness, not relevant to Phase XII

- `salon_profiles` — `phase_x_discover_salon_rebuild.sql:13-34` (24 columns).
- `salon_ratings` — `phase_x_discover_salon_rebuild.sql:37-50` (12 columns), then UNIQUE `(user_id, google_place_id)` added in `phase_x_one_rating_per_user.sql:15-16`.

### 2.12 No `products` (catalog) table exists

There is no `public.products` table. Confirmed by grep of all migrations:
no `create table … products`, only `product_events` and `product_usage`. The
catalogue lives in the bundled JSON file `constants/products.json`, loaded
via `constants/productConstants.ts:8`. See §9.

---

## 3. Foreign-key constraints

Every FK on the public schema, sourced from the migration that introduces it,
with the latest version that overrides it noted.

| From | Column | To | ON DELETE | Defining migration |
|---|---|---|---|---|
| `users` | `referred_by` | `users(id)` | `SET NULL` | `phase_7c_delete_account.sql:11-14` (was `NO ACTION` in baseline) |
| `scans` | `user_id` | `users(id)` | `CASCADE` | `phase_00_baseline_scans.sql:33` |
| `routine_checkins` | `user_id` | `users(id)` | `CASCADE` | `phase_c_habit_engine.sql:17` |
| `routine_checkins` | `scan_id` | `scans(id)` | `CASCADE` | `phase_c_habit_engine.sql:18` |
| `routine_checkins` | `kit_item_id` | `user_kit(id)` | `SET NULL` | `phase_c_habit_engine.sql:69-71` |
| `user_kit` | `user_id` | `users(id)` | `CASCADE` | `phase_c_habit_engine.sql:46` |
| `scan_deltas` | `user_id` | `users(id)` | `CASCADE` | `phase_f_scan_deltas.sql:11` |
| `scan_deltas` | `from_scan_id` | `scans(id)` | `CASCADE` | `phase_f_scan_deltas.sql:12` |
| `scan_deltas` | `to_scan_id` | `scans(id)` | `CASCADE` | `phase_f_scan_deltas.sql:13` |
| `user_milestones` | `user_id` | `users(id)` | `CASCADE` | `phase_e_milestones.sql:9` |
| `gemini_usage` | `user_id` | `users(id)` | `CASCADE` | `phase_xi_fixes_and_indexes.sql:76-79` (was `auth.users` originally) |
| `gemini_usage` | `scan_id` | `scans(id)` | `SET NULL` | `phase_00_baseline_telemetry.sql:62` |
| `product_events` | `user_id` | `users(id)` | `CASCADE` | `phase_xi_fixes_and_indexes.sql:82-85` (was `auth.users`, `NO ACTION`) |
| `product_events` | `scan_id` | `scans(id)` | `SET NULL` | `phase_xi_fixes_and_indexes.sql:88-91` (was `NO ACTION`) |
| `routine_logs` | `user_id` | `users(id)` | `CASCADE` | `phase_xi_create_missing_tables.sql:54` |
| `routine_logs` | `scan_id` | `scans(id)` | `SET NULL` | `phase_xi_create_missing_tables.sql:55` |
| `product_usage` | `user_id` | `users(id)` | `CASCADE` | `phase_xi_create_missing_tables.sql:92` |
| `product_usage` | `scan_id` | `scans(id)` | `SET NULL` | `phase_xi_create_missing_tables.sql:93` |
| `salon_profiles` | `created_by` | `users(id)` | `SET NULL` | `phase_x_discover_salon_rebuild.sql:31` |
| `salon_ratings` | `user_id` | `users(id)` | `SET NULL` | `phase_7c_delete_account.sql:17-21` (was `CASCADE`) |

`delete_user()` RPC body is in `phase_7c_delete_account.sql:24-37` and depends
on the cascade matrix above being correct.

---

## 4. CHECK constraints

| Constraint name | Table | Predicate | Source |
|---|---|---|---|
| `users_age_range_check` | users | `age_range IN ('18-25','26-35','36-45','46-55','55+')` | `phase_00_baseline_users_and_helpers.sql:71-74` |
| `users_beard_goal_check` | users | `beard_goal IS NULL OR beard_goal IN ('fuller','sharper','shorter','longer','none')` | `phase_3a_beard_goal_taxonomy.sql:18-20` (replaced earlier `clean_simple|healthy_groomed|growing_thickening|styled` enum from `phase_d_prescription_routine.sql`) |
| `users_gender_check` | users | `gender IS NULL OR gender IN ('man','woman')` | `phase_x_gender_binary.sql:11-13` (originally allowed `other`, `prefer_not_to_say`) |
| `scans_face_shape_check` | scans | `IN ('oval','round','square','heart','oblong','diamond')` | `phase_00_baseline_scans.sql:79-82` |
| `scans_skin_type_check` | scans | `IN ('oily','dry','combination','normal','sensitive')` | `phase_00_baseline_scans.sql:84-87` |
| `scans_beard_density_check` | scans | `IN ('none','light','medium','heavy')` | `phase_00_baseline_scans.sql:99-102` |
| `scans_undereye_check` | scans | `IN ('dark_circles','puffiness','normal','dark','puffy','hollow')` | `phase_00_baseline_scans.sql:109-112` (note: 6 values — `dark` and `dark_circles` are both legal) |
| `scans_scan_type_check` | scans | `scan_type IS NULL OR scan_type IN ('first','rescan')` | `phase_3a_beard_goal_taxonomy.sql:23-25` |
| `scans_score_skin_check` | scans | `0..100` | `phase_00_baseline_scans.sql:119-122` |
| `scans_score_beard_check` | scans | `0..100` | `phase_00_baseline_scans.sql:129-132` |
| `scans_score_makeup_check` | scans | `0..100` | `phase_00_baseline_scans.sql:134-137` |
| `scans_score_overall_check` | scans | `0..100` | `phase_00_baseline_scans.sql:139-142` |
| `routine_checkins_time_of_day_check` (anonymous) | routine_checkins | `time_of_day IN ('am','pm','weekly','monthly','daily')` | `phase_c_habit_engine.sql:21` |
| `user_kit_acquired_via_check` (anonymous) | user_kit | `acquired_via IN ('lume_affiliate','already_owned','replaced')` | `phase_c_habit_engine.sql:49` |
| `gemini_usage_call_type_check` | gemini_usage | `call_type IN ('vision','skin_recs','hair_recs','beard_recs','makeup_recs','delta_commentary')` | `phase_xi_fixes_and_indexes.sql:54-64` (expanded from the 3-value baseline) |
| `salon_profiles_price_range_check` (anonymous) | salon_profiles | `IN ('budget','mid','premium','luxury')` | `phase_x_discover_salon_rebuild.sql:26` |
| `salon_profiles_booking_interest_check` (anonymous) | salon_profiles | `IN ('yes','maybe','no')` | `phase_x_discover_salon_rebuild.sql:27` |
| `salon_profiles_verification_status_check` (anonymous) | salon_profiles | `IN ('pending','verified','rejected')` | `phase_x_discover_salon_rebuild.sql:29` |
| `salon_ratings_rating_overall_check` etc. (anonymous) | salon_ratings | `BETWEEN 1 AND 5` | `phase_x_discover_salon_rebuild.sql:42-46` |

Auto-dropped CHECK constraints from the dead-column drops (Postgres auto-drops
dependent constraints): `scans_brow_shape_check`, `scans_hair_texture_check`,
`scans_hair_condition_check`, `scans_score_hair_check` — see
`phase_xi_drop_deadwood.sql:46-49`.

There is no CHECK on `routine_logs.category` or `product_usage.category` —
deliberate, see `phase_xi_create_missing_tables.sql:29-31`: *"the free-text
approach lets the vocabulary evolve as product features are built without
requiring migration churn."*

---

## 5. Indexes

Listed by table with the migration that creates each.

### `users`
- `users_referral_code_key` UNIQUE on `(referral_code)` — `phase_00_baseline_users_and_helpers.sql:91-92`

### `scans`
- `scans_pkey` (auto, on `id`)
- `scans_skin_concerns_detailed_gin_idx` GIN on `(skin_concerns_detailed)` — `phase_00_baseline_scans.sql:156-158`
- `idx_scans_user_created` on `(user_id, created_at DESC)` — `phase_xi_fixes_and_indexes.sql:103-104`

### `routine_checkins`
- `routine_checkins_pkey`
- `routine_checkins_user_id_step_id_date_key` UNIQUE on `(user_id, step_id, date)` — from the `UNIQUE` clause in `phase_c_habit_engine.sql:28`
- `idx_routine_checkins_user_date` on `(user_id, date DESC)` — `phase_c_habit_engine.sql:33`
- `idx_routine_checkins_user_step` on `(user_id, step_id)` — line 34
- `idx_routine_checkins_scan` on `(scan_id)` — line 35
- `idx_routine_checkins_adherence` partial on `(user_id, date, superseded) WHERE superseded = false` — line 36
- `idx_routine_checkins_kit_item` partial on `(kit_item_id) WHERE kit_item_id IS NOT NULL` — `phase_xi_fixes_and_indexes.sql:137-139`

### `user_kit`
- `user_kit_pkey`
- `idx_user_kit_active_step` UNIQUE partial on `(user_id, step_id) WHERE is_active = true AND step_id IS NOT NULL` — `phase_c_habit_engine.sql:60-62`
- `idx_user_kit_user_active` on `(user_id, is_active)` — line 64
- `idx_user_kit_reorder` on `(user_id, last_reorder_at)` — line 65
- `idx_user_kit_affiliate` partial on `(acquired_via) WHERE acquired_via = 'lume_affiliate'` — line 66

### `scan_deltas`
- `scan_deltas_pkey`
- `scan_deltas_to_scan_id_key` UNIQUE on `(to_scan_id)` — UNIQUE clause `phase_f_scan_deltas.sql:35`
- `idx_scan_deltas_user` on `(user_id, computed_at DESC)` — `phase_f_scan_deltas.sql:45`
- `idx_scan_deltas_to_scan` on `(to_scan_id)` — line 46
- `idx_scan_deltas_from_scan` on `(from_scan_id)` — `phase_xi_fixes_and_indexes.sql:142-143`

### `user_milestones`
- `user_milestones_pkey`
- `user_milestones_user_id_milestone_key_key` UNIQUE on `(user_id, milestone_key)` — UNIQUE clause `phase_e_milestones.sql:14`
- `idx_user_milestones_user` on `(user_id, earned_at DESC)` — line 19
- `idx_user_milestones_uncelebrated` partial on `(user_id, celebrated) WHERE celebrated = false` — line 20

### `gemini_usage`
- `gemini_usage_pkey`
- `idx_gemini_usage_created` on `(created_at DESC)` — `phase_00_baseline_telemetry.sql:96-97`
- `idx_gemini_usage_scan` partial on `(scan_id) WHERE scan_id IS NOT NULL` — line 99
- `idx_gemini_usage_user_created` on `(user_id, created_at DESC)` — line 103
- `idx_gemini_usage_call_type_created` on `(call_type, created_at DESC)` — `phase_xi_fixes_and_indexes.sql:133-134`

### `product_events`
- `product_events_pkey`
- 5 indexes added in `phase_xi_fixes_and_indexes.sql:114-130`: `idx_product_events_user_created`, `idx_product_events_scan` (partial), `idx_product_events_product_created`, `idx_product_events_category_created` (partial), `idx_product_events_event_type` (partial)

### `routine_logs`
- `routine_logs_pkey`
- `idx_routine_logs_user_completed` on `(user_id, completed_at DESC)` — `phase_xi_create_missing_tables.sql:68-69`
- `idx_routine_logs_scan` partial on `(scan_id) WHERE scan_id IS NOT NULL` — line 71
- `idx_routine_logs_category_completed` partial — line 75

### `product_usage`
- `product_usage_pkey`
- `idx_product_usage_user_created`, `idx_product_usage_scan` partial, `idx_product_usage_product_created`, `idx_product_usage_category_created` partial — `phase_xi_create_missing_tables.sql:107-119`

### `salon_profiles` / `salon_ratings`
- `idx_salon_profiles_place_id`, `idx_salon_profiles_verification` partial — `phase_x_discover_salon_rebuild.sql:53-55`
- `idx_salon_profiles_created_by` partial — `phase_xi_fixes_and_indexes.sql:146-148`
- `idx_salon_ratings_place_id` — `phase_x_discover_salon_rebuild.sql:52`
- `salon_ratings_user_place_unique` UNIQUE on `(user_id, google_place_id)` — `phase_x_one_rating_per_user.sql:15-16`

---

## 6. RLS policies

All policies are `auth.uid() = user_id` scoped except where noted.

### `users` — `phase_00_baseline_rls.sql:77-90`
- `users_insert_own` (INSERT, `auth.uid() = id`)
- `users_select_own` (SELECT, `auth.uid() = id`)
- `users_update_own` (UPDATE, `auth.uid() = id`)
- No DELETE policy — account deletion goes through `delete_user()` RPC (SECURITY DEFINER).

### `scans` — `phase_00_baseline_rls.sql:99-117`
- `scans_insert_own`, `scans_select_own`, `scans_update_own`, `scans_delete_own` (full CRUD scoped to `auth.uid() = user_id`)

### `routine_checkins` — `phase_c_habit_engine.sql:142-148`
- `"Users manage own checkins"` FOR ALL USING/WITH CHECK `auth.uid() = user_id`

### `user_kit` — `phase_c_habit_engine.sql:151-157`
- `"Users manage own kit"` FOR ALL

### `scan_deltas` — `phase_f_scan_deltas.sql:48-56` (also `phase_c_habit_engine.sql:160-170`, both idempotent)
- `"Users read own deltas"` FOR SELECT
- `"Users insert own deltas"` FOR INSERT WITH CHECK
- No UPDATE/DELETE policies.

### `user_milestones` — `phase_e_milestones.sql:22-30`
- `"Users read own milestones"` FOR SELECT
- `"Users write own milestones"` FOR ALL

### `gemini_usage` — `phase_00_baseline_rls.sql:129-132`
- `gemini_usage_insert_own` only. **No SELECT policy** — see header at `phase_00_baseline_rls.sql:27-33`: *"AI cost telemetry is operator-facing data that should not be exposed to client roles."*

### `product_events` — `phase_00_baseline_rls.sql:143-146`
- `product_events_insert_own` only. No SELECT.

### `routine_logs` — `phase_xi_create_missing_tables.sql:142-145`
- `routine_logs_insert_own` only. No SELECT — same write-only-from-client pattern.

### `product_usage` — `phase_xi_create_missing_tables.sql:147-150`
- `product_usage_insert_own` only. No SELECT.

### `salon_profiles` — `phase_x_discover_salon_rebuild.sql:63-68`
- `"Read all profiles"` FOR SELECT USING `auth.role() = 'authenticated'` — **NOT scoped to user**.
- `"Insert claim"` FOR INSERT WITH CHECK `auth.uid() = created_by`
- `"Update own pending claim"` FOR UPDATE USING `auth.uid() = created_by AND verification_status = 'pending'`

### `salon_ratings` — `phase_x_discover_salon_rebuild.sql:71-74`
- `"Read all ratings"` FOR SELECT USING `auth.role() = 'authenticated'` — **NOT scoped to user**.
- `"Insert own rating"` FOR INSERT WITH CHECK `auth.uid() = user_id`

The `ensure_rls` event trigger (`phase_00_baseline_users_and_helpers.sql:227-231`) auto-enables RLS on every new public table, so any future tables get RLS on by default.

---

## 7. Recommendations payload structure

This is the source-of-truth answer to "what is actually inside the
`scans.recommendations` JSONB column."

### 7.1 The TypeScript root shape — `types/index.ts:330-337`

```ts
export interface Recommendations {
  observation: ScanObservation;            // always present — first reveal after scan
  skin:        SkinRecommendation;
  beard:       BeardRecommendation | null; // men only
  makeup:      MakeupRecommendation | null;// women only
  products:    ProductRecommendation[];    // all matched products across sections
  delta_commentary?: DeltaCommentaryStored | null; // rescans only
}
```

### 7.2 How it gets assembled — `services/scanService.ts:runScanPhase2`

The pre-write at `services/scanService.ts:685-691` plants the initial shape:

```ts
const initialRecommendations: Recommendations = {
  observation: observation as Recommendations['observation'],
  skin:        { advice: '', steps: [] },
  beard:       null,
  makeup:      null,
  products:    productRecs,
};
```

then `writeRecommendationSection` (line 476) read-modify-writes per-section
slices in. The flow:

1. **`observation`** is produced in Phase 1 by the vision call (`lib/gemini/vision.ts`) and is already attached to `analysis.observation` by the time Phase 2 starts. Stamped on the row in the pre-write at line 683.
2. **`products`** is built synchronously by `buildProductRecommendations` (line 449-469) from the scoring engine's output — see §9.
3. **`skin`** — generated by `getSkinRecommendations` (`lib/gemini/skin.ts:156`), written by `writeRecommendationSection(scanId, 'skin', skin)` at line 750.
4. **`beard`** — generated when `beardApplicable` (line 675-678) is true, by `getBeardRecommendations` (`lib/gemini/beard.ts:126`).
5. **`makeup`** — generated when `needsMakeup` (a regen-decision based on `makeup_recommendations_meta`, line 666-672) and `careCategories.includes('makeup')`. Written by `writeRecommendationSection` AND separately persisted at the user level via `saveMakeupRecs` at line 786.
6. **`delta_commentary`** — generated for rescans only (line 813), written by `generateAndStoreDeltaCommentary` at line 514.

### 7.3 Per-section TS shapes — types/index.ts

`SkinRecommendation` (`types/index.ts:226-236`):

```ts
export interface SkinRecommendation {
  advice:        string;
  steps?:        RoutineStep[];
  routine_note?: string;   // 2-3 sentence editorial meta-observation, pulled-quote
  /** @deprecated */ routine?: { morning: RoutineStep[]; evening: RoutineStep[] };
  /** @deprecated */ summary?: string;
}
```

`RoutineStep` (`types/index.ts:213-224`):

```ts
export interface RoutineStep {
  step_id:             string;        // canonical id, e.g. "skin_cleanse", "skin_treat_1", "beard_wash"
  label:               string;
  product:             string;
  level:               string;        // legacy field, retained
  order:               number;
  time_of_day?:        ('am' | 'pm')[]; // required on new-schema steps
  target_concern?:     string;        // populated only for Treat steps
  clinical_reasoning?: string;
  category?:           string;
  cadence?:            'daily' | 'every_wash' | 'weekly' | 'monthly';
}
```

`BeardRecommendation` (`types/index.ts:247-255`):

```ts
export interface BeardRecommendation {
  advice:             string;
  beard_shape_intro?: string | null;
  beard_styles?:      BeardStyleItem[];
  steps?:             RoutineStep[]; // beard_wash, beard_oil, beard_balm
  /** @deprecated */ summary?: string;
}
```

`MakeupRecommendation` (`types/index.ts:286-293`):

```ts
export interface MakeupRecommendation {
  advice:      string;
  techniques:  string[];
  palette?:    MakeupPalette | null;
  /** @deprecated */ summary?: string;
}
```

`ProductRecommendation` (`types/index.ts:204-211`):

```ts
export interface ProductRecommendation {
  category:    string;
  name:        string;
  brand:       string;
  attributes?: string[];
  reason:      string;
  match_score: number;
}
```

`HairRecommendations` (`types/index.ts:131-147`) — **not stored on the scan;
stored on `users.hair_recommendations` instead.** Comment at
`services/scanService.ts:856-858` confirms: *"hair_recommendations is no
longer written here. Scans reuse the recs already stored on users."*

`ScanObservation` (`types/index.ts:306-312`):

```ts
export interface ScanObservation {
  title:        string;
  issue_label:  string;
  dek:          string;
  insights:     [ScanInsight, ScanInsight, ScanInsight];
  trait_chips:  string[];
}
```

`DeltaCommentaryStored` (`types/index.ts:323-328`):

```ts
export interface DeltaCommentaryStored {
  cover_dek:     string;
  cover_lines:   [DeltaDekLine, DeltaDekLine, DeltaDekLine];
  concern_notes: { [concernKey: string]: string };
  closing_line:  string;
}
```

### 7.4 The step_id taxonomy that ends up inside the JSONB

This is the union of values the prompt builders are allowed to emit. The
codebase has no canonicalization layer — what Gemini emits is what gets
written to `routine_checkins.step_id` after the `_am`/`_pm` slot suffix is
appended (for skin only) at scheduling time.

| Section | step_id values (canonical, from prompts) | Source |
|---|---|---|
| Skin | `skin_cleanse`, `skin_treat_1`, `skin_treat_2`, `skin_moisturize`, `skin_protect` (with `_am` / `_pm` slot suffix appended at scheduling time, e.g. `skin_cleanse_am`) | `lib/gemini/skin.ts:85`, suffixing at `lib/habit.ts:391` |
| Hair | `hair_shampoo`, `hair_conditioner`, `hair_oil`, `hair_serum`, `hair_mask` | `lib/gemini/hair.ts:111-112,162` |
| Beard | `beard_wash`, `beard_oil`, `beard_balm` | `lib/gemini/beard.ts:30,82` |

`time_of_day` enum on the step (skin only): `["am"] | ["pm"] | ["am","pm"]`
— `lib/gemini/skin.ts:87`. **Beard prompt does not specify `time_of_day`**
on steps. Hair uses `cadence` instead — `every_wash | weekly | monthly`
(`lib/gemini/hair.ts:114, 164`).

A live sample of `recommendations` for Prateek's most recent scan would
require a `SELECT` against the `scans` table. The anon key won't return rows
that don't match `auth.uid() = user_id`. Query is in §11.

---

## 8. References to "kit_items" in code

**Zero.** Grep result for `kit_items` (literal word boundary):

```
No matches found
```

The brief uses "kit_items" but every code and migration reference is to the
**`user_kit`** table (with the `kit_item_id` column on `routine_checkins`
referring back to a row in `user_kit` — note "item" appears in the column
name on the *referrer* side, but the **referenced table is `user_kit`**).

Canonical references to `user_kit` in code:

| File:line | What it does |
|---|---|
| `services/kitService.ts:1` | Module header: *"Kit service — user_kit CRUD + helpers for linking products to routine steps."* |
| `services/kitService.ts:47, 57, 88, 100, 109` | The five `.from('user_kit')` calls covering insert, select, update of `is_active`, `last_reorder_at` updates, and the read-by-step lookup |
| `lib/profileData.ts:213` | `.from('user_kit')` used to load active kit for the Profile screen |
| `components/detail/ProductDetailSheet.tsx:92` | `.from('user_kit')` used to check whether a product is in the user's kit |
| `services/deltaService.ts:245` | `.from('user_kit')` used by `computeAndStoreScanDelta` to gather `products_used` |
| `app/(profile)\my-kit.tsx`, `app/(profile)\add-from-routine.tsx` | UI screens that call `kitService` functions |
| `services/habitService.ts:455` | Comment: *"skin_cleanse_pm) while user_kit / picker uses the base id (skin_cleanse)"* — confirms the slot-suffix asymmetry between checkins and kit |
| `services/habitService.ts` | `backfillKitItemIdForStep` (line 457), `recordCheckin(userId, stepId, date, kitItemId?)` (line 162) — write the `kit_item_id` linkage |

Cascading deletes via `user_kit`:
- `phase_7c_delete_account.sql:32` comment lists `user_kit` as a CASCADE child of `users`.
- `routine_checkins.kit_item_id → user_kit(id) ON DELETE SET NULL`
  (`phase_c_habit_engine.sql:69-71`) — deleting a kit row keeps the
  adherence rows but unlinks them.

**Recommendation for the brief**: rename "kit_items" to "user_kit" wherever
the docs reference it. The only place "kit" appears as a word-pair is in
column name `kit_item_id`.

---

## 9. References to product catalog / recommendation engine

The recommendation engine has two pieces:

1. **Static catalog** at `constants/products.json`, loaded by
   `constants/productConstants.ts`. **There is no products table in the database.**
2. **Scoring engine** at `constants/productConstants.ts:310 getScoredProducts`, with the wrapper `getProductsForProfile` at `constants/productConstants.ts:511` (line range from grep) that takes a list of `{ category, target_concern? }` pairs and returns a `Record<canonical, MatchedProduct[]>`.

Catalog product shape — `constants/productConstants.ts:29-50`:

```ts
export interface Product {
  id:                     string;
  name:                   string;
  brand:                  string;
  brand_tier:             BrandTier;          // 7-value enum
  category:               string;             // canonical (CANONICAL_CATEGORIES at line 105)
  price_inr:              number;
  price_tier:             PriceTier;          // 'entry' | 'mid' | 'premium'
  actives:                string[];
  fragrance_free:         boolean;
  suitable_for_concerns:  string[];           // values match the canonical concern enum (§10)
  suitable_skin_types:    string[];
  climate_suitability:    string[];
  trusted_by_beginners:   boolean;
  is_ayurvedic:           boolean;
  primary_concern_target: string;             // single-value version of suitable_for_concerns
  hero_line:              string | null;
  retailer_urls:          { nykaa?: string; amazon?: string; brand_direct?: string };
  isPreferredBrand?:      boolean;            // runtime flag, not in JSON
}
```

Canonical category enum (28 values) — `constants/productConstants.ts:105-134`:

```
face_cleanser, moisturizer, serum_niacinamide, serum_hyaluronic_acid,
serum_vitamin_c, serum_retinol, serum_salicylic_acid, serum_azelaic_acid,
serum_brightening, serum_soothing, spf_sunscreen, toner, eye_cream,
face_mask, face_oil, face_gel, beard_wash, beard_oil, beard_balm,
hair_shampoo, hair_conditioner, hair_oil, hair_serum, hair_mask,
brow_pencil, concealer, foundation_base, bb_cream
```

Scoring weights — `constants/productConstants.ts:333-389`:
- baseline +50 for category match
- preferred-brand +15
- price-tier exact +20, +1 above −10, +2 above −30
- new-user × `trusted_by_beginners` +10
- concern overlap up to +10 (capped, +3 each)
- direct `target_concern` match +15 (line 354-358)
- skin-type supports / 'all' +5; skin-type mismatch −20
- climate match +5
- beard-goal × beard-conditioning-actives +10 (only for `fuller`/`longer`)
- ayurvedic without ayurvedic brand pref −15

There is no rebuild or replacement product engine in code — `phase_xi_create_missing_tables.sql:33-38` and the `using_it` field on `product_usage` reference *"the planned product recommendation engine rebuild"* but no parallel new engine exists in the source tree. The catalog and scorer are still the only ones running.

How `recommendations.products` is built — `services/scanService.ts:449-469`:

```ts
function buildProductRecommendations(
  productMap: Record<string, MatchedProduct[]>,
): ProductRecommendation[] {
  const out: ProductRecommendation[] = [];
  for (const [, products] of Object.entries(productMap)) {
    const top = products[0];
    if (!top) continue;
    out.push({
      category:    top.category,
      name:        top.name,
      brand:       top.brand,
      attributes:  top.attributes,
      reason:      top.why_this_one ?? top.why_good ?? '',
      match_score: ((top as unknown as { score?: number }).score ?? 80) | 0,
    });
  }
  return out;
}
```

---

## 10. Concerns and targets in recommendations

### 10.1 Canonical concern enum

Source of truth: `lib/gemini/skin.ts:53-57`:

```
acne | oiliness | dehydration | dryness | sensitivity | uneven_texture |
fine_lines | dullness | hyperpigmentation | uneven_tone | dark_circles |
puffiness | dandruff | oily_scalp | dry_scalp | itchy_scalp | hair_fall |
frizz | damage | dullness_hair | patchiness | rough_texture | itchiness_beard
```

23 values total. The prompt comment at line 59-60 says *"Never emit synonyms
like 'post-acne marks', 'sebum regulation', 'skin thinning'. Use canonical
form. Catalog scoring relies on exact string equality."*

Normalisation: `lib/gemini/skin.ts:230-246` runs every Gemini-emitted
`target_concern` through `normalizeConcern` from `constants/concerns`; if
unresolvable, the field is **dropped** rather than passed through (line 242).

### 10.2 Where `target_concern` is populated and read

- **Set on Treat steps only** — prompt: `lib/gemini/skin.ts:49` (*"Each Treat step requires target_concern."*) and `lib/gemini/skin.ts:89` (REQUIRED for Treat steps, omit otherwise).
- **Stored** on each step inside `recommendations.skin.steps[].target_concern` (and ends up on `routine_checkins` only via `meta` reads — see below).
- **Read by**:
  - `constants/productConstants.ts:354-358` — scorer adds +15 when `product.suitable_for_concerns.includes(target_concern)`.
  - `services/habitService.ts:351, 425` — included in `RoutineDayStep.target_concern` returned to the routine UI.
  - `app/skin-detail.tsx:92` — passed into the catalogue resolver to nudge picker preference.
  - `app/(profile)/add-from-routine.tsx:53,59,105` — same.
  - `services/scanService.ts:1563` — passed into a delta/refresh routine builder.
- **NOT a column** on `routine_checkins`. The schema persists only `step_id, date, time_of_day` and the link to a kit_item; `target_concern` lives only on the JSONB recommendations.

### 10.3 Per-section concern flow

| Section | Concern field on the step | How it's populated |
|---|---|---|
| Skin | `target_concern` on Treat steps | Gemini output, normalised at `lib/gemini/skin.ts:230-246` |
| Hair | None at the step level. Hair-side concern is captured upstream on `users.hair_profile.primary_concern` (string array) and read in the prompt at `lib/gemini/hair.ts:55-56`. | — |
| Beard | None at the step level. Beard prompt is driven by `users.beard_goal` only (`lib/gemini/beard.ts:26-27`). | — |

### 10.4 `skin_concerns_detailed` — the per-concern severity record

Stored on `scans.skin_concerns_detailed` (jsonb, GIN-indexed). Shape from
`types/index.ts:15-21`:

```ts
export interface SkinConcernObservation {
  concern:        string;                      // canonical, e.g. "dehydration"
  severity:       'mild' | 'moderate' | 'significant';
  zones?:         string[];                    // e.g. ["t_zone", "cheeks"]
  notes?:         string;
  display_label?: string;
}
```

Severity drives prompt intensity guidance — `lib/gemini/skin.ts:72-75`:
*"mild → gentler active … significant → stronger concentration or combined
actives, framed with a realistic timeline and a suggestion to consult a
dermatologist if no change in 12 weeks."*

---

## 11. Surprises and contradictions vs. the prior reports

### A. The brief's "kit_items" terminology does not exist in code

The table is named **`user_kit`**. There are zero references to `kit_items` as a literal token anywhere in the codebase or migrations. Anywhere the Phase XII brief mentions `kit_items`, that should be read as `user_kit`. The column `kit_item_id` is on `routine_checkins`, and it's a foreign key to `user_kit(id)`.

### B. There is no products table — the catalog is bundled JSON

The Phase XII brief (and several prior reports' descriptions of "the recommendation engine") imply a database-backed catalog. There isn't one. `constants/products.json` is loaded into memory at app start, validated/filtered to new-schema entries by `constants/productConstants.ts:91`, and queried from there. `product_id` columns on `user_kit`, `product_events`, `product_usage` are bare text fields with no FK — they store the JSON catalog's `id` field.

This has consequences for any "products are stale" / "swap catalog" workflow: it ships in the JS bundle. Updating products requires an app release, not a DB migration.

### C. `routine_logs` is a near-duplicate of `routine_checkins.completed_at`

`routine_logs` was created in `phase_xi_create_missing_tables.sql:52-61` to back a silently-failing insert in `services/scanService.ts:logRoutineStep`. But the `routine_checkins` table already records check-ins via `completed_at`. The two systems carry similar information:

- `routine_checkins`: structural — pre-generated rows per (user, step_id, date) with `completed_at` set on tap. Used for adherence math.
- `routine_logs`: append-only — one row per tap with `step_label`, `step_product`, `category`, `completed_at`. Used for analytics.

The most recent commits message (`b0ff9de phase_xi cleanup: wire up routine telemetry; remove dead logProductEvent`) implies the codebase is leaning *toward* keeping `routine_logs` and removing other telemetry. But the design redundancy with `routine_checkins.completed_at` is unresolved. This may be a Phase XII decision point: do we keep both, or fold `routine_logs` into a view over `routine_checkins`?

### D. `product_usage` may now be receiving zero writes

`phase_xi_create_missing_tables.sql:33-38` says the table was created as a forward-investment for the rebuilt product engine, but the same Phase XI commit message (`b0ff9de … remove dead logProductEvent`) suggests the only call site that wrote to it was deleted. If that's true, `product_usage` is currently a write-target with no writer. Verify with the live query at the bottom of this section.

### E. The skin step_id slot suffix is not visible in the scan recommendations

`lib/gemini/skin.ts:85` documents skin step_ids as `skin_cleanse`, `skin_treat_1`, etc. But `routine_checkins.step_id` stores `skin_cleanse_am` and `skin_cleanse_pm` — the suffix is added at scheduling time at `lib/habit.ts:391`. So a `SELECT step_id FROM routine_checkins WHERE user_id = X` will return slot-suffixed ids that will not match the unsuffixed ids inside `scan.recommendations.skin.steps[].step_id`. This is a real source of cross-system join confusion that has bitten the codebase before — `services/habitService.ts:455` carries a comment about it.

### F. `target_concern` is in the JSONB but not in routine_checkins

`target_concern` exists on `RoutineStep` (`types/index.ts:220`) and survives in `recommendations.skin.steps[].target_concern`, but is **not** persisted on `routine_checkins`. To get the concern for a given check-in, code currently has to join through `scan_id → scans.recommendations.skin.steps[step_id]`. Phase XII may want to consider denormalizing `target_concern` onto `routine_checkins` (or a view) to make this lookup ergonomic.

### G. `skin_tone` was dropped, but `skin_undertone` remains

`phase_xi_drop_deadwood.sql:71` drops `scans.skin_tone`, with the comment that it was Gemini-emitted but never read downstream. The `skin_undertone` column is still present and is still used by the makeup palette logic (`services/scanService.ts:668`, `types/index.ts:357`).

### H. `score_beard` and `score_makeup` columns still exist but Gemini no longer fills them

`types/index.ts:362-365` and `:402-404` mark them deprecated as of Phase 6.0. `services/scanService.ts:709-710` writes them as `null` in the pre-write. The CHECK constraints (0..100) still apply when present. Future reads should treat them as definitely-null on new scans. They were not dropped in `phase_xi_drop_deadwood.sql` despite being noted as dead-on-write — could be a candidate drop in a later cleanup.

### I. The `users_beard_goal_check` enum has been replaced once already

`phase_d_prescription_routine.sql` originally defined `beard_goal IN ('clean_simple', 'healthy_groomed', 'growing_thickening', 'styled')`. `phase_3a_beard_goal_taxonomy.sql:18-20` swapped it to `('fuller','sharper','shorter','longer','none')`. The migration's own header notes the DB was truncated before this migration ran, so no orphan rows survived. The current canonical TS enum in `types/index.ts:44-49` matches the post-3A constraint.

### J. `scan_deltas` was created twice, intentionally

It first appears in `phase_c_habit_engine.sql:80-105`, then is **re-asserted** in `phase_f_scan_deltas.sql:9-36` with `IF NOT EXISTS` and an `ALTER TABLE ADD COLUMN IF NOT EXISTS user_feedback`. The header at `phase_f_scan_deltas.sql:5-6` calls this out: the intent is idempotent on both fresh and upgraded databases. Not a bug.

### K. PostgREST blocks information_schema

The brief said the anon key should reach `information_schema` because RLS doesn't apply there. **PostgREST disagrees.** `GET /information_schema/tables?...` returns `PGRST205` — *"Could not find the table 'public.information_schema.tables'"*. PostgREST only exposes tables that are reachable through its schema introspection cache, and it caches `public` (or whatever's in `db-schemas`). To run any of the live-DB queries below, Prateek needs to use the Supabase SQL editor or a `psql` connection with the service role.

### L. Live-DB queries to run (require Prateek)

These verify the things the migration files cannot prove on their own (i.e. that the live DB matches the migration history, and the live row contents).

```sql
-- Confirm the table list matches §1
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public'
 ORDER BY table_name;
-- Expected (12): gemini_usage, product_events, product_usage, routine_checkins,
--   routine_logs, salon_profiles, salon_ratings, scan_deltas, scans,
--   user_kit, user_milestones, users

-- Confirm the gemini_usage call_type CHECK is the expanded version
SELECT pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conname = 'gemini_usage_call_type_check';
-- Expected: vision/skin_recs/hair_recs/beard_recs/makeup_recs/delta_commentary

-- Sanity-check the FKs match §3
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid IN ('routine_checkins'::regclass, 'product_events'::regclass,
                    'gemini_usage'::regclass, 'product_usage'::regclass,
                    'routine_logs'::regclass, 'scan_deltas'::regclass)
   AND contype = 'f'
 ORDER BY conrelid::text, conname;

-- Dump the most recent recommendations for Prateek's most recent scan
SELECT id, scan_type, created_at,
       jsonb_pretty(recommendations) AS recs
  FROM scans
 WHERE user_id = (SELECT id FROM auth.users WHERE email = 'prateek.0718@gmail.com')
 ORDER BY created_at DESC
 LIMIT 1;

-- Compare top-level keys of the recommendations payload across recent scans
SELECT id, created_at,
       (SELECT array_agg(key ORDER BY key)
          FROM jsonb_object_keys(recommendations) AS k(key)) AS top_keys
  FROM scans
 WHERE user_id = (SELECT id FROM auth.users WHERE email = 'prateek.0718@gmail.com')
 ORDER BY created_at DESC
 LIMIT 5;

-- Surface any orphan/mismatched step_ids between routine_checkins and the JSONB
WITH latest AS (
  SELECT id, recommendations FROM scans
   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'prateek.0718@gmail.com')
   ORDER BY created_at DESC LIMIT 1
), recs_steps AS (
  SELECT step->>'step_id' AS step_id
    FROM latest, jsonb_array_elements(recommendations->'skin'->'steps') AS step
  UNION ALL
  SELECT step->>'step_id' FROM latest, jsonb_array_elements(recommendations->'beard'->'steps') AS step
), checkins_steps AS (
  SELECT DISTINCT step_id FROM routine_checkins
   WHERE scan_id = (SELECT id FROM latest)
)
SELECT 'in_recs_only' AS where_, step_id FROM recs_steps EXCEPT SELECT 'in_recs_only', step_id FROM checkins_steps
UNION ALL
SELECT 'in_checkins_only', step_id FROM checkins_steps EXCEPT SELECT 'in_checkins_only', step_id FROM recs_steps;
-- Expected: skin steps appear suffixed (_am/_pm) in routine_checkins but unsuffixed in recommendations — this is the slot-suffix asymmetry from finding (E).

-- Confirm whether product_usage is actively written
SELECT count(*), min(created_at), max(created_at) FROM product_usage;
-- And whether routine_logs is actively written
SELECT count(*), min(created_at), max(created_at) FROM routine_logs;

-- Confirm the FK-reset chain works for delete_user (DRY-RUN — DO NOT COMMIT)
BEGIN;
  -- pretend to delete a test user
  -- DELETE FROM users WHERE id = '<some-test-user>';
ROLLBACK;
```

The contradictions in §11 should drive the Phase XII discussion. Everything in §1–§10 is structural fact derived from migration files + types, and is reproducible without privileged access.
