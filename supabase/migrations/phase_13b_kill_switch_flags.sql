-- Phase XIII-b — per-call kill-switch flags
--
-- Extends app_config with six per-call boolean flags so an operator can
-- disable an individual Gemini call without taking down the whole pipeline.
-- The master gemini_scans_enabled (from phase_13_app_config.sql) still
-- short-circuits all six in code (lib/appConfig.ts).
--
-- All flags default to true. Idempotent — re-running is a no-op.
--
-- See docs/phase-xiii-architecture.md §10.2.

insert into public.app_config (key, value) values
  ('vision_enabled',           'true'::jsonb),
  ('skin_recs_enabled',        'true'::jsonb),
  ('beard_recs_enabled',       'true'::jsonb),
  ('makeup_recs_enabled',      'true'::jsonb),
  ('hair_recs_enabled',        'true'::jsonb),
  ('delta_commentary_enabled', 'true'::jsonb)
on conflict (key) do nothing;
