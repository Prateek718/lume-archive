# Phase XII — Routine redesign: migration + code rewrite plan

> Plan-only document. No SQL has been run. No code has been changed.
> Apply only after Prateek and Claude agree on §10 (open questions).
>
> Locked decisions live in the brief at the top of the conversation.
> This plan operationalises them. Where the plan disagrees with a locked
> decision, it is flagged in §10 — not silently worked around.
>
> Date prepared: 2026-05-09. Revised: 2026-05-09 (v2 locked decisions —
> daily-only schedules, denormalised user_id, target_concern-driven step_type).
> Branch target: `phase-xii-routine-redesign` off `main`.

---

## 0. Mental model

Today's `routine_checkins` is **a pre-materialised 28-day grid** — one row
per (user, step, date) crossbred with a `superseded` flag for rescan
overrides. The new model splits that one table into two:

- `routine_plan_steps` — **the prescription**. ~5–10 rows per scan,
  written once at scan finalize. Frozen display strings (label, product,
  clinical_reasoning) live here so they survive recommendation regen.
  This is the only table Gemini's output flows into.
- `routine_completions` — **the behavioural log**. One row per
  user-tapped completion. Append-only. No pre-scheduling; "what was
  scheduled" is computed from the active scan's plan_steps at read time.

The `superseded` flag becomes redundant — the active scan is whatever
`(user_id, max(created_at))` returns. No flipping bits on a rescan.

This means two things:

1. **Adherence math changes shape.** Today: completed_rows / scheduled_rows.
   Tomorrow: completed_completions / expected_completions, where
   expected_completions is computed from plan_steps × the date range using
   `time_of_day` alone. All steps are daily-cadence (`am`, `pm`, or `daily`);
   no weekly bucketing. (See §3.2.)
2. **Per-day "scheduled count" is no longer a literal table count.**
   `lib/habit.ts:computeDayStatuses` (line 94) currently consumes
   `DayAdherence{date, scheduled_count, completed_count}` aggregated from
   pre-materialised rows. The new shape needs a synthetic
   `scheduled_count` derived from the plan: count of plan_steps in scope
   for the day. Trivial because every plan_step is in scope every day.

---

## 1. Migration files (SQL)

Two new migrations, both idempotent, both following the conventions in
`supabase/migrations/README.md`. Naming: `phase_12_*` per the README's
"new migrations going forward should use `phase_<num>_<name>.sql`" rule.

### 1.1 `supabase/migrations/phase_12_routine_redesign.sql`

**Purpose:** Create `routine_plan_steps` + `routine_completions`.
Drop `routine_checkins`, `routine_logs`, `product_events`, `product_usage`.

**What depends on it:** every code change in §2. Code and migration land
in the same commit (per Phase XI Migration 6 pattern; per locked
decision).

**Rationale points to surface in the file header:**

- Pre-launch (11 real completions) — wiping `routine_checkins` data is
  acceptable; no completion migration. No back-out path needed.
- `routine_logs` is dropped because frozen display strings now live on
  `routine_plan_steps` rather than as analytics emissions
  (resolves §C of the schema verification report).
- `product_events` and `product_usage` are dropped because they have
  zero writers, zero readers, zero callers post-Phase-XI cleanup (per
  the comment block at `services/scanService.ts:1576-1597`); ready to
  be re-added when the affiliate engine lands.
- The `superseded` flag is gone. Active scan = `(user_id, max(created_at))`.

**SQL body** (full DDL, not pseudo-SQL):

```sql
-- =============================================================================
-- Phase 12 — Routine redesign
--
-- Replaces the pre-materialised routine_checkins table with two tables:
--   • routine_plan_steps     — the prescription (one row per logical step per scan)
--   • routine_completions    — the behavioural log (one row per user tap)
--
-- The superseded flag is removed. The "active" plan is the most recent scan
-- (MAX(created_at) for a user). On rescan, a new plan_steps set is written;
-- old completions remain owned by their original scan via scan_id and remain
-- queryable for delta math.
--
-- Drops:
--   • routine_checkins   — replaced by the two new tables
--   • routine_logs       — frozen display strings now live on routine_plan_steps
--   • product_events     — zero writers/readers post-Phase-XI; reinstate when
--                          affiliate engine lands (see scanService.ts:1576-1597)
--   • product_usage      — same
--
-- Pre-launch scope: existing 11 routine_checkins rows are wiped without
-- migration. No back-out migration; rollback path is git revert + Supabase
-- snapshot restore.
-- =============================================================================

begin;

-- ─── 1. New tables ──────────────────────────────────────────────────────────

create table if not exists public.routine_plan_steps (
  id                  uuid          primary key default gen_random_uuid(),
  user_id             uuid          not null references public.users(id) on delete cascade,
  scan_id             uuid          not null references public.scans(id) on delete cascade,
  step_key            text          not null,
  label               text          not null,
  product             text,
  category            text,
  clinical_reasoning  text,
  time_of_day         text          not null check (time_of_day in ('am','pm','daily')),
  step_type           text          not null check (step_type in ('maintenance','treatment')),
  target_concern      text,
  display_order       int           not null,
  created_at          timestamptz   not null default now(),
  unique (scan_id, step_key)
);

comment on table  public.routine_plan_steps is
  'The prescription for a scan. One row per logical step. Frozen at scan finalize so '
  'recommendation regen does not retroactively rewrite the plan a user is acting on.';
comment on column public.routine_plan_steps.user_id is
  'Denormalised from scans.user_id so RLS can use the standard auth.uid() = user_id pattern '
  'instead of a scan-id subquery. Populated by writePlanStepsForScan from scans.user_id.';
comment on column public.routine_plan_steps.step_key is
  'Slot-suffixed for skin (skin_cleanse_am, skin_cleanse_pm). Unsuffixed for hair/beard. '
  'Canonical set enforced in TS at plan-generation time, not by a CHECK constraint, so '
  'taxonomy can evolve without migration churn.';
comment on column public.routine_plan_steps.time_of_day is
  'Daily-only schedule. Hair steps are coerced to ''daily'' regardless of Gemini''s cadence '
  'emission; weekly/monthly cadence translation deferred to Phase XIII.';

create table if not exists public.routine_completions (
  id            uuid         primary key default gen_random_uuid(),
  user_id       uuid         not null references public.users(id) on delete cascade,
  scan_id       uuid         not null references public.scans(id)  on delete cascade,
  step_key      text         not null,
  date          date         not null,
  completed_at  timestamptz  not null default now(),
  unique (user_id, step_key, date)
);

comment on table  public.routine_completions is
  'Append-only log of routine taps. One row per user × step_key × local-tz date. '
  'completed_at is the device clock at tap. The unique constraint makes double-taps '
  'a no-op (same as the prior table).';

-- ─── 2. Indexes ─────────────────────────────────────────────────────────────
-- Each index justified against a query in §3 of the plan doc.

-- §3.1 (today's routine), §3.5 (rescan plan-step swap)
create index if not exists idx_routine_plan_steps_scan
  on public.routine_plan_steps (scan_id);

-- §3.2 (adherence over date range), §3.4 (deltaService rewrite)
create index if not exists idx_routine_completions_user_date
  on public.routine_completions (user_id, date desc);

-- §3.4 (deltaService kit-attribution: filters by user_id + step_key + date
-- range to count completions per kit-active step). Also backs the
-- recordCompletion uniqueness check on (user_id, step_key, date).
create index if not exists idx_routine_completions_user_step_date
  on public.routine_completions (user_id, step_key, date desc);

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────
-- Both tables follow the standard auth.uid() = user_id pattern. user_id on
-- routine_plan_steps is denormalised from scans.user_id at write time.

alter table public.routine_plan_steps enable row level security;

drop policy if exists routine_plan_steps_select_own  on public.routine_plan_steps;
drop policy if exists routine_plan_steps_insert_own  on public.routine_plan_steps;
drop policy if exists routine_plan_steps_delete_own  on public.routine_plan_steps;

create policy routine_plan_steps_select_own
  on public.routine_plan_steps for select
  using (auth.uid() = user_id);

create policy routine_plan_steps_insert_own
  on public.routine_plan_steps for insert
  with check (auth.uid() = user_id);

-- No UPDATE policy — plan_steps are write-once. Regen rewrites by delete+insert.
create policy routine_plan_steps_delete_own
  on public.routine_plan_steps for delete
  using (auth.uid() = user_id);

-- routine_completions: classic auth.uid() = user_id pattern.

alter table public.routine_completions enable row level security;

drop policy if exists routine_completions_select_own  on public.routine_completions;
drop policy if exists routine_completions_insert_own  on public.routine_completions;
drop policy if exists routine_completions_delete_own  on public.routine_completions;

create policy routine_completions_select_own
  on public.routine_completions for select
  using (auth.uid() = user_id);

create policy routine_completions_insert_own
  on public.routine_completions for insert
  with check (auth.uid() = user_id);

create policy routine_completions_delete_own
  on public.routine_completions for delete
  using (auth.uid() = user_id);

-- ─── 4. Drops ───────────────────────────────────────────────────────────────
-- Order matters: routine_checkins references user_kit via kit_item_id; user_kit
-- stays. Drop the dependent table first, then the freestanding dead tables.

drop table if exists public.routine_checkins cascade;
drop table if exists public.routine_logs     cascade;
drop table if exists public.product_events   cascade;
drop table if exists public.product_usage    cascade;

commit;
```

