// Salons / Find nearby — location, salon list with Lumé profile data.

import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Linking, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { type Salon } from '../../constants/mockSalons';
import { getCurrentLocation, fetchNearbySalons } from '../../services/locationService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

const BANGALORE = { latitude: 12.9716, longitude: 77.5946 };

type Phase = 'permission' | 'loading' | 'map' | 'city';

interface SalonProfile {
  google_place_id:       string;
  services_hair:         string[] | null;
  services_skin:         string[] | null;
  services_nails_makeup: string[] | null;
}

function getServiceCategories(profile: SalonProfile): string[] {
  const cats: string[] = [];
  if (profile.services_hair?.length)         cats.push('Hair');
  if (profile.services_skin?.length)         cats.push('Skin');
  if (profile.services_nails_makeup?.length) cats.push('Nails & Makeup');
  return cats;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortByDist(salons: Salon[], lat: number, lng: number): Salon[] {
  return salons
    .map(s => ({ ...s, distance: haversineKm(lat, lng, s.latitude, s.longitude) }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

async function fetchProfileMap(placeIds: string[]): Promise<Record<string, SalonProfile>> {
  if (!placeIds.length) return {};
  const { data } = await supabase
    .from('salon_profiles')
    .select('google_place_id, services_hair, services_skin, services_nails_makeup')
    .in('google_place_id', placeIds);
  const map: Record<string, SalonProfile> = {};
  ((data as SalonProfile[]) ?? []).forEach(p => { map[p.google_place_id] = p; });
  return map;
}

export default function NearbyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase,      setPhase]      = useState<Phase>('permission');
  const [salons,     setSalons]     = useState<Salon[]>([]);
  const [profileMap,    setProfileMap]    = useState<Record<string, SalonProfile>>({});
  const [cityInput,     setCityInput]     = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [networkError,  setNetworkError]  = useState(false);

  // Load profiles whenever the salon list changes
  useEffect(() => {
    if (!salons.length) return;
    fetchProfileMap(salons.map(s => s.id)).then(setProfileMap).catch(() => {});
  }, [salons]);

  const doLocationSearch = useCallback(async () => {
    setLocationError(null);
    setNetworkError(false);
    setPhase('loading');

    try {
      const coords = await getCurrentLocation();

      if (!coords) {
        setLocationError('location_denied');
        setPhase('permission');
        return;
      }

      try {
        const results = await fetchNearbySalons(coords.latitude, coords.longitude);
        if (!results || results.length === 0) {
          setLocationError('no_salons');
          setPhase('map');
        } else {
          setSalons(sortByDist(results, coords.latitude, coords.longitude));
          setPhase('map');
        }
      } catch (apiError: unknown) {
        console.error('[nearby] API error:', apiError instanceof Error ? apiError.message : String(apiError));
        setNetworkError(true);
        setPhase('map');
      }
    } catch (outerError: unknown) {
      console.error('[nearby] Crash:', outerError instanceof Error ? outerError.message : String(outerError));
      setNetworkError(true);
      setPhase('map');
    }
  }, []);

  const loadSalonsFromCoords = useCallback(async (
    coords: { latitude: number; longitude: number },
  ) => {
    setLocationError(null);
    setNetworkError(false);
    setPhase('loading');

    try {
      const results = await fetchNearbySalons(coords.latitude, coords.longitude);
      if (!results || results.length === 0) {
        setLocationError('no_salons');
      } else {
        setSalons(sortByDist(results, coords.latitude, coords.longitude));
      }
    } catch (err: unknown) {
      console.error('[nearby] API error:', err instanceof Error ? err.message : String(err));
      setNetworkError(true);
    }
    setPhase('map');
  }, []);

  const handleCitySearch = useCallback(async () => {
    await loadSalonsFromCoords(BANGALORE);
  }, [loadSalonsFromCoords]);

  const goToDetail = useCallback((salon: Salon) => {
    router.push({
      pathname: '/salons/salon-detail',
      params: {
        google_place_id: salon.id,
        name:            salon.name,
        address:         salon.address,
        rating:          String(salon.rating),
        distance:        String(salon.distance?.toFixed(1) ?? ''),
        city:            salon.city,
      },
    });
  }, [router]);

  // ── Permission ─────────────────────────────────────────────────────────────
  if (phase === 'permission' && !locationError) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <BackBar title="Nearby Salons" />
        <View style={s.centreBox}>
          <View style={s.iconCircle}><Text style={s.iconGlyph}>◎</Text></View>
          <Text style={s.permTitle}>Find salons near you</Text>
          <Text style={s.permBody}>
            Lumé shows care studios within a few kilometres.{'\n'}
            We never track your location in the background.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={doLocationSearch} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Allow location access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={() => setPhase('city')} activeOpacity={0.7}>
            <Text style={s.ghostBtnText}>Enter city manually instead</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <View style={[s.screen, s.centreBox, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={Colors.accent} size="large" />
        <Text style={s.loadingText}>Finding nearby salons…</Text>
      </View>
    );
  }

  // ── Location denied ────────────────────────────────────────────────────────
  if (locationError === 'location_denied') {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <BackBar title="Nearby Salons" />
        <View style={s.errorContainer}>
          <Text style={s.errorIcon}>📍</Text>
          <Text style={s.errorTitle}>Location access needed</Text>
          <Text style={s.errorMessage}>
            Enable location in your phone settings to find salons near you
          </Text>
          <TouchableOpacity style={s.goldButton} onPress={() => Linking.openSettings()} activeOpacity={0.85}>
            <Text style={s.goldButtonText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={doLocationSearch} style={s.retryLink}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── No salons found ────────────────────────────────────────────────────────
  if (locationError === 'no_salons') {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <BackBar title="Nearby Salons" />
        <View style={s.errorContainer}>
          <Text style={s.errorIcon}>🏙️</Text>
          <Text style={s.errorTitle}>No salons found nearby</Text>
          <Text style={s.errorMessage}>
            We're expanding to more cities soon. Try searching in a different area.
          </Text>
          <TouchableOpacity style={s.goldButton} onPress={doLocationSearch} activeOpacity={0.85}>
            <Text style={s.goldButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Network error ──────────────────────────────────────────────────────────
  if (networkError) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <BackBar title="Nearby Salons" />
        <View style={s.errorContainer}>
          <Text style={s.errorIcon}>📡</Text>
          <Text style={s.errorTitle}>Connection issue</Text>
          <Text style={s.errorMessage}>
            Could not load salons. Please check your connection and try again.
          </Text>
          <TouchableOpacity style={s.goldButton} onPress={doLocationSearch} activeOpacity={0.85}>
            <Text style={s.goldButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── City entry ─────────────────────────────────────────────────────────────
  if (phase === 'city') {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <BackBar title="Nearby Salons" />
        <View style={s.centreBox}>
          <Text style={s.permTitle}>Which city are you in?</Text>
          <Text style={s.permBody}>We'll show you the best care studios nearby.</Text>
          <TextInput
            style={s.cityInput}
            placeholder="e.g. Bangalore, Mumbai…"
            placeholderTextColor={Colors.text3}
            value={cityInput}
            onChangeText={setCityInput}
            autoCapitalize="words"
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => cityInput.trim() && handleCitySearch()}
          />
          <TouchableOpacity
            style={[s.primaryBtn, !cityInput.trim() && s.disabled]}
            onPress={handleCitySearch}
            disabled={!cityInput.trim()}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>Find salons</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── List ───────────────────────────────────────────────────────────────────
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <BackBar title="Nearby Salons" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.listHeader}>{salons.length} salons nearby</Text>

        {salons.map(salon => {
          const profile    = profileMap[salon.id];
          const categories = profile ? getServiceCategories(profile) : [];
          const hasProfile = Boolean(profile);

          return (
            <TouchableOpacity
              key={salon.id}
              style={s.listCard}
              onPress={() => goToDetail(salon)}
              activeOpacity={0.85}
            >
              {/* Thumbnail */}
              <View style={s.listThumb}>
                {salon.photoUrl && (
                  <Image
                    source={{ uri: salon.photoUrl }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                )}
                <View style={s.listThumbOverlay} />
                {salon.openNow === true && (
                  <View style={s.openBadge}>
                    <Text style={s.openBadgeText}>Open now</Text>
                  </View>
                )}
                {salon.openNow === false && (
                  <View style={[s.openBadge, s.closedBadge]}>
                    <Text style={s.openBadgeText}>Closed</Text>
                  </View>
                )}
              </View>

              {/* Body */}
              <View style={s.listBody}>
                <Text style={s.listName} numberOfLines={1}>{salon.name}</Text>
                <Text style={s.listAddr} numberOfLines={1}>{salon.address}</Text>

                {/* Meta row */}
                <View style={s.metaRow}>
                  <Text style={s.ratingText}>★ {salon.rating}</Text>
                  <Text style={s.dot}>·</Text>
                  <Text style={s.reviewText}>{salon.reviewCount} reviews</Text>
                  {salon.distance != null && (
                    <>
                      <Text style={s.dot}>·</Text>
                      <Text style={s.distText}>{salon.distance.toFixed(1)} km</Text>
                    </>
                  )}
                </View>

                {/* Service category pills */}
                {categories.length > 0 && (
                  <View style={s.pillsRow}>
                    {categories.map(cat => (
                      <View key={cat} style={s.servicePill}>
                        <Text style={s.servicePillText}>{cat}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Lumé profile badge */}
                {hasProfile && (
                  <Text style={s.lumeProfileBadge}>Lumé profile ✓</Text>
                )}
              </View>

              <Text style={s.listArrow}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ── Back bar ──────────────────────────────────────────────────────────────────
function BackBar({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View style={bb.row}>
      <TouchableOpacity onPress={() => router.back()} style={bb.btn} activeOpacity={0.7}>
        <Text style={bb.arrow}>‹</Text>
      </TouchableOpacity>
      <Text style={bb.title}>{title}</Text>
      <View style={bb.btn} />
    </View>
  );
}
const bb = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  btn:   { width: 40, alignItems: 'center' },
  arrow: { fontSize: 28, color: Colors.text, lineHeight: 32 },
  title: { fontFamily: Typography.serif, fontSize: 22, color: Colors.text },
});

// ─── STYLES ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: Colors.background },
  centreBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xl },

  // Permission / city
  iconCircle:     { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xl },
  iconGlyph:      { fontSize: 28, color: Colors.accent },
  permTitle:      { fontFamily: Typography.serif, fontSize: 22, color: Colors.text, textAlign: 'center', marginBottom: Spacing.sm },
  permBody:       { fontSize: 13, color: Colors.text2, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xxl },
  primaryBtn:     { width: '100%', backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  primaryBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textOnAccent },
  ghostBtn:       { paddingVertical: Spacing.sm },
  ghostBtnText:   { fontSize: 13, color: Colors.text2 },
  cityInput:      { width: '100%', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: 15, color: Colors.text, marginBottom: Spacing.md },
  disabled:       { opacity: 0.4 },
  loadingText:    { fontSize: 13, color: Colors.text2, marginTop: Spacing.md },

  // Error states
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorIcon:      { fontSize: 32, marginBottom: 16 },
  errorTitle:     { fontFamily: Typography.serif, fontSize: 22, color: Colors.text, textAlign: 'center', marginBottom: 8 },
  errorMessage:   { fontSize: 13, color: Colors.text2, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  goldButton:     { backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginBottom: 12 },
  goldButtonText: { color: Colors.textOnAccent, fontWeight: '600', fontSize: 14 },
  retryLink:      { padding: 8 },
  retryText:      { color: Colors.text, fontSize: 13 },

  // List
  listContent: { padding: Spacing.lg },
  listHeader:  { fontSize: 13, color: Colors.text, marginBottom: Spacing.md, letterSpacing: 1 },

  listCard: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    marginBottom:    Spacing.sm,
    overflow:        'hidden',
    flexDirection:   'row',
    alignItems:      'center',
  },
  listThumb:        { width: 80, height: 80, backgroundColor: Colors.surface2, overflow: 'hidden' },
  listThumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  listBody:         { flex: 1, padding: Spacing.sm },
  listName:         { fontSize: 15, color: Colors.text, fontWeight: '600', marginBottom: 2 },
  listAddr:         { fontSize: 13, color: Colors.text2, marginBottom: Spacing.xs },
  listArrow:        { fontSize: 22, color: Colors.text3, paddingRight: Spacing.sm },

  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 13, color: Colors.accent },
  dot:        { fontSize: 13, color: Colors.text3 },
  reviewText: { fontSize: 11, color: Colors.text2 },
  distText:   { fontSize: 13, color: Colors.text2 },

  openBadge:     { position: 'absolute', top: Spacing.sm, left: Spacing.sm, backgroundColor: '#1A3A1A', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  closedBadge:   { backgroundColor: '#3A1A1A' },
  openBadgeText: { fontSize: 10, color: '#6BCB77', fontWeight: '600' },

  // Service pills
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.xs },
  servicePill: {
    backgroundColor: 'rgba(230,199,156,0.18)',
    borderWidth:     1,
    borderColor:     'rgba(230,199,156,0.45)',
    borderRadius:    999,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  servicePillText: { fontSize: 9, color: Colors.accent, fontWeight: '500' },

  // Lumé profile badge
  lumeProfileBadge: { fontSize: 11, color: Colors.text2, marginTop: 4 },
});
