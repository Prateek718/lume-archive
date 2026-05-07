-- =============================================================================
-- Phase 00 baseline: RLS policies for users, scans, gemini_usage,
-- product_events, waitlist
--
-- Purpose: Capture the row-level-security policies for tables that don't
-- have their own dedicated migration files. Other tables (routine_checkins,
-- user_kit, scan_deltas, user_milestones, salon_profiles, salon_ratings)
-- have their RLS policies defined in their respective migrations and are
-- not redeclared here.
--
-- This file is the last of the phase_00 baseline migrations. After this
-- migration runs, all schema in the live database is reproducible from
-- supabase/migrations/.
--
-- Naming convention: policies use snake_case <table>_<action>_<scope>
-- (e.g. scans_select_own, users_insert_own). This replaces the inconsistent
-- mix of human-readable names that accumulated over time. See
-- migrations/README.md for the convention and rationale.
--
-- Notable corrections applied during capture (i.e., not pure transcription):
--
--   1. The users table had 5 policies in the live DB: 2 SELECT and 2 UPDATE,
--      with each pair functionally identical (one named "own row", the
--      other "own profile"). The duplicates are removed; one canonical
--      SELECT and one canonical UPDATE policy remain.
--
--   2. The gemini_usage SELECT policy ("Users can view their own gemini
--      usage") is removed and not replaced. AI cost telemetry is
--      operator-facing data that should not be exposed to client roles.
--      Service role bypasses RLS by default, so admin scripts and analytics
--      queries continue to work; anon and authenticated users now get no
--      SELECT access. No application code reads gemini_usage from a client
--      context (verified during the Phase XI audit).
--
-- Idempotent: drop + create pattern makes this safe to apply multiple times.
-- Non-destructive: never drops or modifies user data; only changes access
-- control rules.
-- =============================================================================


-- ─────────────────────────────────────────────────
-- Drop legacy human-readable policy names.
--
-- These were created with the original Supabase dashboard UI which
-- defaults to verbose names. We replace them with consistent
-- snake_case names below.
-- ─────────────────────────────────────────────────

drop policy if exists "Users can insert own row"        on public.users;
drop policy if exists "Users can select own row"        on public.users;
drop policy if exists "Users can view own profile"      on public.users;
drop policy if exists "Users can update own row"        on public.users;
drop policy if exists "Users can update own profile"    on public.users;

drop policy if exists "Users can insert own scans"      on public.scans;
drop policy if exists "Users can view own scans"        on public.scans;
drop policy if exists "Users can update own scans"      on public.scans;
drop policy if exists "Users can delete own scans"      on public.scans;

drop policy if exists "Users can insert their own gemini usage"  on public.gemini_usage;
drop policy if exists "Users can view their own gemini usage"    on public.gemini_usage;

drop policy if exists "Users can insert their own product events" on public.product_events;

drop policy if exists "Anyone can join waitlist"        on public.waitlist;


-- ─────────────────────────────────────────────────
-- Policies on public.users
--
-- Each user can read, insert, and update their own row. No DELETE policy:
-- account deletion is handled exclusively through the delete_user RPC
-- which bypasses RLS (SECURITY DEFINER). Direct DELETE attempts from
-- client roles will fail, which is correct.
-- ─────────────────────────────────────────────────

create policy users_insert_own
  on public.users
  for insert
  with check (auth.uid() = id);

create policy users_select_own
  on public.users
  for select
  using (auth.uid() = id);

create policy users_update_own
  on public.users
  for update
  using (auth.uid() = id);


-- ─────────────────────────────────────────────────
-- Policies on public.scans
--
-- Full CRUD scoped to the authenticated user's own rows.
-- ─────────────────────────────────────────────────

create policy scans_insert_own
  on public.scans
  for insert
  with check (auth.uid() = user_id);

create policy scans_select_own
  on public.scans
  for select
  using (auth.uid() = user_id);

create policy scans_update_own
  on public.scans
  for update
  using (auth.uid() = user_id);

create policy scans_delete_own
  on public.scans
  for delete
  using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────
-- Policies on public.gemini_usage
--
-- Write-only from client context. Each user can insert their own
-- telemetry rows (the application's logUsage function does this after
-- every Gemini call). No SELECT policy: cost telemetry is operator-only
-- data, accessed via service_role for admin scripts and analytics.
-- ─────────────────────────────────────────────────

create policy gemini_usage_insert_own
  on public.gemini_usage
  for insert
  with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────────
-- Policies on public.product_events
--
-- Write-only from client context. Each user can insert their own
-- product-interaction events. No SELECT policy: this is analytics
-- data accessed via service_role.
-- ─────────────────────────────────────────────────

create policy product_events_insert_own
  on public.product_events
  for insert
  with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────────
-- Policies on public.waitlist
--
-- Open INSERT for unauthenticated users (pre-launch signup form).
-- Note: scheduled for removal in Phase XI cleanup along with the
-- waitlist table itself.
-- ─────────────────────────────────────────────────

create policy waitlist_insert_anyone
  on public.waitlist
  for insert
  with check (true);