**Idempotency check.** Every `create table` is `if not exists`. Every
`create policy` is preceded by `drop policy if exists`. Every
`create index` is `if not exists`. Drops are `drop ... if exists cascade`.
Re-running the migration over its own output is a no-op.

**RLS rationale.**

- Both tables use the standard `auth.uid() = user_id` pattern, matching
  every other user-owned table in the schema. `routine_plan_steps.user_id`
  is denormalised from `scans.user_id` and populated at write time by
  `writePlanStepsForScan` (§2.2). Locked decision: simpler and faster
  than a scan-id subquery, at the cost of one extra column.
- Both tables have explicit SELECT / INSERT / DELETE policies and no
  UPDATE policy. UPDATE on plan_steps is forbidden (write-once); UPDATE
  on completions is unnecessary because `unique(user_id, step_key, date)`
  + `completed_at default now()` means a re-tap is a no-op.

**Why CASCADE on the drops.**
`routine_checkins.kit_item_id → user_kit(id) ON DELETE SET NULL` means the
referenced direction is `routine_checkins → user_kit`, not the other way.
Dropping `routine_checkins` does not cascade into `user_kit`. The
`cascade` keyword is a safety belt for any forgotten dependent objects
(views, functions). `user_kit` survives untouched.

### 1.2 No second migration

The brief asks whether kit-related changes need a migration: **no**.
`user_kit` is unchanged. The relationship from completions to kit is
expressed at query time (see §3.4), not in the schema. The `kit_item_id`
column on `routine_checkins` was dropped along with the table, and nothing
new replaces it.

---

## 2. Code changes — file by file

Walking every file in `docs/phase-xii-investigation.md` §1–3 plus the
consequences of dropping `routine_logs`, `product_events`, `product_usage`.

### 2.1 `lib/habit.ts` (full rewrite of generation + new helpers)

**Removed:**
- `generateScheduledRows` (line 305-472) — pre-materialised 28-day grid.
  Replaced by `generatePlanSteps` (returns 5–10 rows total).
- `BEARD_DEFAULT_STEPS` (line 269-273). New code requires
  `recommendations.beard.steps` to be present. If Gemini doesn't emit
  beard steps, no beard plan_steps are written. (Flagged §10.)
- `washFrequencyDays` (line 241-263) and `isWashDay` arithmetic
  (used inside `generateScheduledRows`). Hair cadence is no longer
  used to drive scheduling — every hair step is coerced to
  `time_of_day='daily'`. The Gemini hair prompt still emits
  `cadence: every_wash | weekly | monthly` but plan-gen reads and
  ignores it. Hair-cadence translation is deferred to Phase XIII.
- `resolveSkinTimeOfDay` (line 295-303) — legacy `skin_am_*` /
  `skin_pm_*` step_id sniffing is no longer needed; new schema requires
  `time_of_day` to be present and the canonical validator rejects
  unknown step_ids.

**Kept (no change):**
- `ADHERENCE_WINDOW_DAYS`, `STREAK_THRESHOLD`, `FREEZE_EARN_RATE`,
  `FREEZE_MAX_BANKED` (line 8-11).
- `DayAdherence`, `StreakInfo`, `WeekDay` types (line 16-36).
- `computeDayStatuses` (line 94-139), `computeStreak` (line 143-164),
  `buildWeekStrip` (line 168-208), `computeRollingAdherence`
  (line 212-235). These all consume `DayAdherence[]`. Caller now builds
  the array from completions + plan_steps (see §2.2).

**Added — `generatePlanSteps`:**

```ts
export interface PlanStepRow {
  user_id:            string;             // denormalised from scans.user_id
  scan_id:            string;
  step_key:           string;             // canonical, slot-suffixed for skin
  label:              string;
  product:            string | null;
  category:           string | null;
  clinical_reasoning: string | null;
  time_of_day:        'am' | 'pm' | 'daily';
  step_type:          'maintenance' | 'treatment';
  target_concern:     string | null;
  display_order:      number;
}

export function generatePlanSteps(input: {
  scanId:           string;
  scan:             Scan;
  userHairProfile?: HairProfile | null;
  userHairRoutine?: HairRoutineStep[] | null;
}): PlanStepRow[];
```

**Behaviour:**
- Skin: for each `recommendations.skin.steps[]`, validate step_id against
  the canonical set (§4), drop unknown ones with a `console.warn`. For
  each remaining step, expand its `time_of_day` array into one
  PlanStepRow per slot with `step_key = ${step_id}_${slot}` (this is the
  one place `_am`/`_pm` suffixing happens; everything else reads it as
  opaque). `step_type = mapStepType(step)` (§5). `target_concern` =
  passed through verbatim (already normalised by `lib/gemini/skin.ts`
  `normalizeConcern`).
- Beard: for each `recommendations.beard.steps[]`, one PlanStepRow per
  step with `time_of_day='daily'`. (No AM/PM split — beard prompt does
  not specify slots; flagged in §10 as a forward-compatibility question.)
- Hair: for each `userHairRoutine[]`, one PlanStepRow with
  `time_of_day='daily'`, regardless of the step's `cadence` value.
  Plan-gen reads `cadence` (`every_wash` | `weekly` | `monthly`) and
  ignores it — every hair step is treated as daily for v1. The Gemini
  prompt is unchanged this phase. Hair cadence translation deferred to
  Phase XIII.

**Added — `mapStepType(step: RoutineStep): 'maintenance' | 'treatment'`:**
See §5.

**Added — canonical validator `isCanonicalStepId(stepId: string): boolean`:**
See §4.

**Added — `expectedDailyAdherence(planSteps, completions, windowStart, windowEnd): DayAdherence[]`:**

Daily-only. No weekly handling, no replay, no buckets.

```ts
export function expectedDailyAdherence(
  planSteps: PlanStepRow[],
  completions: { step_key: string; date: string }[],
  windowStart: string,                    // local-tz YMD, inclusive
  windowEnd:   string,                    // local-tz YMD, inclusive
): DayAdherence[];
```

Implementation:
- `scheduledPerDay := count of planSteps where time_of_day in ('am','pm','daily')`.
  Constant across the window — the same plan applies every day.
- Group `completions` by `date` into a `Map<date, count>` where each
  count is the number of distinct (`step_key`) completions on that date.
- For every date in `[windowStart, windowEnd]` (inclusive), emit a
  `DayAdherence{date, scheduled_count: scheduledPerDay, completed_count: map.get(date) ?? 0}`.
- Both counts are integers. No fractional roll-up.

Caller is responsible for filtering `planSteps` to the active scan
before invocation (so per-scan overlap during a rescan window doesn't
double-count). See §3.2.

