-- ═══════════════════════════════════════════════════════════════════════════
-- Phase E — Milestones
-- Adds: user_milestones
-- Date: 2026-04-21
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_milestones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_key   text NOT NULL,
  earned_at       timestamptz NOT NULL DEFAULT now(),
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  celebrated      boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, milestone_key)
);

COMMENT ON TABLE user_milestones IS 'Milestones earned by users. One row per (user, milestone_key). celebrated=false means user has not seen the celebration screen yet.';

CREATE INDEX IF NOT EXISTS idx_user_milestones_user ON user_milestones (user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_milestones_uncelebrated ON user_milestones (user_id, celebrated) WHERE celebrated = false;

ALTER TABLE user_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own milestones" ON user_milestones;
CREATE POLICY "Users read own milestones" ON user_milestones
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users write own milestones" ON user_milestones;
CREATE POLICY "Users write own milestones" ON user_milestones
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
