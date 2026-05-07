-- =============================================================================
-- Phase 00 baseline: scans
--
-- Purpose: Capture the public.scans table schema as it exists at the start
-- of Phase XI. The scans table was originally created via the Supabase
-- dashboard and was never captured in a migration file. Without this
-- baseline, a fresh database rebuild from supabase/migrations/ would fail
-- because subsequent migrations (phase_3a, phase_4a3, phase_c, phase_f)
-- assume scans already exists.
--
-- This file represents ground zero for the scans table. Several columns
-- captured here (hair_texture, hair_condition, score_hair, tier_label,
-- stylist_mentioned, share_count, brow_shape, skin_age, skin_tone) are
-- scheduled for removal in Phase XI cleanup; they are captured because
-- they exist in the live database. See migrations/README.md for migration
-- conventions.
--
-- Idempotent: safe to apply to existing or fresh databases.
-- Non-destructive: never drops or modifies user data.
-- =============================================================================


-- ─────────────────────────────────────────────────
-- TABLE: public.scans
--
-- 31 columns, captured verbatim from live DB.
-- Foreign key on user_id cascades on user deletion (delete_user RPC
-- depends on this).
-- ─────────────────────────────────────────────────

create table if not exists public.scans (
  id                       uuid         primary key default gen_random_uuid(),
  user_id                  uuid         references public.users(id) on delete cascade,
  image_url                text,
  face_shape               text,
  skin_type                text,
  skin_concerns            text[],
  hair_texture             text,
  hair_condition           text,
  beard_density            text,
  brow_shape               text,
  undereye                 text,
  score_hair               integer,
  score_skin               integer,
  score_beard              integer,
  score_makeup             integer,
  score_overall            integer,
  tier_label               text,
  recommendations          jsonb,
  stylist_mentioned        text,
  share_count              integer      default 0,
  created_at               timestamptz  default now(),
  beard_condition          text,
  brow_condition           text,
  scan_hour                integer,
  season                   text,
  scan_type                text,
  fitzpatrick_scale        integer,
  skin_tone                text,
  skin_undertone           text,
  skin_age                 integer,
  skin_concerns_detailed   jsonb
);


-- ─────────────────────────────────────────────────
-- CHECK constraints on public.scans
--
-- DROP/ADD pattern makes these idempotent.
-- All 13 captured here so the baseline file fully describes the table's
-- enforced shape.
--
-- Some constraints protect columns scheduled for removal in Phase XI
-- cleanup (brow_shape, hair_texture, hair_condition, score_hair).
-- Postgres auto-drops constraints when their columns are dropped, so
-- those will disappear naturally during cleanup.
-- ─────────────────────────────────────────────────

alter table public.scans drop constraint if exists scans_face_shape_check;
alter table public.scans
  add constraint scans_face_shape_check
  check (face_shape = any (array['oval','round','square','heart','oblong','diamond']));

alter table public.scans drop constraint if exists scans_skin_type_check;
alter table public.scans
  add constraint scans_skin_type_check
  check (skin_type = any (array['oily','dry','combination','normal','sensitive']));

alter table public.scans drop constraint if exists scans_hair_texture_check;
alter table public.scans
  add constraint scans_hair_texture_check
  check (hair_texture = any (array['straight','wavy','curly','coily']));

alter table public.scans drop constraint if exists scans_hair_condition_check;
alter table public.scans
  add constraint scans_hair_condition_check
  check (hair_condition = any (array['healthy','dry','damaged','oily','thinning']));

alter table public.scans drop constraint if exists scans_beard_density_check;
alter table public.scans
  add constraint scans_beard_density_check
  check (beard_density = any (array['none','light','medium','heavy']));

alter table public.scans drop constraint if exists scans_brow_shape_check;
alter table public.scans
  add constraint scans_brow_shape_check
  check (brow_shape = any (array['arch','straight','rounded','sparse']));

alter table public.scans drop constraint if exists scans_undereye_check;
alter table public.scans
  add constraint scans_undereye_check
  check (undereye = any (array['dark_circles','puffiness','normal','dark','puffy','hollow']));

alter table public.scans drop constraint if exists scans_scan_type_check;
alter table public.scans
  add constraint scans_scan_type_check
  check (scan_type is null or scan_type = any (array['first','rescan']));

alter table public.scans drop constraint if exists scans_score_skin_check;
alter table public.scans
  add constraint scans_score_skin_check
  check (score_skin >= 0 and score_skin <= 100);

alter table public.scans drop constraint if exists scans_score_hair_check;
alter table public.scans
  add constraint scans_score_hair_check
  check (score_hair >= 0 and score_hair <= 100);

alter table public.scans drop constraint if exists scans_score_beard_check;
alter table public.scans
  add constraint scans_score_beard_check
  check (score_beard >= 0 and score_beard <= 100);

alter table public.scans drop constraint if exists scans_score_makeup_check;
alter table public.scans
  add constraint scans_score_makeup_check
  check (score_makeup >= 0 and score_makeup <= 100);

alter table public.scans drop constraint if exists scans_score_overall_check;
alter table public.scans
  add constraint scans_score_overall_check
  check (score_overall >= 0 and score_overall <= 100);


-- ─────────────────────────────────────────────────
-- INDEXES on public.scans
--
-- The primary key index (scans_pkey) is auto-created by the PRIMARY KEY
-- declaration above and is not declared explicitly here.
--
-- The GIN index on skin_concerns_detailed enables efficient JSONB queries
-- (was added in phase_4a3_skin_concerns_detailed_column.sql; re-asserted
-- here so the baseline is complete).
-- ─────────────────────────────────────────────────

create index if not exists scans_skin_concerns_detailed_gin_idx
  on public.scans
  using gin (skin_concerns_detailed);


-- ─────────────────────────────────────────────────
-- Enable RLS on public.scans
--
-- Idempotent: enabling already-enabled RLS is a no-op.
-- RLS policies for scans are captured in phase_00_baseline_rls.sql.
-- ─────────────────────────────────────────────────

alter table public.scans enable row level security;