**Why this lives in `lib/habit.ts` not `services/habitService.ts`:**
the existing split (pure logic in lib, DB I/O in services) is a working
convention. New code follows it — `generatePlanSteps` is pure, all DB
calls live in `services/habitService.ts`.

### 2.2 `services/habitService.ts` (significant rewrite)

**Removed:**
- `RoutineCheckinRow` type (line 19-29) — dead in current code; obsolete.
- `scheduleRoutineForScan` (line 107-134) — replaced by
  `writePlanStepsForScan` below.
- `supersedePreviousScanRows` (line 139-158) — no `superseded` flag in
  the new schema; obsolete.
- `recordCheckin` (line 162-185) — replaced by `recordCompletion` below.
- `unrecordCheckin` (line 187-199) — replaced by `unrecordCompletion`.
- `recordBulkCheckin` (line 203-225) — dead in current code; delete.
- `fetchPastDayRoutine` (line 446-448) — dead in current code; delete.
- `backfillKitItemIdForStep` (line 457-477) — obsolete. The new schema
  has no `kit_item_id` on completions; `deltaService` now joins
  `completions ↔ user_kit` by step_key (with suffix stripped) at read
  time. (See §3.4.)
- The `todayISO` / `yesterdayISO` re-exports (line 481) — delete.
- The internal `fetchRoutineForDate` (line 303-440) — the new query is
  much simpler; no separate file-private helper needed.
- `categoryBucket`, `baseSkinStepId`, `beardFallbackMeta`,
  `humanizeStepId` (line 267-301) — beard fallback is gone (no defaults
  in the new model); base id stripping moves to a shared helper in
  `lib/habit.ts`; humanize is dead.

**Kept:**
- The local `toISODate`, `parseISODate`, `todayISO`, `yesterdayISO`,
  `daysAgoISO` date helpers (line 56-84). Single canonical helper in
  this file; the routine.tsx local helper is removed (§2.6).
- `assertEditableDate` (line 87-93) — still relevant; same semantics.

**Added — `writePlanStepsForScan(input: WritePlanInput): Promise<number>`:**
```ts
export async function writePlanStepsForScan(input: {
  scanId:           string;
  scan:             Scan;
  userHairProfile?: HairProfile | null;
  userHairRoutine?: HairRoutineStep[] | null;
}): Promise<number>;
```
Reads `user_id` from `input.scan.user_id` and stamps it on every row
(denormalised for RLS — see §1.1). Calls `generatePlanSteps` (pure),
then `supabase.from('routine_plan_steps').upsert(rows, { onConflict: 'scan_id,step_key' })`.
On full scan, fresh inserts. On regen, the caller (`rescheduleAfterRegen`,
§2.3) deletes the section's old plan_steps first so removed step_keys
don't linger. Same scan_id + same step_key updates frozen strings in
place when present. Returns row count.

**Added — `recordCompletion(userId, scanId, stepKey, date): Promise<void>`:**
```ts
export async function recordCompletion(
  userId: string,
  scanId: string,
  stepKey: string,
  date: string,
): Promise<void>;
```
Calls `assertEditableDate(date)`, then `supabase.from('routine_completions').upsert({ user_id, scan_id, step_key, date }, { onConflict: 'user_id,step_key,date', ignoreDuplicates: true })`.
Fire-and-forget `void checkMilestonesForCheckin(userId)` after the write.

**Added — `unrecordCompletion(userId, stepKey, date): Promise<void>`:**
```ts
export async function unrecordCompletion(
  userId: string,
  stepKey: string,
  date: string,
): Promise<void>;
```
Calls `assertEditableDate(date)`, then `supabase.from('routine_completions').delete().eq('user_id', userId).eq('step_key', stepKey).eq('date', date)`. The new schema has no `completed_at = null` state — uncheck = delete the row. (This is a real semantic change. The locked
decision allows it because milestones consume aggregates, not
per-completion history.)

**Rewritten (same name, new internals) — `fetchTodayRoutine(userId): Promise<RoutineDayStep[]>`:**
External signature preserved (`services/habitService.ts:442`). See query
in §3.1. Returns one row per plan_step on the active scan, joined to
today's completion (if any). Every plan_step is in scope every day —
the AM/PM tab split happens in the screen by `time_of_day`.

**Rewritten (same name, new internals) — `fetchDailyAdherence(userId, windowDays?): Promise<DayAdherence[]>`:**
External signature preserved (`services/habitService.ts:229`) so all
callers (routine.tsx, profileData.ts, milestones.ts) need no signature
change. New flow:
1. Fetch active scan id (`max(created_at)` for user).
2. Fetch its plan_steps.
3. Fetch completions in `[windowStart, today]`.
4. Call `expectedDailyAdherence(planSteps, completions, windowStart, today)`
   from `lib/habit.ts` (§2.1) to synthesise the per-day struct the
   existing streak/week-strip math expects.

This keeps `lib/habit.ts:computeStreak`, `:buildWeekStrip`,
`:computeRollingAdherence` unchanged.

**`RoutineDayStep` type changes:**
- `step_id` (line 33) → `step_key` (rename throughout to match the
  new schema column name; affects `app/(tabs)/routine.tsx`,
  `services/scanService.ts`).
- `base_step_id` (line 34) → `base_step_key` (rename; same purpose —
  the unsuffixed key for picker/kit linking).
- `kit_item_id` (line 38) → **removed** (no longer a join the routine
  screen needs; the picker/kit detail screen still queries `user_kit`
  directly by step_key).
- `row_id` (line 39) → **removed** (no `routine_completions.id` is
  needed for updates because `(user_id, step_key, date)` is the natural
  key; UI keys off `step_key`).
- New: pass `time_of_day: 'am' | 'pm' | 'daily'`. The screen needs this
  for AM/PM tab filtering. No `target_per_week`, no weekly variant.
