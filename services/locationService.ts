// Location + Google Places integration for the Discover tab.
// getCurrentLocation requests foreground location permission and resolves to
// null on denial / timeout / error (callers fall back to a city input).
// fetchNearbySalons hits the Google Places API v1 searchNearby endpoint and
// returns the raw rows ordered by Haversine distance from the user.

import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
}

// Raw, distance-sorted nearby result. The salon service merges this with
// Lumé verification + rating data into a `NearbySalon`.
export interface NearbySalonRaw {
  google_place_id:     string;
  name:                string;
  address:             string;
  neighborhood:        string | null;
  distance_km:         number;
  rating_google:       number | null;
  rating_count_google: number;
  price_level:         number | null;
}

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
].join(',');

const INCLUDED_TYPES = ['hair_salon', 'beauty_salon', 'barber_shop', 'hair_care'];
const SEARCH_RADIUS_M = 5000;
const MAX_RESULTS = 20;
const LOCATION_TIMEOUT_MS = 10_000;

// Maps Google's enum priceLevel string to a 1–4 numeric tier. Returns null
// for PRICE_LEVEL_FREE / PRICE_LEVEL_UNSPECIFIED / missing values.
function priceLevelToNumber(level: string | undefined | null): number | null {
  switch (level) {
    case 'PRICE_LEVEL_INEXPENSIVE': return 1;
    case 'PRICE_LEVEL_MODERATE':    return 2;
    case 'PRICE_LEVEL_EXPENSIVE':   return 3;
    case 'PRICE_LEVEL_VERY_EXPENSIVE': return 4;
    default: return null;
  }
}

// Renders the priceLevel int to a rupee glyph string. Used in list rows.
export function priceLevelGlyph(level: number | null): string | null {
  if (level == null) return null;
  return '₹'.repeat(Math.max(1, Math.min(4, level)));
}

// Haversine distance in km.
function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// shortFormattedAddress is typically "Sector 5, Salt Lake, Kolkata" — first
// component is a useful neighborhood label. Returns null if we can't parse one.
function extractNeighborhood(short: string | null | undefined): string | null {
  if (!short) return null;
  const parts = short.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // Prefer the second-to-last token (city is usually last). Fall back to first.
  return parts.length >= 3 ? parts[parts.length - 3] || parts[0] : parts[0];
}

export async function getCurrentLocation(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const position = await Promise.race<Location.LocationObject | null>([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
    ]);
    if (!position) return null;
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

export async function fetchNearbySalons(lat: number, lng: number): Promise<NearbySalonRaw[]> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
  if (!apiKey) {
    throw new Error('MISSING_PLACES_KEY');
  }

  const body = {
    includedTypes: INCLUDED_TYPES,
    maxResultCount: MAX_RESULTS,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: SEARCH_RADIUS_M,
      },
    },
  };

  const res = await fetch(PLACES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Places API error: ${res.status}`);
  }

  const json = await res.json() as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      shortFormattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      rating?: number;
      userRatingCount?: number;
      priceLevel?: string;
    }>;
  };

  const places = json.places ?? [];
  const user: Coords = { lat, lng };

  const rows: NearbySalonRaw[] = places
    .filter((p) => p.id && p.location?.latitude != null && p.location?.longitude != null)
    .map((p) => {
      const placeCoords: Coords = {
        lat: p.location!.latitude!,
        lng: p.location!.longitude!,
      };
      return {
        google_place_id: p.id!,
        name: p.displayName?.text ?? 'Unknown salon',
        address: p.formattedAddress ?? '',
        neighborhood: extractNeighborhood(p.shortFormattedAddress),
        distance_km: haversineKm(user, placeCoords),
        rating_google: p.rating ?? null,
        rating_count_google: p.userRatingCount ?? 0,
        price_level: priceLevelToNumber(p.priceLevel),
      };
    });

  rows.sort((a, b) => a.distance_km - b.distance_km);
  return rows;
}
