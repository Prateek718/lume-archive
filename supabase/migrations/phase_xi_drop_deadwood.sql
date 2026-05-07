-- =============================================================================
-- Phase XI cleanup: drop dead columns and tables
--
-- Purpose: Remove 14 columns and 1 table from the live database that the
-- Phase XI codebase audit identified as dead — referenced in code only as
-- type declarations, write-only with null values, or not referenced at all.
--
-- Each column was verified before this migration:
--   - Code reachability: no production code path reads or writes it
--   - Live data: confirmed null/empty across recent scans (no meaningful
--     data is destroyed)
--
-- This migration is destructive by design. It is the deliberate counterpart
-- to the phase_00 baseline migrations that captured these columns as-is.
-- The baseline files preserve the historical record; this file removes the
-- dead weight.
--
-- Coordinated code edits in the same commit:
--   - types/index.ts: 3 Scan fields removed, 3 User fields removed,
--     Waitlist interface removed, 4 stale sub-key references removed
--   - lib/gemini/vision.ts: 5 skin_tone references removed,
--     2 stale hair_texture sub-key references removed
--   - services/scanService.ts: 132 lines of stale SQL doc-blocks removed,
--     3 skin_tone write sites removed
--   - app/skin-detail.tsx: skin_tone removed from local types and SELECTs
--   - app/recommendations.tsx: skin_tone removed from local types and SELECTs
--   - app/gemini-test.tsx: skin_tone fixture removed
--
-- Notable design notes:
--
--   * scans.skin_tone is dropped despite being a Gemini-emitted field. The
--     value was being written but never read — no UI component, derivation,
--     or downstream call referenced it. The Gemini prompt schema is updated
--     to stop requesting it.
--
--   * The dead users columns (push_token, notification_reminders,
--     notification_routine, routine_level, preferred_brands) reflect
--     incomplete or superseded features. push notifications were never
--     wired up. preferred_brands was replaced by preferred_brands_v2.
--     routine_level was replaced by per-step generation.
--
--   * The waitlist table has zero rows and no application code reads or
--     writes it. The pre-launch waitlist signup flow either never reached
--     production or was removed.
--
--   * Postgres auto-drops dependent CHECK constraints when their columns
--     are dropped. The following constraints will disappear automatically:
--     scans_brow_shape_check, scans_hair_texture_check,
--     scans_hair_condition_check, scans_score_hair_check.
--
-- Idempotent: uses DROP COLUMN IF EXISTS / DROP TABLE IF EXISTS.
-- Destructive: drops columns and a table; cannot be reversed by re-running.
-- =============================================================================


-- ─────────────────────────────────────────────────
-- Drop dead columns from public.scans (9 columns)
--
-- Each was confirmed null on the most recent scan and has zero code
-- reachability for reads. Postgres auto-drops dependent CHECK constraints.
-- ─────────────────────────────────────────────────

alter table public.scans drop column if exists hair_texture;
alter table public.scans drop column if exists hair_condition;
alter table public.scans drop column if exists score_hair;
alter table public.scans drop column if exists tier_label;
alter table public.scans drop column if exists stylist_mentioned;
alter table public.scans drop column if exists share_count;
alter table public.scans drop column if exists brow_shape;
alter table public.scans drop column if exists skin_age;
alter table public.scans drop column if exists skin_tone;


-- ─────────────────────────────────────────────────
-- Drop dead columns from public.users (5 columns)
-- ─────────────────────────────────────────────────

alter table public.users drop column if exists push_token;
alter table public.users drop column if exists notification_reminders;
alter table public.users drop column if exists notification_routine;
alter table public.users drop column if exists routine_level;
alter table public.users drop column if exists preferred_brands;


-- ─────────────────────────────────────────────────
-- Drop public.waitlist table
--
-- Zero rows, zero code references. Was captured in the phase_00 baseline
-- because it existed in the live DB; now removed because no feature uses it.
-- ─────────────────────────────────────────────────

drop table if exists public.waitlist;