- New: `step_type: 'maintenance' | 'treatment'` — surfaced for UI hooks
  that may want to badge treat steps. (Not currently rendered; small
  cost to include in the type so we don't refetch later.)

### 2.3 `services/scanService.ts` (call-site updates)

**Removed:**
- `logRoutineStep` (line 93-112). No replacement — the new model has
  `routine_plan_steps` carrying frozen display strings, and
  `routine_completions` carrying the structural log. Analytics that
  used to read from `routine_logs.step_label` should join through
  `routine_completions.step_key → routine_plan_steps.label` for the
  label at completion time.
- `deriveStepCategory` (line 79-90) — only consumer was
  `logRoutineStep` and `app/(tabs)/routine.tsx`. Both go away.
- The tombstone block at line 1576-1597 ("REMOVED IN PHASE XI:
  logProductEvent") — `product_events` and `product_usage` are dropped
  in this migration so the comment block is no longer pointing at
  living tables. Delete the block.
- The `import { … supersedePreviousScanRows … }` at line 9 — drop
  `supersedePreviousScanRows` from the import list.

**Changed:**
- `runScanPhase2` finalize block (line 887-921): drop the
  `supersedePreviousScanRows` call and rename the
  `scheduleRoutineForScan` call to `writePlanStepsForScan`. The two-step
  "supersede then schedule" becomes one call.

  Before (line 889-921):
  ```ts
  try {
    const { data: prevScanRows } = await supabase.from('scans')... // find prev
    const prevScanId = ...;
    if (prevScanId) await supersedePreviousScanRows(userId, prevScanId);
    const { data: userRow } = await supabase.from('users')...
    await scheduleRoutineForScan({ scanId, userId, scan, userHairProfile, userHairRoutine });
  } catch (err) { ... }
  ```
  After:
  ```ts
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('hair_profile, hair_recommendations')
      .eq('id', userId).single();
    await writePlanStepsForScan({
      scanId:          data.id as string,
      scan:            data as Scan,
      userHairProfile: (userRow?.hair_profile as HairProfile | null) ?? null,
      userHairRoutine: (userRow?.hair_recommendations as HairRecommendations | null)?.routine ?? null,
    });
  } catch (err) { ... }
  ```

- `rescheduleAfterRegen` (line 1348-1378): delete-then-insert per
  v2 locked decision. Before calling `writePlanStepsForScan`, delete
  the section's plan_steps for this scan: `delete from routine_plan_steps where scan_id = $scan_id and step_key like $section_prefix%`
  (e.g., `'skin_%'` when re-running skin recommendations). Then write
  the new set. This ensures step_keys removed by regen disappear from
  the user's plan. Behavioural quirk (past-day adherence rescoring) is
  documented in §12.1.

### 2.4 `services/deltaService.ts` (kit-attribution rewrite)

**Removed:**
- The `routine_checkins`-against-window query at line 167-173 (used for
  adherence_overall, by-category, weekly).
- The kit-completions query at line 256-263 that read
  `kit_item_id` off `routine_checkins`.
- `stepCategory` (line 91-100) — its consumers are below.

**Replaced — adherence query:**
```ts
const { data: completions } = await supabase
  .from('routine_completions')
  .select('date, step_key')
  .eq('user_id', userId)
  .gte('date', fromISO)
  .lt('date', toISO);

// Plan steps that were active during the window. The active scan during the
// window is the prior scan (the one we're rescaning AGAINST). Pull its
// plan_steps to know what was scheduled.
const { data: planSteps } = await supabase
  .from('routine_plan_steps')
  .select('step_key, time_of_day, step_type')
  .eq('scan_id', prevScan.id);
```

Then `adherence_overall`, `adherence_by_category`, `adherence_weekly`
are computed from `(planSteps, completions, fromISO, toISO)` using a
new helper in `lib/habit.ts`. Category derivation moves from `stepCategory(step_id, time_of_day)` to a direct prefix check on
step_key (skin_*/hair_*/beard_*) plus the `_am`/`_pm` suffix to split
skin into AM/PM (matches the existing `AdherenceByCategory` shape).

Note on `adherence_weekly`: this is a per-7-day analytics bucket on
`scan_deltas` (see `services/deltaService.ts:31-34`
`WeeklyAdherencePoint`), not a schedule cadence. The Phase XII drop of
`time_of_day='weekly'` on the routine schedule has no relation to it —
weekly buckets are computed from daily completions × the active scan's
plan_steps over rolling 7-day windows.

**Replaced — products_used / kit attribution:**

```ts
// Active kit at the time of each completion. Strip skin slot suffix to match
// user_kit.step_id (which is unsuffixed; see services/habitService.ts:455).
const { data: kit } = await supabase
  .from('user_kit')
  .select('id, product_id, step_id, acquired_at')
  .eq('user_id', userId)
  .eq('is_active', true)
  .lt('acquired_at', newScan.created_at);

const completionsByKit = new Map<string, number>();
for (const c of completions ?? []) {
  const baseKey = stripSlotSuffix(c.step_key);  // 'skin_cleanse_am' → 'skin_cleanse'
  const matchingKit = kit.find(k =>
    k.step_id === baseKey &&
    k.acquired_at <= /* completion date midnight in user-local tz, ISO */
  );
  if (!matchingKit) continue;
  completionsByKit.set(matchingKit.id, (completionsByKit.get(matchingKit.id) ?? 0) + 1);
}
```

`stripSlotSuffix` is the function `baseSkinStepId` from current
`services/habitService.ts:277`, lifted into `lib/habit.ts` so it's
shared. (Locked-decision rationale: today step_id is unsuffixed in
`user_kit` (`skin_cleanse`); to join completions (`skin_cleanse_am`) we
strip on the completion side. Recommended pattern over the
alternatives.)

The `kit.acquired_at <= completion.date` check replicates today's
"only count completions for kit items active by then" semantics. The
old code piggybacked on the backfill job (`backfillKitItemIdForStep`
only wrote forward), which had the same effect by accident; the new
code expresses it as the actual rule.

### 2.5 `services/kitService.ts` (call-site cleanup)

**Removed:**
- The `import { backfillKitItemIdForStep } from './habitService'` at
  line 4.
- The `await backfillKitItemIdForStep(...)` call inside
  `addProductToKitFromBuy` (line 75-81). The whole try/catch around it
  goes; the function ends after the insert.

**Why the function is now a no-op for routine attribution:**
the new schema has no `kit_item_id` column on completions. The
`completion → kit` link is computed at delta-write time by the rewritten
`deltaService` (§2.4), not persisted onto each completion row.

**Kept (no change):** `productIdFor`, `addProductToKitFromBuy` (minus
the backfill call), `fetchActiveKit`, `removeKitItem`, `markKitReordered`.

### 2.6 `app/(tabs)/routine.tsx` (toggle path + UTC bug)

**Removed:**
- The local `todayISO` (line 63-65) — the UTC bug. The screen will
  import `todayISO` from `services/habitService.ts` instead; that helper
  uses local-tz YMD (see line 70-72 of habitService).
- The import of `recordCheckin`, `unrecordCheckin`,
  `RoutineDayStep` (line 32-38) — replaced by
  `recordCompletion`, `unrecordCompletion`, `RoutineDayStep` (the
  type rename).
- The import of `deriveStepCategory`, `logRoutineStep` (line 39) —
  both removed in §2.3.
- The `routine_logs` write inside `handleToggle` (line 226-235).

**Changed:**
- `handleToggle` (line 205-247): swap `step.step_id` for `step.step_key`,
  swap `recordCheckin(userId, stepId, date, kitItemId)` for
  `recordCompletion(userId, scanId, stepKey, date)`, swap
  `unrecordCheckin` for `unrecordCompletion`, drop the
  `kit_item_id` argument (no longer exists), drop the
  `logRoutineStep` block.
- AM/PM filtering (line 187-198): currently filters
  `s.time_of_day === 'am' || s.time_of_day === 'daily'` (and same for
  pm). New schema's `time_of_day` enum is `('am','pm','daily')`. AM
  tab: include `am | daily`. PM tab: include `pm | daily`. Daily cards
  appear in both tabs. No weekly variant, no visibility filter — every
  plan_step is in scope every day.
- Optimistic state on tap: today's code flips `step.completed` and
  `step.completed_at`. New code keeps the same UX, just stored against
  step_key.
- The `s.kit_item_id` reference on line 221 — drop it. The new
  `recordCompletion` signature has no kit_item_id parameter.

**Other small things on this screen:**
- `formatTodayDate`, `calendarDaysBetween`, `pad2` — keep as-is.
- The `WEEKDAY_LABELS` / `MONTH_LABELS` constants (line 56-57) — keep.

### 2.7 `lib/profileData.ts` (read-path swap)

**Changed:**
- `computeStatGrid` (line 86-127): the `routine_checkins` query at
  line 92-95 becomes a `routine_completions` query for completion count
  + a `routine_plan_steps` query for "expected scheduled" since the
  most-recent-scan window. The math is the same shape as today
  (`completed / scheduled`); the inputs change.

  ```ts
  // Replace:
  // .from('routine_checkins').select('date, completed_at')
  //   .eq('user_id', userId).eq('superseded', false),
  // With:
  const completionsP = supabase
    .from('routine_completions')
    .select('date')
    .eq('user_id', userId)
    .gte('date', windowStart);

  const planP = supabase
    .from('routine_plan_steps')
    .select('time_of_day')
    .eq('scan_id', latestScanId);
  ```

  Then `scheduledPerDay = planSteps.length` (every plan_step is in
  scope every day), `expected = scheduledPerDay × windowDays`,
  `completed = completions.length`, `adherence_pct = round(completed / expected * 100)`.
- `fetchAdherencePanel` / `computeAdherenceForCurrentIssue` (line 258-348):
  same swap. The per-week bucket math (line 304-325) currently filters
  per-day rows by date range; the new shape sums completions in the
  bucket and divides by `scheduledPerDay × bucketDays`.

### 2.8 `lib/milestones.ts` (read-path swap)

**Changed:**
- `fetchDailyAdherenceWindow` (line 87-109): currently aggregates
  `routine_checkins` rows. New flow mirrors §2.2's
  `fetchDailyAdherence` pattern — fetch completions + plan_steps,
  synthesise per-day struct via `expectedDailyAdherence`. Returns
  the same `DayRow[]` shape so `longestConsecutiveAdherent` and
  `has30DayWindowAbove70` work without touching their internals.

The two milestone definitions that depend on this:
- `first_routine`: "any day where all scheduled steps completed."
  Under the new model, "all scheduled" for a day = every plan_step
  was completed today (every step is daily). Cleaner shape: walk
  the plan_steps and ask "did completions today cover them?".
- `week_one`, `consistency_30`: aggregate over the synthesised
  per-day struct. No change needed at the milestone-evaluation layer.

### 2.9 `types/index.ts`

**Changed:**
- `RoutineStep` (line 213-224): unchanged. This is the JSONB shape
  that Gemini emits and that `scans.recommendations.skin.steps[]` stores.
  It's unrelated to the new `routine_plan_steps` table — that one gets
  its own `PlanStepRow` type in `lib/habit.ts`.
- The `cadence` field stays on `RoutineStep` (still present in hair
  recommendations JSONB); plan-generation code reads it and discards
  it — every hair plan_step is persisted with `time_of_day='daily'`
  in v1 (§2.1, §12.3).

**Added** (already in §2.1): `PlanStepRow` lives in `lib/habit.ts`,
re-exported from there. The `RoutineDayStep` type in `services/habitService.ts`
gets the renames noted in §2.2.

### 2.10 `app/(profile)/add-from-routine.tsx` and `app/skin-detail.tsx`

These read `target_concern` from `RoutineStep` to nudge the picker.
That's unchanged — `target_concern` still lives on the JSONB, separate
from `routine_plan_steps.target_concern`.

But: both screens currently use `step.step_id` as a key for the kit
linking call (`kitService.addProductToKitFromBuy({ stepId, ... })`).
Rename `stepId` → `stepKey` in the kit service to match the new
column name, and pass the unsuffixed key (`skin_cleanse`, not
`skin_cleanse_am`) — same as today.

### 2.11 `components/detail/ProductDetailSheet.tsx`

`from('user_kit').select('*').eq('step_id', stepId)` at line 92 —
unchanged. `user_kit.step_id` is still unsuffixed. The `stepId` passed
in is from picker context (already unsuffixed). No change.

### 2.12 No-change files (confirmed by grep)

- `lib/gemini/skin.ts`, `lib/gemini/hair.ts`, `lib/gemini/beard.ts`:
  prompt builders. Unchanged. The plan generation reads their output
  through the canonical validator (§4); prompts themselves don't need
  to change.
- `services/notificationService.ts`: scheduling notifications by user
  id + time of day; doesn't read `routine_checkins`.
- `hooks/useScan.ts`: orchestration — calls `runScanPhase2`, etc.;
  doesn't reference the table directly.

---

## 3. Query patterns

Each query annotated with which index it relies on (from §1.1).

### 3.1 "What's the user's routine for today?"

```ts
// 1. Find active scan.
const { data: scan } = await supabase
  .from('scans')
  .select('id')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

// 2. Fetch its plan_steps.
const { data: planSteps } = await supabase
  .from('routine_plan_steps')
  .select('step_key, label, product, category, clinical_reasoning, time_of_day, step_type, target_concern, display_order')
  .eq('scan_id', scan.id)
  .order('display_order', { ascending: true });
// uses idx_routine_plan_steps_scan

// 3. Fetch today's completions for these step_keys.
const today = todayISO();
const { data: doneToday } = await supabase
  .from('routine_completions')
  .select('step_key')
  .eq('user_id', userId)
  .eq('date', today);
// uses idx_routine_completions_user_date (today is the leading-date filter)

// 4. Join in memory: every plan_step is rendered, with completed = step_key in doneToday.
```

Two round trips — same shape as today's `fetchRoutineForDate` minus the
weekly window query. Acceptable.

### 3.2 "Adherence over a date range"

```ts
const { data: completions } = await supabase
  .from('routine_completions')
  .select('date, step_key')
  .eq('user_id', userId)
  .gte('date', fromISO)
  .lte('date', toISO);
// uses idx_routine_completions_user_date

const { data: planSteps } = await supabase
  .from('routine_plan_steps')
  .select('step_key, time_of_day')
  .eq('scan_id', activeScanId);
// uses idx_routine_plan_steps_scan

// Compute expected via expectedDailyAdherence (lib/habit.ts §2.1).
```

### 3.3 "Streak: consecutive days with at least one completion"

The current streak math uses `DayAdherence{date, scheduled_count, completed_count}`
and asks "did completed/scheduled hit threshold each day?". We keep
that shape — synthesised by `expectedDailyAdherence` (§2.1) — so the
existing `computeStreak` (lib/habit.ts:143) works unchanged. Underlying
query: §3.2.

### 3.4 "Per-product attribution for scan_deltas"

Already shown in full in §2.4. Two queries: `routine_completions`
filtered by user + date range, and `user_kit` filtered by user + active.
Then one in-memory pass joining `stripSlotSuffix(completion.step_key) === kit.step_id`
and `kit.acquired_at <= completion.date`. Indices:
`idx_routine_completions_user_date`, plus the existing
`idx_user_kit_user_active`.

### 3.5 "Rescan plan-step swap"

On scan finalize:
```ts
await supabase
  .from('routine_plan_steps')
  .upsert(rows, { onConflict: 'scan_id,step_key' });
```
Each scan owns its own plan_steps. Old scan's plan_steps stay (they're
still referenced by historical completions for delta math). No
"supersede" step.

For the active-scan lookup (§3.1, §3.2), `scans.user_id, max(created_at)`
— relies on `idx_scans_user_created` from
`phase_xi_fixes_and_indexes.sql:103`. Already present.

---

## 4. step_key canonicalization

**Where the validator lives:** `lib/habit.ts`, exported as
`isCanonicalStepId(stepId: string): boolean` and
`canonicalSlottedStepKey(stepId, slot): string | null`.

Pattern follows `lib/gemini/skin.ts:230-246` `normalizeConcern`: a
typed Set lookup, return null on miss, log a warning, drop the step.

**Canonical step_id set (per-section, before slot suffixing):**

```ts
const CANONICAL_SKIN_STEPS = new Set([
  'skin_cleanse',
  'skin_treat_1',
  'skin_treat_2',
  'skin_moisturize',
  'skin_protect',
] as const);
const CANONICAL_HAIR_STEPS = new Set([
  'hair_shampoo',
  'hair_conditioner',
  'hair_oil',
  'hair_serum',
  'hair_mask',
] as const);
const CANONICAL_BEARD_STEPS = new Set([
  'beard_wash',
  'beard_oil',
  'beard_balm',
] as const);
```

Source: `lib/gemini/skin.ts:85`, `lib/gemini/hair.ts:111-112,162`,
`lib/gemini/beard.ts:31`.

**Canonical step_key set (post slot suffixing):**

- Skin: 5 step_ids × {_am, _pm} = **10** step_keys.
- Hair: 5 step_ids (no slot suffix) = **5** step_keys.
- Beard: 3 step_ids (no slot suffix) = **3** step_keys.
- **Total: 18 distinct step_keys.**

**What happens on an unknown step_id:**

Per the brief: drop the step, log a warning, surface in observability.
Concrete behaviour at plan-generation time:
```ts
for (const step of recs.skin?.steps ?? []) {
  if (!step.step_id || !CANONICAL_SKIN_STEPS.has(step.step_id)) {
    console.warn('[habit-gen] dropping skin step with non-canonical step_id', {
      step_id: step.step_id,
      scan_id: scanId,
    });
    continue;
  }
  // ... expand to slots, push plan_step rows.
}
```

The warning lands in app logs only — not `gemini_usage` (the call
itself was successful; only the post-validation rejected the step).
No user-visible failure: the plan still writes for the canonical steps
that did pass.

**Why TS validator and not a CHECK constraint:** the brief mandates
this. Keeps taxonomy evolution in the JS bundle (where prompt changes
also live) rather than tied to migration churn. Matches the same
rationale as `phase_xi_create_missing_tables.sql:29-31`.

---

## 5. step_type mapping

**Where it lives:** `lib/habit.ts`, exported as
`mapStepType(step: RoutineStep): 'maintenance' | 'treatment'`.

**Rule.** A step is a `treatment` iff `step.target_concern` is set.
Everything else is `maintenance`. No hardcoded step_id list. This
future-proofs against `skin_treat_3+` and lets hair/beard steps become
treatments if Gemini ever emits `target_concern` on them.

**Implementation:**
```ts
export function mapStepType(step: RoutineStep): 'maintenance' | 'treatment' {
  return step.target_concern ? 'treatment' : 'maintenance';
}
```

`RoutineStep` is the JSONB shape from `types/index.ts:213-224`. The
field is optional and only populated by the skin prompt today
(`lib/gemini/skin.ts:230-246` `normalizeConcern`).

**Today's emissions** (informational — read against
`lib/gemini/skin.ts:85`, `lib/gemini/hair.ts:111-112,162`,
`lib/gemini/beard.ts:31`):

