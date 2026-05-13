-- =============================================================================
-- Phase XIII-b: atomic per-section recommendations upsert
--
-- Replaces the read-modify-write pattern in
-- services/scanService.ts:writeRecommendationSection with a single atomic
-- UPDATE so concurrent skin/beard/makeup writes from runScanPhase2 do not
-- race and clobber each other's slots.
--
-- The previous client-side pattern:
--   1. select recommendations from scans where id = ?
--   2. build the merged Recommendations object in JS
--   3. update scans set recommendations = ? where id = ?
-- has no transaction around steps 1-3. Two concurrent callers can both
-- read the pre-write state, build with stale sibling sections, and the
-- second writer clobbers the first. Symptom (observed 2026-05-13 after
-- Phase XIII-b wrapper rewrites shifted relative finish-order between
-- sections): skin recommendations landed empty (steps=[], advice="") when
-- the beard write committed last.
--
-- Fix: a single UPDATE with `||` jsonb shallow-merge against the existing
-- recommendations column. PostgreSQL row-level locking serializes
-- concurrent UPDATEs of the same row, so the second writer sees the first
-- writer's committed merge and only overlays its own section.
--
-- Security: language sql, NOT security definer — RLS on public.scans
-- continues to apply, so callers can only mutate their own scans.
-- =============================================================================

create or replace function public.upsert_scan_recommendation_section(
  p_scan_id uuid,
  p_section text,
  p_payload jsonb
) returns void
language sql
as $$
  update public.scans
  set recommendations = coalesce(recommendations, '{}'::jsonb)
                        || jsonb_build_object(p_section, p_payload)
  where id = p_scan_id;
$$;

revoke all on function public.upsert_scan_recommendation_section(uuid, text, jsonb) from public;
grant execute on function public.upsert_scan_recommendation_section(uuid, text, jsonb) to authenticated;
