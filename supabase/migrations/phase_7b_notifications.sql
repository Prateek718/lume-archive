-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 7B — Notifications schema
-- Adds five granular notification booleans and two HH:MM time strings for
-- the morning + evening routine cues. Replaces the old binary
-- notification_routine / notification_reminders pair (kept around for now;
-- deprecation cleanup happens in a later phase).
-- Date: 2026-04-30
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_morning_routine BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_evening_routine BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_weekly_summary  BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_rescan          BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_milestones      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notify_morning_time    TEXT    DEFAULT '07:30',
  ADD COLUMN IF NOT EXISTS notify_evening_time    TEXT    DEFAULT '22:00';

COMMENT ON COLUMN users.notify_morning_time IS 'HH:MM 24-hour format';
COMMENT ON COLUMN users.notify_evening_time IS 'HH:MM 24-hour format';