| step_id (unsuffixed) | target_concern emitted? | resulting step_type |
|----------------------|-------------------------|---------------------|
| `skin_cleanse`       | no                      | maintenance         |
| `skin_treat_1`       | **yes**                 | **treatment**       |
| `skin_treat_2`       | **yes**                 | **treatment**       |
| `skin_moisturize`    | no                      | maintenance         |
| `skin_protect`       | no                      | maintenance         |
| `hair_shampoo`       | no                      | maintenance         |
| `hair_conditioner`   | no                      | maintenance         |
| `hair_oil`           | no                      | maintenance         |
| `hair_serum`         | no                      | maintenance         |
| `hair_mask`          | no                      | maintenance         |
| `beard_wash`         | no                      | maintenance         |
| `beard_oil`          | no                      | maintenance         |
| `beard_balm`         | no                      | maintenance         |

This table reflects the current prompt outputs. If a future prompt
revision adds `target_concern` to (say) `hair_serum`, that step
automatically classifies as treatment without code change. The table
is informational only — **the code reads `target_concern` presence,
not this list.**

---

## 6. Migration sequence

1. **Branch.** `git checkout -b phase-xii-routine-redesign` from
   `main` (currently at `b0ff9de`).

2. **Apply migration locally.**
   The README says migrations are applied via the Supabase dashboard
   SQL editor (`supabase/migrations/README.md:62-65`). Steps:
   - Open Supabase dashboard → SQL editor.
   - Paste the full body of `phase_12_routine_redesign.sql`.
   - Run. Verify in `information_schema.tables` that
     `routine_plan_steps` and `routine_completions` exist and
     `routine_checkins`, `routine_logs`, `product_events`,
     `product_usage` are gone.

   If `npx supabase db push` is preferred, that requires CLI config
   that doesn't exist yet (per the README); not a blocker but not the
   default path.

