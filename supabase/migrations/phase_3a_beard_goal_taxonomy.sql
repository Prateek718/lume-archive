-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3A — Beard goal taxonomy migration + scan_type enumeration
-- Replaces internal beard_goal taxonomy with user-facing labels.
-- Adds scan_type CHECK constraint restricting to 'first' | 'rescan'.
-- Date: 2026-04-23
--
-- Old beard_goal values: clean_simple | healthy_groomed | growing_thickening | styled
-- New beard_goal values: fuller | sharper | shorter | longer | none
--
-- Old scan_type values: free-form text (legacy: 'full_face')
-- New scan_type values: 'first' | 'rescan'
--
-- The DB was truncated before this migration — any orphan rows with old
-- enum values were dropped, so the constraint switch is safe.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. users.beard_goal — swap CHECK constraint to new taxonomy ──────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_beard_goal_check;
ALTER TABLE users ADD CONSTRAINT users_beard_goal_check
  CHECK (beard_goal IS NULL OR beard_goal IN ('fuller', 'sharper', 'shorter', 'longer', 'none'));

-- ── 2. scans.scan_type — add CHECK constraint for first/rescan enum ──────────
ALTER TABLE scans DROP CONSTRAINT IF EXISTS scans_scan_type_check;
ALTER TABLE scans ADD CONSTRAINT scans_scan_type_check
  CHECK (scan_type IS NULL OR scan_type IN ('first', 'rescan'));
