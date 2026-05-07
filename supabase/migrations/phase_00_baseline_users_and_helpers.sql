-- =============================================================================
-- Phase 00 baseline: users, waitlist, auth helpers, RLS auto-enable
--
-- Purpose: Capture the state of users-related database objects as they
-- existed at the start of Phase XI. This includes objects that were
-- originally created via the Supabase dashboard before this project
-- adopted a migrations-folder workflow.
--
-- This file represents ground zero for version-controlled schema management.
-- Some columns and the waitlist table are scheduled for removal in Phase XI
-- cleanup; they are captured here because they exist in the live database.
-- See migrations/README.md for the migration conventions used in this project.
--
-- Idempotent: safe to apply to existing or fresh databases.
-- Non-destructive: never drops or modifies user data.
-- =============================================================================


-- ─────────────────────────────────────────────────
-- TABLE: public.users
-- 33 columns, captured verbatim from live DB.
-- ─────────────────────────────────────────────────

create table if not exists public.users (
  id                          uuid         primary key,
  display_name                text,
  gender                      text,
  city                        text,
  avatar_url                  text,
  referral_code               text,
  referred_by                 uuid,
  push_token                  text,
  notification_reminders      boolean      default true,
  notification_routine        boolean      default true,
  last_scan_at                timestamptz,
  onboarding_complete         boolean      default false,
  created_at                  timestamptz  default now(),
  scan_bonus_count            integer      default 0,
  scan_bonus_period           text,
  routine_level               text         default 'simple',
  preferred_brands            jsonb        default '[]'::jsonb,
  hair_profile                jsonb        default '{}'::jsonb,
  hair_recommendations        jsonb,
  preferred_brands_v2         jsonb        default '{"hair": [], "skin": [], "makeup": []}'::jsonb,
  traits                      jsonb        default '{}'::jsonb,
  beard_goal                  text,
  age_range                   text,
  care_categories             text[]       not null default array['skin','hair'],
  face_shape_confirmed_at     timestamptz,
  makeup_recommendations      jsonb,
  makeup_recommendations_meta jsonb,
  notify_morning_routine      boolean      default true,
  notify_evening_routine      boolean      default true,
  notify_weekly_summary       boolean      default true,
  notify_rescan               boolean      default true,
  notify_milestones           boolean      default false,
  notify_morning_time         text         default '07:30',
  notify_evening_time         text         default '22:00'
);


-- ─────────────────────────────────────────────────
-- CHECK constraints on public.users
--
-- DROP/ADD pattern makes these idempotent across re-applications.
-- All three constraints are captured here so the baseline file fully
-- describes the table's enforced shape; later migrations may modify them
-- but should not need to introduce them.
-- ─────────────────────────────────────────────────

alter table public.users drop constraint if exists users_age_range_check;
alter table public.users
  add constraint users_age_range_check
  check (age_range = any (array['18-25','26-35','36-45','46-55','55+']));

alter table public.users drop constraint if exists users_beard_goal_check;
alter table public.users
  add constraint users_beard_goal_check
  check (beard_goal is null or beard_goal = any (array['fuller','sharper','shorter','longer','none']));

alter table public.users drop constraint if exists users_gender_check;
alter table public.users
  add constraint users_gender_check
  check (gender is null or gender = any (array['man','woman']));


-- ─────────────────────────────────────────────────
-- UNIQUE index on referral_code
-- ─────────────────────────────────────────────────

create unique index if not exists users_referral_code_key
  on public.users (referral_code);


-- ─────────────────────────────────────────────────
-- TABLE: public.waitlist
--
-- Note: scheduled for removal in Phase XI cleanup. Captured here because
-- it exists in the live database.
-- ─────────────────────────────────────────────────

create table if not exists public.waitlist (
  id          uuid         primary key default gen_random_uuid(),
  email       text         not null,
  city        text,
  created_at  timestamptz  default now()
);


-- ─────────────────────────────────────────────────
-- FUNCTION: public.handle_new_user
--
-- SECURITY DEFINER trigger function. Inserts a corresponding row into
-- public.users with a 6-character random referral_code whenever a new
-- row is inserted into auth.users (i.e., when a user signs up).
--
-- Body matches live database verbatim.
-- ─────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.users (id, referral_code)
  values (
    new.id,
    upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  );
  return new;
end;
$function$;


-- ─────────────────────────────────────────────────
-- Grants on public.handle_new_user
--
-- Principle of least privilege. The trigger on auth.users is fired by
-- supabase_auth_admin during user signup; that is the only runtime caller.
-- postgres and service_role retain access for administrative purposes.
-- All other roles (PUBLIC, anon, authenticated, authenticator) have their
-- default Supabase grants explicitly revoked.
--
-- This narrows the default Supabase function-creation grants. The grants
-- are made explicit so a fresh-DB rebuild produces the same correct state
-- regardless of any future Supabase default changes.
-- ─────────────────────────────────────────────────

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
revoke all on function public.handle_new_user() from authenticator;

grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.handle_new_user() to postgres;
grant execute on function public.handle_new_user() to service_role;


-- ─────────────────────────────────────────────────
-- TRIGGER: on_auth_user_created
--
-- Fires public.handle_new_user after every INSERT on auth.users.
-- ─────────────────────────────────────────────────

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- ─────────────────────────────────────────────────
-- FUNCTION: public.rls_auto_enable
--
-- Event trigger function. When a new table is created in the public
-- schema, automatically enables row-level security on it. Defensive
-- infrastructure: ensures no future public table is shipped without
-- RLS by accident.
--
-- Body matches live database verbatim.
-- ─────────────────────────────────────────────────

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
      and cmd.schema_name in ('public')
      and cmd.schema_name not in ('pg_catalog', 'information_schema')
      and cmd.schema_name not like 'pg_toast%'
      and cmd.schema_name not like 'pg_temp%'
    then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$function$;


-- ─────────────────────────────────────────────────
-- EVENT TRIGGER: ensure_rls
--
-- Invokes rls_auto_enable on ddl_command_end for table-creation tags.
-- Guarantees RLS is enabled on every newly-created public table.
-- ─────────────────────────────────────────────────

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();


-- ─────────────────────────────────────────────────
-- Enable RLS explicitly on captured tables.
--
-- The ensure_rls event trigger handles new tables going forward, but
-- tables created in this same migration are not auto-enabled because
-- the event trigger may not be in place when they are created on a
-- fresh database. Explicit enable here is idempotent on existing
-- databases (RLS already enabled = no-op) and necessary on fresh ones.
-- ─────────────────────────────────────────────────

alter table public.users    enable row level security;
alter table public.waitlist enable row level security;