3. **Code changes — order to keep the dev build passing:**

   `types/index.ts` is untouched in this phase (the JSONB-shape
   `RoutineStep` interface stays as-is per §2.9), so it's not an
   ordered step.

   1. `lib/habit.ts` — add `PlanStepRow`, `generatePlanSteps`,
      `mapStepType`, `isCanonicalStepId`, `canonicalSlottedStepKey`,
      `expectedDailyAdherence`, `stripSlotSuffix`. Keep the old
      `generateScheduledRows` etc. for one commit-pass — easier to
      compile while wiring up the new services. (Or delete in the same
      step if confident; the single-commit constraint allows either
      order locally.)
   2. `services/habitService.ts` — add new exports
      (`writePlanStepsForScan`, `recordCompletion`, `unrecordCompletion`,
      new `fetchTodayRoutine`/`fetchDailyAdherence`). Drop the old
      exports.
   3. `services/scanService.ts` — swap `scheduleRoutineForScan` →
      `writePlanStepsForScan`, drop `supersedePreviousScanRows` call,
      drop `logRoutineStep`, `deriveStepCategory`, the tombstone block.
   4. `services/kitService.ts` — drop the `backfillKitItemIdForStep`
      call.
   5. `services/deltaService.ts` — rewrite the two `routine_checkins`
      reads. Use the kit-attribution by step_key pattern.
   6. `lib/milestones.ts` — rewrite `fetchDailyAdherenceWindow`.
   7. `lib/profileData.ts` — rewrite `computeStatGrid` and
      `computeAdherenceForCurrentIssue`.
   8. `app/(tabs)/routine.tsx` — full toggle path rewrite + drop
      local UTC `todayISO` + import the new functions from
      habitService.
   9. Delete `lib/habit.ts:generateScheduledRows` and friends now
      that no caller remains.
   10. `tsc --noEmit` (or `npx expo export --no-bundler` equivalent)
       to confirm no type errors.

4. **No backfill of existing scans.**
   `routine_plan_steps` is **not** populated for pre-migration scans.
   Reasons: (a) only Prateek's test scans exist in production, (b) the
   migration wipes `routine_checkins` anyway so adherence history is
   gone regardless, (c) a fresh post-migration scan exercises the new
   plan-gen path properly. **Post-migration first user action MUST be
   a fresh scan.** Until then, the routine tab will be empty (no
   active scan yields any plan_step rows). Document this in the PR.

5. **Empirical verification (per §7):**
   - Fresh scan → assert plan_steps land + visible.
   - Tap step → assert completion lands.
   - Rescan → assert old completions preserved + new plan_steps active.

6. **UTC bug fix verification:** Manual test described in §7 scenario
   4 (renumbered). The simplest device-side simulation: change the
   system clock to 01:30 IST and tap a step.

7. **Commit.** Single commit, schema + code together. Title:
   `phase_12: replace routine_checkins with plan_steps + completions`.
   Body: link the rewrite plan, summarise the table changes, mention
   that `routine_checkins` rows were wiped, call out the fresh-scan
   requirement.

8. **Push, open PR for review.** Don't merge to `main` until Prateek
   has eyeballed the PR, run a real scan + tap on a TestFlight build
   if possible.

---

## 7. Test plan

Numbered scenarios; each with setup, action, expected outcome.

1. **Fresh-user first scan.**
   - **Setup:** new auth user, no prior scans. Female with
     `care_categories = ['skin', 'hair', 'makeup']`.
   - **Action:** complete a face scan; let runScanPhase2 finalize.
   - **Expected:**
     - `routine_plan_steps` has rows for skin (up to 10; 5 step_ids
       × 2 slots, but some steps may emit a single slot — actual count
       depends on Gemini output). Each row has frozen `label`,
       `product`, `clinical_reasoning` and `user_id` denormalised.
     - For hair: one row per emitted hair step, all with
       `time_of_day='daily'` (cadence ignored per §2.1).
     - `routine_completions` has zero rows.
     - Routine tab renders skin in AM/PM tabs and daily hair steps in
       both tabs.

2. **Rescan mid-cycle.**
   - **Setup:** user with one prior scan, has tapped 4 completions
     since. **Both prior scan and new scan must be post-Phase-XII**
     (i.e. both wrote to `routine_plan_steps` at finalize).
   - **Action:** complete a rescan.
   - **Expected:**
     - New scan_id has its own plan_steps row set.
     - Old scan_id's plan_steps still exist (used by deltaService's
       active-during-window query).
     - Old scan_id's completions still exist (linked via
       `completions.scan_id`).
     - Routine tab renders the *new* plan_steps. Today's completions
       count for the new scan (no completions for the new scan_id
       yet, so zero done today even if user tapped during the old scan).
     - `scan_deltas` row computes adherence_overall against the old
       scan's plan_steps + the in-window completions (which are tied to
       the old scan_id, a useful invariant).
   - **Caveat — pre-Phase-XII prior scan.** If the prior scan is
     pre-migration (no plan_steps written), the deltaService
     `routine_plan_steps` query returns empty for that scan_id →
     `expectedDailyAdherence([], ...)` returns `scheduled_count = 0`
     for every day in the window → `adherence_overall = null` and
     streak math returns zeros. The delta still computes (score deltas,
     concern deltas, etc.) but adherence-derived fields degrade to
     null/zero. Acceptable per §6 step 4 / §9: post-migration first
     user action must be a fresh scan, so this caveat only ever
     applies to the very first post-migration rescan if a user opts
     to keep a pre-migration scan as prevScan rather than restarting.

