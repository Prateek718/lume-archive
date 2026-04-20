-- ═══════════════════════════════════════════════════════════════════════════
-- Phase C — Habit engine tables
-- Adds: routine_checkins, user_kit, scan_deltas
-- Extends: (no changes to existing tables)
-- Date: 2026-04-20
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- TABLE 1: routine_checkins
-- One row per (user, step, date). Pre-generated at scan time with
-- completed_at = null. User check-ins set completed_at.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS routine_checkins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_id         uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  step_id         text NOT NULL,
  date            date NOT NULL,
  time_of_day     text NOT NULL CHECK (time_of_day IN ('am', 'pm', 'weekly', 'monthly', 'daily')),
  completed_at    timestamptz,
  kit_item_id     uuid,
  superseded      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, step_id, date)
);

COMMENT ON TABLE routine_checkins IS 'Per-step per-day adherence log. Rows are pre-generated when a scan completes, then filled in via user check-ins. superseded=true when user rescans before a scheduled day — those rows stop counting against adherence.';

CREATE INDEX IF NOT EXISTS idx_routine_checkins_user_date   ON routine_checkins (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_routine_checkins_user_step   ON routine_checkins (user_id, step_id);
CREATE INDEX IF NOT EXISTS idx_routine_checkins_scan        ON routine_checkins (scan_id);
CREATE INDEX IF NOT EXISTS idx_routine_checkins_adherence   ON routine_checkins (user_id, date, superseded) WHERE superseded = false;


-- ───────────────────────────────────────────────────────────────────────────
-- TABLE 2: user_kit
-- Products the user owns, whether bought via Lumé or self-reported.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_kit (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id               text NOT NULL,
  step_id                  text,
  acquired_via             text NOT NULL CHECK (acquired_via IN ('lume_affiliate', 'already_owned', 'replaced')),
  acquired_at              timestamptz NOT NULL DEFAULT now(),
  last_reorder_at          timestamptz,
  estimated_duration_days  integer,
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_kit IS 'User product kit. Tracks what they own, where it came from, and last re-order timing. step_id is nullable for reference-only products (e.g. makeup) that are not tied to tracked routine steps.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_kit_active_step
  ON user_kit (user_id, step_id)
  WHERE is_active = true AND step_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_kit_user_active    ON user_kit (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_kit_reorder        ON user_kit (user_id, last_reorder_at);
CREATE INDEX IF NOT EXISTS idx_user_kit_affiliate      ON user_kit (acquired_via) WHERE acquired_via = 'lume_affiliate';

-- Add foreign key reference from routine_checkins -> user_kit now that user_kit exists
ALTER TABLE routine_checkins
  ADD CONSTRAINT fk_routine_checkins_kit_item
  FOREIGN KEY (kit_item_id) REFERENCES user_kit(id) ON DELETE SET NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- TABLE 3: scan_deltas
-- One row per rescan, comparing it to the previous scan.
-- Computed once at rescan time, read on every delta view load.
-- ───────────────────────────────────────────────────────────────────────────

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

  computed_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (to_scan_id)
);

COMMENT ON TABLE scan_deltas IS 'Pre-computed comparison between two scans. Written once when a rescan completes. Read by the delta view.';

CREATE INDEX IF NOT EXISTS idx_scan_deltas_user       ON scan_deltas (user_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_deltas_to_scan    ON scan_deltas (to_scan_id);


-- ───────────────────────────────────────────────────────────────────────────
-- updated_at triggers
-- Ensures updated_at reflects the last modification, not just creation.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_routine_checkins_updated_at ON routine_checkins;
CREATE TRIGGER trg_routine_checkins_updated_at
  BEFORE UPDATE ON routine_checkins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_user_kit_updated_at ON user_kit;
CREATE TRIGGER trg_user_kit_updated_at
  BEFORE UPDATE ON user_kit
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ───────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- Ensures users can only read/write their own data.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE routine_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own checkins" ON routine_checkins;
CREATE POLICY "Users manage own checkins" ON routine_checkins
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


ALTER TABLE user_kit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own kit" ON user_kit;
CREATE POLICY "Users manage own kit" ON user_kit
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


ALTER TABLE scan_deltas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own deltas" ON scan_deltas;
CREATE POLICY "Users read own deltas" ON scan_deltas
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own deltas" ON scan_deltas;
CREATE POLICY "Users insert own deltas" ON scan_deltas
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- Verification (run after migration completes)
-- ═══════════════════════════════════════════════════════════════════════════

-- After running, you can verify with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' 
--     AND table_name IN ('routine_checkins', 'user_kit', 'scan_deltas');
-- Should return 3 rows.