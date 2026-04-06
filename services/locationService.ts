// Location service — Google Places API (New) calls.
// Uses the v1 REST endpoint introduced in 2023.
// All Places API calls go through this file only.

import type { Salon } from '../constants/mockSalons';

const API_KEY     = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? '';
const NEARBY_URL  = 'https://places.googleapis.com/v1/places:searchNearby';

// Fields we request from the Nearby Search response.
// Phone number and photos are included so no separate Details call is needed.
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

// Map the new API's string price level to rupee symbols.
// PRICE_LEVEL_FREE and PRICE_LEVEL_UNSPECIFIED return '' (hidden in UI).
function mapPriceLevel(level: string | undefined): PriceRange {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE': return '₹';
    case 'PRICE_LEVEL_MODERATE':    return '₹₹';
    case 'PRICE_LEVEL_EXPENSIVE':   return '₹₹₹';
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return '₹₹₹₹';
    default: return '';
  }
}

// Known Indian salon chains — used as a fallback when Google returns no price level.
const PREMIUM_CHAINS = ['enrich', 'purple', 'looks', 'naturals', 'jawed habib',
  'toni & guy', 'toni and guy', 'lakme', 'affinity', 'juice'];
const BUDGET_CHAINS  = ['shalimar', 'green trends'];

function namePriceHint(name: string): PriceRange {
  const lower = name.toLowerCase();
  if (PREMIUM_CHAINS.some(k => lower.includes(k))) return '₹₹₹';
  if (BUDGET_CHAINS.some(k => lower.includes(k)))  return '₹';
  return '';
}

// Build a photo media URL from a Places API photo resource name.
// Returns undefined if no photo name is provided.
function buildPhotoUrl(photoName: string | undefined): string | undefined {
  if (!photoName) return undefined;
  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&maxWidthPx=400&key=${API_KEY}`;
}

// Fetch salons within 3 km of the given coordinates.
// Returns mapped Salon objects ready for the map and cards.
export async function fetchNearbySalons(
  lat: number,
  lng: number,
): Promise<Salon[]> {
  const res = await fetch(NEARBY_URL, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'X-Goog-Api-Key':  API_KEY,
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
    const err = await res.text();
    throw new Error(`Places API ${res.status}: ${err}`);
  }

  const json = await res.json();

  // The new API returns { places: [...] } — empty array if none found.
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

// Fetch the phone number for a salon that was loaded without one
// (e.g. from mock data). Uses the Places API (New) Place Details endpoint.
export async function fetchSalonPhone(placeId: string): Promise<string | null> {
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
}
