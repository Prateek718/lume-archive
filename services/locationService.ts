// Location service — GPS fetching + Google Places API (New) calls.
// Uses the v1 REST endpoint introduced in 2023.
// All location and Places API calls go through this file only.

import * as Location from 'expo-location';
import type { Salon } from '../constants/mockSalons';

const API_KEY    = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';
const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';

// Fields we request from the Nearby Search response.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.currentOpeningHours',
  'places.nationalPhoneNumber',
  'places.photos',
].join(',');

type PriceRange = '₹' | '₹₹' | '₹₹₹' | '₹₹₹₹' | '';

function mapPriceLevel(level: string | undefined): PriceRange {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE':   return '₹';
    case 'PRICE_LEVEL_MODERATE':      return '₹₹';
    case 'PRICE_LEVEL_EXPENSIVE':     return '₹₹₹';
    case 'PRICE_LEVEL_VERY_EXPENSIVE':return '₹₹₹₹';
    default: return '';
  }
}

const PREMIUM_CHAINS = ['enrich', 'purple', 'looks', 'naturals', 'jawed habib',
  'toni & guy', 'toni and guy', 'lakme', 'affinity', 'juice'];
const BUDGET_CHAINS  = ['shalimar', 'green trends'];

function namePriceHint(name: string): PriceRange {
  const lower = name.toLowerCase();
  if (PREMIUM_CHAINS.some(k => lower.includes(k))) return '₹₹₹';
  if (BUDGET_CHAINS.some(k => lower.includes(k)))  return '₹';
  return '';
}

function buildPhotoUrl(photoName: string | undefined): string | undefined {
  if (!photoName) return undefined;
  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&maxWidthPx=400&key=${API_KEY}`;
}

// Request permission and return the device's current coordinates.
// Uses Promise.race to enforce a 10-second timeout.
// Returns null on denial, timeout, or any error — never throws.
export async function getCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      console.log('[location] Permission denied');
      return null;
    }

    const location = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 10000),
      ),
    ]);

    if (!location) {
      console.log('[location] Timed out');
      return null;
    }

    return {
      latitude:  (location as Location.LocationObject).coords.latitude,
      longitude: (location as Location.LocationObject).coords.longitude,
    };
  } catch (error: unknown) {
    console.error('[location] Error:',
      error instanceof Error ? error.message : String(error));
    return null;
  }
}

// Fetch salons within 3 km of the given coordinates.
// Throws on API error so callers can show appropriate error states.
export async function fetchNearbySalons(
  lat: number,
  lng: number,
): Promise<Salon[]> {
  const res = await fetch(NEARBY_URL, {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: ['hair_salon', 'beauty_salon', 'barber_shop'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 3000,
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`places_api_${res.status}`);
  }

  const json = await res.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const places: any[] = json.places ?? [];

  return places.map(place => ({
    id:          place.id as string,
    name:        (place.displayName?.text ?? 'Unknown') as string,
    address:     (place.formattedAddress ?? '') as string,
    city:        'Nearby',
    latitude:    place.location.latitude as number,
    longitude:   place.location.longitude as number,
    rating:      (place.rating ?? 0) as number,
    reviewCount: (place.userRatingCount ?? 0) as number,
    services:    [] as string[],
    priceRange:  mapPriceLevel(place.priceLevel) || namePriceHint(place.displayName?.text ?? ''),
    openNow:     (place.currentOpeningHours?.openNow ?? null) as boolean | null,
    phone:       (place.nationalPhoneNumber ?? undefined) as string | undefined,
    photoUrl:    buildPhotoUrl(place.photos?.[0]?.name),
  } satisfies Salon));
}

// Fetch the phone number for a salon. Returns null on any failure.
export async function fetchSalonPhone(placeId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          'X-Goog-Api-Key':   API_KEY,
          'X-Goog-FieldMask': 'nationalPhoneNumber',
        },
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json.nationalPhoneNumber as string) ?? null;
  } catch {
    return null;
  }
}