3. **Skin step appears in both AM and PM.**
   - **Setup:** Gemini emits `skin_cleanse` with
     `time_of_day: ["am", "pm"]`.
   - **Expected:** two `routine_plan_steps` rows: `skin_cleanse_am` and
     `skin_cleanse_pm`. Both have the same label/product/category but
     each is a distinct row with its own time_of_day.

4. **Local-tz date assertion (a tap at 02:00 IST).**
   - **Setup:** Device clock set to 02:00 IST 2026-05-09. UTC is
     2026-05-08 20:30.
   - **Action:** open routine tab, tap a step.
   - **Expected:** completion row lands with `date = 2026-05-09` (local
     YMD), `completed_at` is the tap time as UTC ISO. The row appears
     under "today" and the optimistic UI flip persists across refresh.
     **This is the test that fails on current `app/(tabs)/routine.tsx:63`
     (would write 2026-05-08).**

5. **Adherence calc returns correct percentage for partial completions.**
   - **Setup:** 1 active scan with 5 plan_steps (mix of am/pm/daily).
     7-day window. User completed 3 of the 5 step_keys every day for
     7 days.
   - **Expected:** `scheduledPerDay = 5`. expected = 5×7 = 35.
     completed = 3×7 = 21. adherence_pct = round(21/35 × 100) = 60.

6. **Streak calc handles a missed day correctly.**
   - **Setup:** 5 days adherent, 1 missed (no completions), 1 adherent
     since (today).
   - **Expected:** `current_streak = 1` (today). `longest_streak = 5`.
     If user has 1 freeze banked and the miss was Day 6, the freeze
     should auto-consume and `current_streak = 7` instead.
     (Same semantics as today; verified by the unchanged
     `computeStreak`.)

7. **Scan delta computes correct products_used after kit + completions exist.**
   - **Setup:** previous scan 28 days ago. User added Cetaphil cleanser
     to kit (linked to step_id `skin_cleanse`) on day 5. Has 30
     completions for `skin_cleanse_am` and 30 for `skin_cleanse_pm`
     across days 5-28.
   - **Action:** rescan triggers `computeAndStoreScanDelta`.
   - **Expected:** `products_used[0]` has `product_id = cetaphil_*`,
     `completions_tied_to_product = 60` (only the 60 from days 5-28
     where the kit was active; if any completions existed on days 1-4,
     they should NOT count).

8. **Unknown step_id from Gemini is dropped, not crashed.**
   - **Setup:** mock the Gemini response to include
     `step_id: "skin_cleanser"` (typo).
   - **Expected:** plan_step row not written. Other canonical steps
     land normally. `console.warn` emitted. User scan completes.

9. **Section regen changes plan_step count → past adherence shifts.**
   - **Setup:** active scan with 6 plan_steps (skin section: 4 steps,
     hair section: 2). User has 5 days of history with `completed = 4`
     each day, so adherence for those 5 days is `4/6 ≈ 67%`.
   - **Action:** user regenerates the skin section. Gemini's new
     output has 5 skin steps instead of 4 (added a treat step).
     `rescheduleAfterRegen` (§2.3) deletes the old skin plan_steps for
     this scan and inserts the new set: 5 skin + 2 hair = 7 plan_steps
     total.
   - **Expected:**
     - `routine_plan_steps` count for the active scan goes from 6 → 7.
     - `routine_completions` is untouched.
     - Re-fetching adherence for the same 5-day window now reports
       `4/7 ≈ 57%` per day. Past days re-score against the current
       plan. Documented as expected behaviour in §12.

10. **Routine tab in-flight: tap, then refresh adherence aggregate.**
    - **Setup:** 5 plan_steps for today. User has tapped 3.
    - **Action:** tap the 4th step.
    - **Expected:** optimistic flip to "checked" is visible immediately.
      `recordCompletion` writes. `fetchDailyAdherence` is re-invoked
      and returns updated counts. Streak callout re-renders with
      `doneToday = 4`.

---

## 8. Cleanup tasks bundled with this commit

- `services/habitService.ts`: drop `recordBulkCheckin` (dead since
  Phase 5 — never wired; investigation §1.5), `fetchPastDayRoutine`
  (dead — no past-day UI; §1.8), `todayISO`/`yesterdayISO` re-exports
  (dead — every caller has its own; §1.10), `RoutineCheckinRow` type
  (dead — never imported; §1.11). All replaced wholesale by the new
  exports anyway, so this is bookkeeping inside the same rewrite.
- `services/scanService.ts`: remove `logRoutineStep` (line 93-112) and
  `deriveStepCategory` (line 79-90) — both only consumers were
  `app/(tabs)/routine.tsx` (which is rewriting) and `routine_logs`
  (which is dropped).
- `services/scanService.ts`: remove the tombstone block at lines
  1576-1597. The tables it referenced (`product_events`, `product_usage`)
  no longer exist; the comment is misleading. When the affiliate
  engine lands and re-creates these tables, a fresh comment can
  document the decision then.
- `services/kitService.ts`: remove `backfillKitItemIdForStep` import
  + call. The whole try/catch block at line 75-81 collapses to nothing.
- `lib/habit.ts`: drop `generateScheduledRows`, `BEARD_DEFAULT_STEPS`,
  `washFrequencyDays` (or fold into hair plan-gen), `resolveSkinTimeOfDay`.
- `app/(tabs)/routine.tsx`: drop the local `todayISO` (line 63-65).
  Import from `services/habitService.ts` instead.
- **Deferred** (not in this commit): `.gitignore` / `.gitattributes`
  housekeeping noted in the handoff §5.3. The current diff is already
  large; deferring keeps the PR focused. Open a follow-up issue.
- **Deferred:** `score_beard` and `score_makeup` columns on `scans`
  (deprecated per `types/index.ts:362-365`, never written by new scans).
  Drop in a future Phase XI-style cleanup migration. Not in scope here.

---

## 9. Rollback

Pre-launch, big-bang. No back-out migration. Rollback path:

1. `git revert <commit-sha>` on the merged commit.
2. Restore the database from the most recent Supabase point-in-time
   snapshot taken **before the migration ran**. Take this snapshot
   manually before applying the migration in step 6.2 of the sequence;
   note its timestamp in the PR.
3. Re-deploy.

Because production has 11 real completions, the worst case is losing
those 11 rows on rollback. That's acceptable. Document in the PR body:
"Rollback wipes the 11 routine_checkins rows that exist today. We
accept this cost in exchange for a clean migration."

**Forward path note:** The migration does **not** backfill
`routine_plan_steps` for existing scans. Post-migration, the routine
tab is empty until the user takes a fresh scan that exercises the
new plan-gen path (`writePlanStepsForScan`, §2.2). This is the locked
decision: only Prateek's test scans exist, completion history is
already wiped, and a fresh scan is the cleanest exercise of the new
write path. Call this out prominently in the PR description.

There is no need for a `down.sql` because:
- `routine_checkins` data is wiped at migration time (no need to
  reconstruct it from completions).
- `routine_logs`, `product_events`, `product_usage` are wholly dead
  tables — restoring them mid-rollback is just `create table` from
  the prior migrations.

---

## 10. Open questions

These need Prateek's call before starting implementation. Sorted by
how blocking each one is.

1. **Monthly hair cadence. CLOSED (v2).** Schedule is daily-only;
   `time_of_day` enum is `('am','pm','daily')`. Hair plan-gen reads
   `cadence` from Gemini's output and ignores it — every hair step is
   coerced to `time_of_day='daily'`. Gemini prompt unchanged this
   phase. Hair-cadence translation deferred to Phase XIII.

2. **Beard `time_of_day` ambiguity.** Beard prompt
   (`lib/gemini/beard.ts:81`) does not specify `time_of_day` on
   steps. Today's `lib/habit.ts:404-408` reads it if present, defaults
   to `daily` if not. Plan options:
   - Persist beard plan_steps with `time_of_day='daily'` always.
   - Honour Gemini's `time_of_day` when supplied (matches current
     behaviour).
   Recommended: honour Gemini's array if supplied; default `daily`
   when missing. This keeps the prompt-side a no-op while letting a
   future prompt revision split beard balm AM only.

