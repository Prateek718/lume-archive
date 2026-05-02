-- Phase X — Discover tab rebuild.
-- Drops legacy salon/stylist tables and recreates a clean salon_profiles +
-- salon_ratings schema. Founder confirmed Path B: existing salon_profiles
-- rows are wiped; salon_ratings has 0 rows so no data loss.

-- Drop existing salon-related tables
drop table if exists stylist_ratings cascade;
drop table if exists shadow_stylists cascade;
drop table if exists salon_ratings cascade;
drop table if exists salon_profiles cascade;

-- salon_profiles: claim records, one per claimed salon
create table salon_profiles (
  id uuid primary key default gen_random_uuid(),
  google_place_id text not null unique,
  salon_name text not null,
  owner_name text,
  phone text,
  email text,
  city text,
  services_hair text[],
  services_skin text[],
  services_beard text[],
  services_bridal text[],
  services_other text[],
  price_range text check (price_range in ('budget', 'mid', 'premium', 'luxury')),
  booking_interest text check (booking_interest in ('yes', 'maybe', 'no')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  verified_at timestamp with time zone,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- salon_ratings: user-submitted ratings, multiple per salon possible
create table salon_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  google_place_id text not null,
  salon_name text not null,
  rating_overall numeric not null check (rating_overall >= 1 and rating_overall <= 5),
  rating_service numeric check (rating_service >= 1 and rating_service <= 5),
  rating_staff numeric check (rating_staff >= 1 and rating_staff <= 5),
  rating_hygiene numeric check (rating_hygiene >= 1 and rating_hygiene <= 5),
  rating_value numeric check (rating_value >= 1 and rating_value <= 5),
  services_done text[],
  comment text,
  created_at timestamp with time zone default now()
);

create index idx_salon_ratings_place_id on salon_ratings(google_place_id);
create index idx_salon_profiles_place_id on salon_profiles(google_place_id);
create index idx_salon_profiles_verification on salon_profiles(verification_status)
  where verification_status = 'verified';

-- RLS
alter table salon_profiles enable row level security;
alter table salon_ratings enable row level security;

-- salon_profiles: anyone authenticated can read; anyone can insert (claim);
-- creator can update their own pending claim
create policy "Read all profiles" on salon_profiles
  for select using (auth.role() = 'authenticated');
create policy "Insert claim" on salon_profiles
  for insert with check (auth.uid() = created_by);
create policy "Update own pending claim" on salon_profiles
  for update using (auth.uid() = created_by and verification_status = 'pending');

-- salon_ratings: authenticated can read all; can only insert their own
create policy "Read all ratings" on salon_ratings
  for select using (auth.role() = 'authenticated');
create policy "Insert own rating" on salon_ratings
  for insert with check (auth.uid() = user_id);

-- updated_at trigger for salon_profiles
create or replace function update_salon_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger salon_profiles_updated_at
  before update on salon_profiles
  for each row execute function update_salon_profiles_updated_at();
