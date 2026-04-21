-- ═══════════════════════════════════════════════════════════════════════════
-- Phase F — Rescan delta + feedback
-- Adds: user_feedback column to scan_deltas (rescan dead-time question answers)
-- Re-asserts: scan_deltas table (originally from Phase C) so this file is
-- idempotent on both fresh and upgraded databases.
-- Date: 2026-04-21
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scan_deltas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_scan_id           uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  to_scan_id             uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  days_between           integer NOT NULL,

  score_changes          jsonb NOT NULL DEFAULT '{}'::jsonb,
  concerns_improved      text[] NOT NULL DEFAULT ARRAY[]::text[],
  concerns_new           text[] NOT NULL DEFAULT ARRAY[]::text[],
  concerns_persistent    text[] NOT NULL DEFAULT ARRAY[]::text[],

  adherence_overall      numeric(5,2),
  adherence_by_category  jsonb NOT NULL DEFAULT '{}'::jsonb,
  adherence_weekly       jsonb NOT NULL DEFAULT '[]'::jsonb,

  streak_longest         integer,
  streak_at_rescan       integer,
  freezes_used           integer NOT NULL DEFAULT 0,

  products_used          jsonb NOT NULL DEFAULT '[]'::jsonb,

  user_feedback          jsonb NOT NULL DEFAULT '{}'::jsonb,

  computed_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (to_scan_id)
);

COMMENT ON TABLE scan_deltas IS 'Pre-computed comparison between two consecutive scans. Written once per rescan. Read by the delta view.';

-- Ensure user_feedback exists on databases upgraded from Phase C (which
-- defined scan_deltas without this column). Safe on fresh databases too.
ALTER TABLE scan_deltas
  ADD COLUMN IF NOT EXISTS user_feedback jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_scan_deltas_user    ON scan_deltas (user_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_deltas_to_scan ON scan_deltas (to_scan_id);

ALTER TABLE scan_deltas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own deltas" ON scan_deltas;
CREATE POLICY "Users read own deltas" ON scan_deltas
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own deltas" ON scan_deltas;
CREATE POLICY "Users insert own deltas" ON scan_deltas
  FOR INSERT WITH CHECK (auth.uid() = user_id);
