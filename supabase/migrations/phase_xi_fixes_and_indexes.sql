-- =============================================================================
-- Phase XI cleanup: schema corrections and analytical indexes
--
-- Purpose: Apply five categories of fix to the live schema, all identified
-- during the Phase XI audit:
--
--   1. Expand the gemini_usage_call_type_check constraint to allow all 6
--      call types the application emits. The current constraint only
--      allows 3, causing telemetry rows for beard_recs, makeup_recs, and
--      delta_commentary to be silently rejected. Empirical confirmation:
--      a test scan that fired all 4 call types produced gemini_usage rows
--      for only 2 of them.
--
--   2. Standardize user_id foreign keys on telemetry tables. Currently
--      gemini_usage.user_id and product_events.user_id reference
--      auth.users(id), while the rest of the schema (scans.user_id, etc.)
--      references public.users(id). Switch to public.users for consistency.
--      The handle_new_user trigger guarantees a 1:1 mapping between
--      auth.users and public.users, so this is functionally equivalent
--      but structurally consistent.
--
--   3. Add ON DELETE rules to product_events foreign keys. Both user_id
--      and scan_id currently default to NO ACTION, which means deleting
--      a user or scan that has product_events rows fails. The user
--      delete_user RPC depends on cascading deletes; this is a real bug
--      blocking right-to-be-forgotten compliance.
--
--   4. Add the missing scans(user_id, created_at DESC) index. This is
--      the most common scan-query pattern in the application ("user's
--      latest scan", "user's scan history") and currently performs a
--      full table scan.
--
--   5. Add analytical and FK indexes to support the kinds of queries
--      this telemetry will eventually feed: per-user timelines, per-
--      product trends, per-category aggregation, per-call-type cost
--      analysis, and FK lookups for cascade-delete efficiency.
--
-- Idempotent: uses DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT pattern for
-- foreign keys, and CREATE INDEX IF NOT EXISTS for indexes.
-- Non-destructive: does not drop or modify any data; only changes constraints
-- and adds indexes. The constraint expansion in section 1 is a strict
-- relaxation (allows new values without rejecting existing ones).
-- =============================================================================


-- ─────────────────────────────────────────────────
-- 1. Expand gemini_usage_call_type_check to all 6 call types
--
-- Current allowed values: vision, skin_recs, hair_recs
-- New allowed values: vision, skin_recs, hair_recs, beard_recs,
--                     makeup_recs, delta_commentary
-- ─────────────────────────────────────────────────

alter table public.gemini_usage drop constraint if exists gemini_usage_call_type_check;
alter table public.gemini_usage
  add constraint gemini_usage_call_type_check
  check (call_type = any (array[
    'vision',
    'skin_recs',
    'hair_recs',
    'beard_recs',
    'makeup_recs',
    'delta_commentary'
  ]));


-- ─────────────────────────────────────────────────
-- 2 & 3. Standardize and fix telemetry foreign keys
--
-- Both gemini_usage and product_events have user_id FKs pointing at
-- auth.users; standardize to public.users. product_events FKs additionally
-- get explicit ON DELETE rules where they were missing.
-- ─────────────────────────────────────────────────

-- gemini_usage.user_id: auth.users → public.users (CASCADE preserved)
alter table public.gemini_usage drop constraint if exists gemini_usage_user_id_fkey;
alter table public.gemini_usage
  add constraint gemini_usage_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

-- product_events.user_id: auth.users (NO ACTION) → public.users (CASCADE)
alter table public.product_events drop constraint if exists product_events_user_id_fkey;
alter table public.product_events
  add constraint product_events_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;

-- product_events.scan_id: scans (NO ACTION) → scans (SET NULL)
alter table public.product_events drop constraint if exists product_events_scan_id_fkey;
alter table public.product_events
  add constraint product_events_scan_id_fkey
  foreign key (scan_id) references public.scans(id) on delete set null;


-- ─────────────────────────────────────────────────
-- 4. Add the missing critical scans index
--
-- Used by every "user's latest scan" and "user's scan history" query.
-- Without it, these queries perform a sequential scan of the entire
-- scans table and sort the results. With it, the query reads a small
-- index range in the desired order.
-- ─────────────────────────────────────────────────

create index if not exists idx_scans_user_created
  on public.scans (user_id, created_at desc);


-- ─────────────────────────────────────────────────
-- 5. Analytical and FK indexes
--
-- These support analytical queries and FK lookups.
-- ─────────────────────────────────────────────────

-- product_events: 5 indexes (FK + analytical)
create index if not exists idx_product_events_user_created
  on public.product_events (user_id, created_at desc);

create index if not exists idx_product_events_scan
  on public.product_events (scan_id)
  where scan_id is not null;

create index if not exists idx_product_events_product_created
  on public.product_events (product_id, created_at desc);

create index if not exists idx_product_events_category_created
  on public.product_events (category, created_at desc)
  where category is not null;

create index if not exists idx_product_events_event_type
  on public.product_events (event_type)
  where event_type is not null;

-- gemini_usage: 1 analytical index (existing 3 cover other patterns)
create index if not exists idx_gemini_usage_call_type_created
  on public.gemini_usage (call_type, created_at desc);

-- routine_checkins.kit_item_id: FK index (FK exists, no supporting index)
create index if not exists idx_routine_checkins_kit_item
  on public.routine_checkins (kit_item_id)
  where kit_item_id is not null;

-- scan_deltas.from_scan_id: FK index (FK exists, no supporting index)
create index if not exists idx_scan_deltas_from_scan
  on public.scan_deltas (from_scan_id);

-- salon_profiles.created_by: FK index (FK exists, no supporting index)
create index if not exists idx_salon_profiles_created_by
  on public.salon_profiles (created_by)
  where created_by is not null;
