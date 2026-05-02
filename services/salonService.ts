// Supabase data layer for the Discover tab. Joins Google Places nearby
// results with salon_profiles (verification flag) and salon_ratings
// (Lumé average + service summary).

import { supabase } from '../lib/supabase';
import type { NearbySalon, SalonProfile, SalonRating } from '../types';
import type { NearbySalonRaw } from './locationService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function avgOrNull(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function topServices(ratings: Pick<SalonRating, 'services_done'>[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const r of ratings) {
    for (const s of r.services_done ?? []) {
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([s]) => s);
}

// ─── Nearby + Lumé enrichment ────────────────────────────────────────────────

export async function mergeWithLumeData(rawSalons: NearbySalonRaw[]): Promise<NearbySalon[]> {
  if (rawSalons.length === 0) return [];

  const placeIds = rawSalons.map((s) => s.google_place_id);

  const [profilesRes, ratingsRes] = await Promise.all([
    supabase
      .from('salon_profiles')
      .select('google_place_id, verification_status')
      .in('google_place_id', placeIds),
    supabase
      .from('salon_ratings')
      .select('google_place_id, rating_overall, services_done')
      .in('google_place_id', placeIds),
  ]);

  const verifiedSet = new Set<string>();
  for (const p of profilesRes.data ?? []) {
    if ((p as { verification_status: string }).verification_status === 'verified') {
      verifiedSet.add((p as { google_place_id: string }).google_place_id);
    }
  }

  const ratingsByPlace = new Map<string, Array<Pick<SalonRating, 'rating_overall' | 'services_done'>>>();
  for (const r of (ratingsRes.data ?? []) as Array<{
    google_place_id: string;
    rating_overall: number;
    services_done: string[] | null;
  }>) {
    const existing = ratingsByPlace.get(r.google_place_id) ?? [];
    existing.push({ rating_overall: r.rating_overall, services_done: r.services_done });
    ratingsByPlace.set(r.google_place_id, existing);
  }

  return rawSalons.map<NearbySalon>((s) => {
    const ratings = ratingsByPlace.get(s.google_place_id) ?? [];
    const avg = avgOrNull(ratings.map((r) => r.rating_overall));
    return {
      google_place_id:       s.google_place_id,
      name:                  s.name,
      address:               s.address,
      neighborhood:          s.neighborhood,
      distance_km:           s.distance_km,
      rating_google:         s.rating_google,
      rating_count_google:   s.rating_count_google,
      price_level:           s.price_level,
      is_verified:           verifiedSet.has(s.google_place_id),
      rating_lume_avg:       avg,
      rating_lume_count:     ratings.length,
      services_done_summary: topServices(ratings, 3),
    };
  });
}

// ─── Salon profile (claim record) ────────────────────────────────────────────

export async function fetchSalonProfile(placeId: string): Promise<SalonProfile | null> {
  const { data, error } = await supabase
    .from('salon_profiles')
    .select('*')
    .eq('google_place_id', placeId)
    .maybeSingle();
  if (error) throw error;
  return (data as SalonProfile | null) ?? null;
}

// ─── Salon ratings (averages + recent) ───────────────────────────────────────

export interface SalonRatingsSummary {
  averages: {
    overall: number | null;
    service: number | null;
    staff:   number | null;
    hygiene: number | null;
    value:   number | null;
  };
  count:  number;
  recent: SalonRating[];
}

export async function fetchSalonRatings(placeId: string): Promise<SalonRatingsSummary> {
  const { data, error } = await supabase
    .from('salon_ratings')
    .select('*')
    .eq('google_place_id', placeId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as SalonRating[];

  return {
    averages: {
      overall: avgOrNull(rows.map((r) => r.rating_overall)),
      service: avgOrNull(rows.map((r) => r.rating_service)),
      staff:   avgOrNull(rows.map((r) => r.rating_staff)),
      hygiene: avgOrNull(rows.map((r) => r.rating_hygiene)),
      value:   avgOrNull(rows.map((r) => r.rating_value)),
    },
    count: rows.length,
    recent: rows.slice(0, 10),
  };
}

// ─── Fetch / submit rating (one per user per salon) ──────────────────────────

// Returns the current user's rating for this salon, or null if they haven't
// rated it yet. Used to pre-fill the rate screen so re-rating updates the row
// instead of creating a duplicate.
export async function fetchUserRating(googlePlaceId: string): Promise<SalonRating | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('salon_ratings')
    .select('*')
    .eq('user_id', userId)
    .eq('google_place_id', googlePlaceId)
    .maybeSingle();
  if (error) throw error;
  return (data as SalonRating | null) ?? null;
}

