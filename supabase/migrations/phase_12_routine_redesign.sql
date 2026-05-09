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
