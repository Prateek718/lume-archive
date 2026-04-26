-- Phase 4A.3 — Persist skin_concerns_detailed at the top level on scans.
--
-- Until now, the Phase 1 vision call's skin_concerns_detailed array (concern,
-- severity, zones, notes, display_label) was only held in memory during the
-- scan flow and never written to the database. The legacy skin_concerns
-- (string[]) column captured names only, losing severity and zone context.
--
-- The recommendations JSONB column was an unreliable source — the recs schema
-- doesn't include skin_concerns_detailed, so reads from there returned [].
--
-- This migration adds a dedicated top-level JSONB column so the
-- recommendations and skin-detail screens can render severity dots and per-
-- concern context against real data. Indexed with GIN for future filtering by
-- concern severity / zones.
--
-- Run manually in the Supabase SQL editor; this file exists for historical
-- tracking only.

alter table scans add column if not exists skin_concerns_detailed jsonb;

create index if not exists scans_skin_concerns_detailed_gin_idx
  on scans using gin (skin_concerns_detailed);