export interface SubmitRatingInput {
  google_place_id: string;
  salon_name:      string;
  rating_overall:  number;
  rating_service?: number | null;
  rating_staff?:   number | null;
  rating_hygiene?: number | null;
  rating_value?:   number | null;
  services_done?:  string[];
  comment?:        string;
}

export async function submitRating(input: SubmitRatingInput): Promise<SalonRating> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('NOT_AUTHENTICATED');

  // Upsert on (user_id, google_place_id) — replaces the user's prior rating
  // for this salon. The unique constraint is added in
  // phase_x_one_rating_per_user.sql.
  const { data, error } = await supabase
    .from('salon_ratings')
    .upsert(
      {
        user_id:         userId,
        google_place_id: input.google_place_id,
        salon_name:      input.salon_name,
        rating_overall:  input.rating_overall,
        rating_service:  input.rating_service ?? null,
        rating_staff:    input.rating_staff ?? null,
        rating_hygiene:  input.rating_hygiene ?? null,
        rating_value:    input.rating_value ?? null,
        services_done:   input.services_done ?? null,
        comment:         input.comment ?? null,
      },
      { onConflict: 'user_id,google_place_id', ignoreDuplicates: false },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as SalonRating;
}

// ─── Submit claim ────────────────────────────────────────────────────────────

export interface SubmitClaimInput {
  google_place_id:  string;
  salon_name:       string;
  owner_name:       string;
  phone:            string;
  email:            string;
  city:             string | null;
  services_hair:    string[];
  services_skin:    string[];
  services_beard:   string[];
  services_bridal:  string[];
  services_other:   string[];
  price_range:      'budget' | 'mid' | 'premium' | 'luxury';
  booking_interest: 'yes' | 'maybe' | 'no';
}

export async function submitClaim(input: SubmitClaimInput): Promise<SalonProfile> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('NOT_AUTHENTICATED');

  const { data, error } = await supabase
    .from('salon_profiles')
    .insert({
      google_place_id:  input.google_place_id,
      salon_name:       input.salon_name,
      owner_name:       input.owner_name,
      phone:            input.phone,
      email:            input.email,
      city:             input.city,
      services_hair:    input.services_hair,
      services_skin:    input.services_skin,
      services_beard:   input.services_beard,
      services_bridal:  input.services_bridal,
      services_other:   input.services_other,
      price_range:      input.price_range,
      booking_interest: input.booking_interest,
      created_by:       userId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as SalonProfile;
}

// ─── Recent ratings (Discover home) ──────────────────────────────────────────

export interface RecentRatingRow {
  google_place_id:  string;
  salon_name:       string;
  avg:              number;
  count:            number;
  services_summary: string[];
}

export async function fetchRecentRatings(limit = 5): Promise<RecentRatingRow[]> {
  // Pull recent ratings (we'll group client-side; salon_ratings is small).
  const { data, error } = await supabase
    .from('salon_ratings')
    .select('google_place_id, salon_name, rating_overall, services_done, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    google_place_id: string;
    salon_name: string;
    rating_overall: number;
    services_done: string[] | null;
    created_at: string;
  }>;

  type Bucket = {
    google_place_id: string;
    salon_name:      string;
    ratings:         number[];
    services:        string[][];
    most_recent_at:  string;
  };
  const buckets = new Map<string, Bucket>();

  for (const r of rows) {
    const existing = buckets.get(r.google_place_id);
    if (existing) {
      existing.ratings.push(r.rating_overall);
      existing.services.push(r.services_done ?? []);
    } else {
      buckets.set(r.google_place_id, {
        google_place_id: r.google_place_id,
        salon_name:      r.salon_name,
        ratings:         [r.rating_overall],
        services:        [r.services_done ?? []],
        most_recent_at:  r.created_at,
      });
    }
  }

  return Array.from(buckets.values())
    .slice(0, limit)
    .map<RecentRatingRow>((b) => ({
      google_place_id:  b.google_place_id,
      salon_name:       b.salon_name,
      avg:              b.ratings.reduce((s, n) => s + n, 0) / b.ratings.length,
      count:            b.ratings.length,
      services_summary: topServices(
        b.services.map((s) => ({ services_done: s })),
        2,
      ),
    }));
}
