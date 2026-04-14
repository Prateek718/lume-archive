/*
Run this SQL in the Supabase SQL editor:

create table if not exists salon_profiles (
  id                    uuid default gen_random_uuid() primary key,
  google_place_id       text unique not null,
  salon_name            text not null,
  owner_name            text,
  phone                 text,
  city                  text,
  services_hair         text[],
  services_skin         text[],
  services_nails_makeup text[],
  price_range           text,
  booking_interest      boolean default false,
  created_by            uuid references auth.users(id),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table salon_ratings
  add column if not exists services_done    text[],
  add column if not exists rating_staff     numeric,
  add column if not exists rating_hygiene   numeric,
  add column if not exists rating_value     numeric,
  add column if not exists rating_ambience  numeric;

alter table salon_profiles enable row level security;

create policy "Anyone can read salon profiles"
  on salon_profiles for select using (true);

create policy "Authenticated users can create salon profiles"
  on salon_profiles for insert
  with check (auth.uid() = created_by);
*/

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// These values come from your .env file — never hardcode them here.
const supabaseUrl  = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Single Supabase client instance shared across the whole app.
// AsyncStorage keeps the user's login session saved on their device
// so they don't have to log in every time they open the app.
export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    storage:          AsyncStorage,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,
  },
});
