-- Phase 7C: Delete account plumbing
--
-- Two FK changes:
-- 1. users.referred_by NO ACTION → SET NULL (allows deletion of users who referred others)
-- 2. salon_ratings.user_id CASCADE → SET NULL (preserves ratings as anonymized contributions)
--
-- Plus the delete_user RPC, finally in version control this time.

-- (1) users.referred_by — anonymize referral link on deletion
alter table public.users
  drop constraint if exists users_referred_by_fkey;
alter table public.users
  add constraint users_referred_by_fkey
  foreign key (referred_by) references public.users(id) on delete set null;

-- (2) salon_ratings.user_id — preserve anonymized rating
alter table public.salon_ratings
  drop constraint if exists salon_ratings_user_id_fkey;
alter table public.salon_ratings
  add constraint salon_ratings_user_id_fkey
  foreign key (user_id) references public.users(id) on delete set null;

-- (3) The delete_user RPC
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cascades and set-nulls handle child tables:
  --   routine_checkins, scan_deltas, scans, user_kit, user_milestones: CASCADE
  --   salon_profiles.created_by, users.referred_by, salon_ratings.user_id: SET NULL
  delete from public.users where id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;
