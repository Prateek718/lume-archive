-- =============================================================================
-- Phase 00 baseline: telemetry tables (gemini_usage, product_events)
--
-- Purpose: Capture the public.gemini_usage and public.product_events tables
-- as they exist at the start of Phase XI. Both were originally created via
-- the Supabase dashboard and were never captured in migration files.
--
-- gemini_usage tracks AI API call telemetry (tokens, cost, duration).
-- product_events tracks user product interactions (taps, etc.) for analytics.
--
-- Notable issues captured here as-is, scheduled for fix in Phase XI cleanup:
--
--   1. gemini_usage_call_type_check allows only ('vision','skin_recs',
--      'hair_recs') — three values out of six the application code emits.
--      Inserts with call_type IN ('beard_recs','makeup_recs',
--      'delta_commentary') are silently rejected by this CHECK constraint.
--      The application's logUsage function wraps inserts in try/catch and
--      swallows the resulting errors, so failures are invisible. Half of
--      AI cost telemetry is currently being lost.
--      Fix: phase_xi_fixes_and_indexes.sql expands the constraint to all 6.
--
--   2. product_events.scan_id has no ON DELETE rule (defaults to NO ACTION).
--      Deleting a scan with referenced product_events will fail. The user
--      delete_user RPC depends on cascading deletes; this constraint
--      currently breaks it.
--      Fix: phase_xi_fixes_and_indexes.sql changes to ON DELETE SET NULL.
--
--   3. product_events.user_id also has no ON DELETE rule. For consistency
--      with gemini_usage.user_id (CASCADE) and right-to-be-forgotten
--      requirements, this should cascade when a user is deleted.
--      Fix: phase_xi_fixes_and_indexes.sql changes to ON DELETE CASCADE.
--
--   4. product_events has no performance indexes (only the primary key).
--      Common queries by user_id or scan_id would scan the full table.
--      Fix: phase_xi_fixes_and_indexes.sql adds appropriate indexes.
--
--   5. user_id foreign keys on both tables reference auth.users instead of
--      public.users. Other tables in the schema reference public.users
--      (e.g., scans.user_id). Captured as-is; standardization across the
--      schema is deferred to a future migration.
--
-- See migrations/README.md for migration conventions.
-- See docs/codebase-db-map.md for the full Phase XI audit.
--
-- Idempotent: safe to apply to existing or fresh databases.
-- Non-destructive: never drops or modifies user data.
-- =============================================================================


-- ─────────────────────────────────────────────────
-- TABLE: public.gemini_usage
--
-- 13 columns. cost_inr is a generated column auto-computed from cost_usd
-- at a fixed conversion rate of 95 INR per USD. The rate is intentionally
-- a static estimate (USD/INR fluctuates; a slightly conservative ceiling
-- estimate is acceptable for cost tracking purposes).
-- ─────────────────────────────────────────────────

create table if not exists public.gemini_usage (
  id              uuid         primary key default gen_random_uuid(),
  user_id         uuid         references auth.users(id) on delete cascade,
  scan_id         uuid         references public.scans(id) on delete set null,
  call_type       text         not null,
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


-- ─────────────────────────────────────────────────
-- CHECK constraint on gemini_usage.call_type
--
-- KNOWN-BROKEN: missing 'beard_recs', 'makeup_recs', 'delta_commentary'.
-- Captured as-is; fixed in phase_xi_fixes_and_indexes.sql.
-- ─────────────────────────────────────────────────

alter table public.gemini_usage drop constraint if exists gemini_usage_call_type_check;
alter table public.gemini_usage
  add constraint gemini_usage_call_type_check
  check (call_type = any (array['vision','skin_recs','hair_recs']));


-- ─────────────────────────────────────────────────
-- INDEXES on gemini_usage
--
-- The primary key index (gemini_usage_pkey) is auto-created by the
-- PRIMARY KEY declaration above and is not declared explicitly here.
-- ─────────────────────────────────────────────────

create index if not exists idx_gemini_usage_created
  on public.gemini_usage (created_at desc);

create index if not exists idx_gemini_usage_scan
  on public.gemini_usage (scan_id)
  where scan_id is not null;

create index if not exists idx_gemini_usage_user_created
  on public.gemini_usage (user_id, created_at desc);


-- ─────────────────────────────────────────────────
-- TABLE: public.product_events
--
-- 9 columns. Foreign keys on user_id and scan_id deliberately have no
-- ON DELETE rule in the live database (default NO ACTION). This is a
-- known issue; see file header for fix plan.
-- ─────────────────────────────────────────────────

create table if not exists public.product_events (
  id            uuid         primary key default gen_random_uuid(),
  user_id       uuid         references auth.users(id),
  scan_id       uuid         references public.scans(id),
  product_id    text         not null,
  product_name  text,
  brand         text,
  category      text,
  event_type    text,
  created_at    timestamptz  default now()
);


-- ─────────────────────────────────────────────────
-- Enable RLS on both tables
--
-- Idempotent: enabling already-enabled RLS is a no-op.
-- RLS policies for these tables are captured in phase_00_baseline_rls.sql.
-- ─────────────────────────────────────────────────

alter table public.gemini_usage   enable row level security;
alter table public.product_events enable row level security;
