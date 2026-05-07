-- =============================================================================
-- Phase XI cleanup: create missing telemetry tables
--
-- Purpose: Create public.routine_logs and public.product_usage. The
-- application code (services/scanService.ts) inserts into both tables on
-- every scan, but neither table existed in the database. The writes were
-- failing silently because the application's telemetry pattern wraps
-- inserts in try/catch and ignores errors.
--
-- After this migration, both tables exist and the silently-failing inserts
-- begin succeeding. Step-event logging and product-usage telemetry that
-- had been lost since these features were built will now be recorded.
--
-- Schema design notes:
--
--   * Both tables follow the established telemetry pattern in this schema:
--     write-only from client roles (anon, authenticated), readable only by
--     service_role for analytics and admin work.
--
--   * Foreign keys cascade on user deletion (right-to-be-forgotten) and
--     SET NULL on scan deletion (preserve telemetry history even when the
--     originating scan is deleted).
--
--   * Indexes support both FK lookups (for cascade-on-delete efficiency)
--     and the analytical query patterns expected for these tables (per-user
--     timeline, per-product trends, per-category aggregation).
--
--   * No CHECK constraint on category — the free-text approach lets the
--     vocabulary evolve as product features are built without requiring
--     migration churn. A constraint can be added later when the category
--     vocabulary stabilizes.
--
--   * product_usage.using_it is preserved as a nullable boolean. The
--     application currently writes it as null on every insert, which
--     reflects an incomplete feature — a planned mechanism for capturing
--     whether the user is actually using a recommended product. The
--     product recommendation engine is being rebuilt; using_it is kept
--     so the rebuild can wire it up cleanly rather than re-add the column.
--
-- Idempotent: safe to apply to existing or fresh databases.
-- Non-destructive: creates tables; does not modify or delete any data.
-- =============================================================================


-- ─────────────────────────────────────────────────
-- TABLE: public.routine_logs
--
-- Records each routine step the user completes. Written by
-- services/scanService.ts logRoutineStep() after a step is checked off.
-- ─────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────
-- INDEXES on routine_logs
-- ─────────────────────────────────────────────────

create index if not exists idx_routine_logs_user_completed
  on public.routine_logs (user_id, completed_at desc);

create index if not exists idx_routine_logs_scan
  on public.routine_logs (scan_id)
  where scan_id is not null;

create index if not exists idx_routine_logs_category_completed
  on public.routine_logs (category, completed_at desc)
  where category is not null;


-- ─────────────────────────────────────────────────
-- TABLE: public.product_usage
--
-- Records product-related events the application captures. Written by
-- services/scanService.ts logProductEvent (or analogous function).
--
-- using_it: nullable boolean, currently always written as null. Reserved
-- for the planned product recommendation engine rebuild.
-- ─────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────
-- INDEXES on product_usage
-- ─────────────────────────────────────────────────

create index if not exists idx_product_usage_user_created
  on public.product_usage (user_id, created_at desc);

create index if not exists idx_product_usage_scan
  on public.product_usage (scan_id)
  where scan_id is not null;

create index if not exists idx_product_usage_product_created
  on public.product_usage (product_id, created_at desc);

create index if not exists idx_product_usage_category_created
  on public.product_usage (category, created_at desc)
  where category is not null;


-- ─────────────────────────────────────────────────
-- Enable RLS on both tables
--
-- The ensure_rls event trigger should auto-enable RLS on these tables
-- because they are CREATE TABLE statements in the public schema, but
-- explicit enable is included for clarity and idempotency on existing DBs.
-- ─────────────────────────────────────────────────

alter table public.routine_logs  enable row level security;
alter table public.product_usage enable row level security;


-- ─────────────────────────────────────────────────
-- RLS policies on routine_logs and product_usage
--
-- Write-only from client context. Each user can insert their own rows.
-- No SELECT policy: these are operator-facing analytics tables, accessed
-- via service_role for admin queries.
-- ─────────────────────────────────────────────────

create policy routine_logs_insert_own
  on public.routine_logs
  for insert
  with check (auth.uid() = user_id);

create policy product_usage_insert_own
  on public.product_usage
  for insert
  with check (auth.uid() = user_id);