3. **Regen-path supersede gap. RESOLVED — see §12 for behaviour notes.**
   `rescheduleAfterRegen` (`services/scanService.ts:1348-1378`) uses
   delete-then-insert per the v2 locked decision:
   `delete from routine_plan_steps where scan_id = $scan_id and step_key like $section_prefix || '%'`
   (e.g. `'skin_%'` when re-running skin recommendations) first, then
   insert. The section-prefix LIKE matches §2.3 verbatim. The
   behavioural consequence (past adherence re-scoring against the new
   plan_step count) is documented in §12 as a known acceptable quirk
   for v1.

4. **Removed step_keys on full rescan.** Scan A produces
   `[skin_cleanse_am, skin_cleanse_pm, skin_treat_1_am, skin_moisturize_am, skin_moisturize_pm, skin_protect_am]`. Scan B (rescan) produces only `[skin_cleanse_am, ...]` (no treat step
   because concerns resolved). Should B's plan_step set strictly
   replace A's, or should A's untouched step_keys persist?
   Active scan = B, so the routine UI only renders B's. But B's
   plan_steps don't include treat_1 — historical completions for
   treat_1 (tied to scan_id=A) still exist and still show in
   adherence. This is correct behaviour.
   Open question: do we ever need to "see what the previous scan's
   treat step was" outside the deltaService? If yes, the active-scan
   query in §3.1 needs adjustment (probably not — the routine tab
   is *only* the current plan).
   Recommended: B replaces A entirely from the user's perspective.
   No special handling.

5. **Hair `serum`/`mask` as treatment vs maintenance. CLOSED (v2).**
   `step_type` is now derived from `step.target_concern` presence
   (§5). Hair prompt currently doesn't emit `target_concern`, so hair
   steps classify as `maintenance`. If a future hair prompt adds
   `target_concern` to (say) `hair_serum`, that step automatically
   becomes a treatment with no code change.

6. **The `kit_item_id` step_id matching pattern in deltaService.**
   Per locked decision: rstrip `_am`/`_pm` from completion.step_key
   to match `user_kit.step_id` (which is unsuffixed —
   `services/habitService.ts:455` confirms). Recommended pattern: a
   single helper `stripSlotSuffix(stepKey)` exported from `lib/habit.ts`
   used by both `deltaService` and any future kit-related read. The
   alternatives — adding suffixed kit rows, or a different schema — are
   strictly worse: more rows, no benefit.
   This is the locked-decision-compatible answer; flagging only to
   confirm Prateek wants it as one shared helper rather than
   duplicating the strip logic in deltaService.

7. **Makeup steps in the new schema.** Investigation §6.2 +
   `lib/habit.ts:333` filter out makeup with
   `s.step_id.startsWith('makeup_')`. Current routine tab does not
   render makeup (per `app/(tabs)/routine.tsx:42` — `Period =
   'AM' | 'PM'` and care categories include makeup but the step list
   is filtered to skin/hair/beard). Plan options:
   - **(a) Continue dropping makeup at plan-gen time.** Status quo.
     `routine_plan_steps` never has makeup rows.
   - **(b) Add makeup as plan_steps with new step_keys** (`makeup_*`)
     and render them.
   Recommended: (a). Makeup is daily occasional behaviour, not a
   tracked routine. Revisit when makeup tracking is in scope.

8. **Routine plan_step deletion semantics on user_kit row removal.**
   Today: `routine_checkins.kit_item_id → user_kit(id) ON DELETE SET
   NULL`. New schema: no kit_item_id on completions. User removes a
   kit row → no completion-side change at all. Plan: this is fine.
   The only consequence is that the next deltaService run won't
   attribute completions to the removed kit item. Document this in
   the PR.

9. **Plan_steps RLS via scans subquery vs. denormalised user_id. CLOSED (v2).**
   Denormalised `user_id` chosen. RLS uses the standard
   `auth.uid() = user_id` pattern matching every other table. See
   §1.1 SQL.

10. **`routine_plan_steps.target_concern` denormalisation.** Today
    `target_concern` lives only on the JSONB step. The new table
    persists it. This is a deliberate denormalisation: recommends
    consult-the-DB queries (e.g., "how many users have an `acne`
    treatment plan_step active right now?") without parsing JSONB.
    Locked decision approves it. Just confirming Prateek is OK with
    duplicating the value across `scans.recommendations.skin.steps[].target_concern`
    and `routine_plan_steps.target_concern`.

11. **What Prateek sees in his own data right now.** The investigation
    §8 + §11 query lists are still un-run (RLS blocks anon reads from
    `routine_checkins`). If Prateek runs them before merging, we'd
    confirm:
    - Current row count in `routine_checkins` matches the "11
      completions" assumption (§9 of this plan).
    - Current `step_id` distribution matches the canonical set (no
      Phase-D-style legacy `skin_am_*` rows lingering).
    Not a blocker for the migration, but useful for the rollback-cost
    paragraph.

---

## 11. Contradictions vs. locked decisions / verification

None found.

Re-verified against v2 locked decisions:
- §4 (canonicalization in TS, not CHECK) ← matches the brief verbatim.
- §1.1 `time_of_day` CHECK is `('am','pm','daily')` ← matches v2.
- §1.1 has no `target_per_week` column ← matches v2.
- §1.1 has denormalised `user_id` on `routine_plan_steps` with
  standard `auth.uid() = user_id` RLS ← matches v2.
- §1.1 (no `kit_item_id` on completions, no `superseded` flag) ←
  matches the brief verbatim.
- §2.1 hair plan-gen coerces every hair step to `time_of_day='daily'`,
  ignoring Gemini's `cadence` field ← matches v2.
- §2.1 `expectedDailyAdherence` is daily-only, no buckets, no replay
  ← matches v2.
- §5 `mapStepType` reads `step.target_concern` presence; no hardcoded
  step_id list ← matches v2.
- §6 / §9 document fresh-scan-required (no plan_steps backfill for
  existing scans) ← matches v2.
- §12 documents the regen rescoring quirk ← matches v2.

---

## 12. Known behaviors

These are intentional v1 quirks, not bugs. Documented so future-us
doesn't re-litigate them.

### 12.1 Regen rescores past adherence

When a user regenerates a section (e.g., re-runs skin recommendations
on the same scan_id), `rescheduleAfterRegen` deletes the old plan_steps
for that section and inserts the new set (§10 Q3, §2.3).
`routine_completions` are untouched.

Adherence math is `completed_completions / expected_completions`,
where `expected_completions` is computed from the **current**
plan_steps (§2.1 `expectedDailyAdherence`). This means past-day
adherence and streak math may shift retroactively when the section's
plan_step count changes:

- Most regens preserve step_keys (just refresh products/labels). In
  that case the count is unchanged and adherence math doesn't move.
- When a step is added or removed by regen, `scheduledPerDay` shifts
  for **every** day in the window, including days before the regen.
  Past adherence percentages re-score proportionally.

Acceptable for v1: regen is rare, the user-visible percentage shift is
proportional and small (1 step out of 5–7), and snapshotting expected
counts per-day would add a new table/column for a corner case. Revisit
with a `daily_adherence_snapshot` table or per-completion
`expected_at_time_of_completion` if user feedback flags it as
confusing.

### 12.2 Routine tab is empty until the first post-migration scan

The migration does not backfill `routine_plan_steps` for existing
scans. Until the user takes a new scan, `fetchTodayRoutine` returns an
empty list. See §6 step 4 and §9 for the rationale (pre-launch, only
test scans, completion history wiped anyway).

### 12.3 Hair cadence is ignored in v1

Plan-gen reads `cadence` from each `userHairRoutine[]` entry and
discards it. Every hair plan_step is written with
`time_of_day='daily'`. The Gemini hair prompt (`lib/gemini/hair.ts:114, 164`)
still emits `cadence: every_wash | weekly | monthly` — that's
unchanged this phase. Hair cadence translation lives in Phase XIII.

End of plan.
