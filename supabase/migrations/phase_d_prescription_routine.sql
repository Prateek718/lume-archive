-- ═══════════════════════════════════════════════════════════════════════════
-- Phase D — Prescription routine redesign
-- Adds: users.beard_goal column
-- Supersedes: existing routine_checkins keyed off the old skin_am_*/skin_pm_*
--             step_id schema. Those rows continue to satisfy adherence math
--             for past dates but stop counting toward future scheduling.
-- Date: 2026-04-21
-- ═══════════════════════════════════════════════════════════════════════════

-- Add beard_goal to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS beard_goal TEXT
    CHECK (beard_goal IN ('clean_simple', 'healthy_groomed', 'growing_thickening', 'styled'));

-- Supersede all old-format routine_checkins rows so they stop appearing as
-- "scheduled but uncompleted" once new-format rows land for the same dates.
UPDATE routine_checkins
   SET superseded = true,
       updated_at = now()
 WHERE superseded = false
   AND (step_id LIKE 'skin_am_%' OR step_id LIKE 'skin_pm_%');
