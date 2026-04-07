// Salons / Find nearby — map, salon cards, detail bottom sheet with Lumé ratings.

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Dimensions, Animated, Linking, ActivityIndicator, Image,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { GUEST_PROFILE_KEY } from '../_layout';
import { MOCK_SALONS, type Salon } from '../../constants/mockSalons';
import { getCurrentLocation, fetchNearbySalons, fetchSalonPhone } from '../../services/locationService';
import { StarRating } from '../../components/ui/StarRating';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

const { width: SW } = Dimensions.get('window');
const CARD_W = SW * 0.72;
const BANGALORE = { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.06, longitudeDelta: 0.06 };

type Phase = 'permission' | 'loading' | 'map' | 'city';

interface LumeRating {
  rating_overall:           number | null;
  rating_ambience:          number | null;
  rating_price_value:       number | null;
  rating_staff:             number | null;
  rating_hygiene:           number | null;
  rating_stylist_skill:     number | null;
  haircut_price_tier_men:   string | null;
  haircut_price_tier_women: string | null;
}

const MEN_TIERS:   Record<string, string> = {
  under_200:  'Under ₹200',
  '200_500':  '₹200 – ₹500',
  '500_1000': '₹500 – ₹1,000',
  above_1000: 'Above ₹1,000',
};
const WOMEN_TIERS: Record<string, string> = {
  under_600:   'Under ₹600',
  '600_1000':  '₹600 – ₹1,000',
  '1000_1500': '₹1,000 – ₹1,500',
  above_1500:  'Above ₹1,500',
};

function avg(arr: (number | null)[]): number | null {
  const vals = arr.filter((v): v is number => v != null);
  if (!vals.length) return null;
  return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
}

function modeTier(tiers: (string | null)[]): [string, number] | null {
  const counts: Record<string, number> = {};
  tiers.forEach(t => { if (t) counts[t] = (counts[t] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0] ?? null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortByDist(salons: Salon[], lat: number, lng: number): Salon[] {
  return salons
    .map(s => ({ ...s, distance: haversineKm(lat, lng, s.latitude, s.longitude) }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
}

export default function NearbyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase,    setPhase]    = useState<Phase>('permission');
  const [userLoc,  setUserLoc]  = useState<{ latitude: number; longitude: number } | null>(null);
  const [salons,   setSalons]   = useState<Salon[]>([]);
  const [selected, setSelected] = useState<Salon | null>(null);
  const [cityInput, setCityInput] = useState('');

  const [locationError, setLocationError] = useState<string | null>(null);
  const [networkError,  setNetworkError]  = useState(false);

  const [sheetVisible,   setSheetVisible]   = useState(false);
  const [sheetPhone,     setSheetPhone]     = useState<string | null>(null);
  const [fetchingPhone,  setFetchingPhone]  = useState(false);
  const [lumeRatings,    setLumeRatings]    = useState<LumeRating[]>([]);
  const [loadingLume,    setLoadingLume]    = useState(false);
  const [gender,         setGender]         = useState('man');

  const sheetAnim = useRef(new Animated.Value(0)).current;
  const mapRef    = useRef<MapView>(null);

  useEffect(() => {
    AsyncStorage.getItem(GUEST_PROFILE_KEY).then(raw => {
      if (raw) {
        const p = JSON.parse(raw) as { gender?: string };
        if (p.gender) setGender(p.gender);
      }
    });
  }, []);

  const focusSalon = useCallback((salon: Salon) => {
    setSelected(salon);
    mapRef.current?.animateToRegion({
      latitude: salon.latitude, longitude: salon.longitude,
      latitudeDelta: 0.01, longitudeDelta: 0.01,
    }, 400);
  }, []);

  const openSheet = useCallback(async (salon: Salon) => {
    setSelected(salon);
    setSheetPhone(null);
    setLumeRatings([]);
    setSheetVisible(true);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 12 }).start();

    if (salon.phone) {
      setSheetPhone(salon.phone);
    } else if (salon.id.length > 6) {
      setFetchingPhone(true);
      fetchSalonPhone(salon.id)
        .then(p => setSheetPhone(p))
        .catch(() => {})
        .finally(() => setFetchingPhone(false));
    }

    setLoadingLume(true);
    supabase
      .from('salon_ratings')
      .select('rating_overall,rating_ambience,rating_price_value,rating_staff,rating_hygiene,rating_stylist_skill,haircut_price_tier_men,haircut_price_tier_women')
      .eq('google_place_id', salon.id)
      .then(
        ({ data }) => { setLumeRatings((data as LumeRating[]) ?? []); setLoadingLume(false); },
        ()         => { setLoadingLume(false); },
      );
  }, [sheetAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      setSheetVisible(false);
      setSheetPhone(null);
    });
  }, [sheetAnim]);

  // Full location + salon fetch flow — used by the permission screen and all retry buttons.
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

      console.log('[nearby] Got coords:', coords);

      try {
        const results = await fetchNearbySalons(coords.latitude, coords.longitude);
        setUserLoc(coords);
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
      console.error('[nearby] Unexpected crash:', outerError instanceof Error ? outerError.message : String(outerError));
      setNetworkError(true);
      setPhase('map');
    }
  }, []);

  // City-based search — skips GPS, uses typed city coordinates.
  const loadSalonsFromCoords = useCallback(async (
    coords: { latitude: number; longitude: number },
  ) => {
    setLocationError(null);
    setNetworkError(false);
    setPhase('loading');
    setUserLoc(coords);

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

  // ── Permission ─────────────────────────────────────────────────────────────
  if (phase === 'permission' && !locationError) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <BackBar title="Nearby Salons" />
        <View style={s.centreBox}>
          <View style={s.iconCircle}><Text style={s.iconGlyph}>◎</Text></View>
          <Text style={s.permTitle}>Find salons near you</Text>
          <Text style={s.permBody}>
            Lumé shows grooming studios within a few kilometres.{'\n'}
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
        <StatusBar style="light" />
        <ActivityIndicator color={Colors.gold} size="large" />
        <Text style={s.loadingText}>Finding nearby salons…</Text>
      </View>
    );
  }

  // ── Location denied ────────────────────────────────────────────────────────
  if (locationError === 'location_denied') {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <BackBar title="Nearby Salons" />
        <View style={s.errorContainer}>
          <Text style={s.errorIcon}>📍</Text>
          <Text style={s.errorTitle}>Location access needed</Text>
          <Text style={s.errorMessage}>
            Enable location in your phone settings to find salons near you
          </Text>
          <TouchableOpacity
            style={s.goldButton}
            onPress={() => Linking.openSettings()}
            activeOpacity={0.85}
          >
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
        <StatusBar style="light" />
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
        <StatusBar style="light" />
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
        <StatusBar style="light" />
        <BackBar title="Nearby Salons" />
        <View style={s.centreBox}>
          <Text style={s.permTitle}>Which city are you in?</Text>
          <Text style={s.permBody}>We'll show you the best grooming studios nearby.</Text>
          <TextInput
            style={s.cityInput}
            placeholder="e.g. Bangalore, Mumbai…"
            placeholderTextColor={Colors.textTertiary}
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

  // ── Map + cards ────────────────────────────────────────────────────────────
  const mapRegion = userLoc
    ? { ...userLoc, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : BANGALORE;

  const sheetTranslate = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] });

  const lumeCount  = lumeRatings.length;
  const lumeAvg    = avg(lumeRatings.map(r => r.rating_overall));
  const categoryAvgs = {
    ambience:     avg(lumeRatings.map(r => r.rating_ambience)),
    priceValue:   avg(lumeRatings.map(r => r.rating_price_value)),
    staff:        avg(lumeRatings.map(r => r.rating_staff)),
    hygiene:      avg(lumeRatings.map(r => r.rating_hygiene)),
    stylistSkill: avg(lumeRatings.map(r => r.rating_stylist_skill)),
  };
  const topPriceTier = modeTier(
    lumeRatings.map(r => gender === 'woman' ? r.haircut_price_tier_women : r.haircut_price_tier_men),
  );
  const tierLabels = gender === 'woman' ? WOMEN_TIERS : MEN_TIERS;

  return (
    <View style={s.screen}>
      <StatusBar style="light" />

      <View style={[s.topBar, { paddingTop: insets.top }]}>
        <BackBar title="Nearby Salons" />
      </View>

      <MapView
        ref={mapRef}
        style={s.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={mapRegion}
        showsUserLocation={!!userLoc}
        showsMyLocationButton={false}
      >
        {userLoc && (
          <Circle
            center={userLoc}
            radius={3000}
            strokeColor={Colors.gold + '44'}
            fillColor={Colors.gold + '0D'}
          />
        )}
        {salons.map(salon => (
          <Marker
            key={salon.id}
            coordinate={{ latitude: salon.latitude, longitude: salon.longitude }}
            onPress={() => focusSalon(salon)}
          >
            <View style={[s.pin, selected?.id === salon.id && s.pinActive]}>
              <Text style={[s.pinText, selected?.id === salon.id && s.pinTextActive]}>
                {salon.priceRange || '₹'}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Salon cards */}
      <View style={[s.cardsWrap, { paddingBottom: insets.bottom + 8 }]}>
        <Text style={s.cardsLabel}>{salons.length} salons nearby</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.cardsScroll}
          snapToInterval={CARD_W + Spacing.sm}
          decelerationRate="fast"
        >
          {salons.map(salon => (
            <TouchableOpacity
              key={salon.id}
              style={[s.card, selected?.id === salon.id && s.cardActive]}
              onPress={() => { focusSalon(salon); openSheet(salon); }}
              activeOpacity={0.85}
            >
              <View style={s.cardThumb}>
                {salon.photoUrl && (
                  <Image
                    source={{ uri: salon.photoUrl }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                )}
                <View style={s.cardThumbOverlay} />
                {salon.openNow === true  && <View style={s.openBadge}><Text style={s.openBadgeText}>Open now</Text></View>}
                {salon.openNow === false && <View style={[s.openBadge, s.closedBadge]}><Text style={s.openBadgeText}>Closed</Text></View>}
              </View>
              <View style={s.cardBody}>
                <Text style={s.cardName} numberOfLines={1}>{salon.name}</Text>
                <Text style={s.cardAddr} numberOfLines={1}>{salon.address}</Text>
                <View style={s.metaRow}>
                  <Text style={s.ratingText}>★ {salon.rating}</Text>
                  <Text style={s.dot}>·</Text>
                  <Text style={s.reviewText}>{salon.reviewCount} reviews</Text>
                  {salon.distance != null && (
                    <><Text style={s.dot}>·</Text><Text style={s.distText}>{salon.distance.toFixed(1)} km</Text></>
                  )}
                </View>
                {!!salon.priceRange && (
                  <View style={s.tagsRow}>
                    <View style={s.tag}><Text style={s.tagText}>{salon.priceRange}</Text></View>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Bottom sheet */}
      {sheetVisible && selected && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={closeSheet} />
          <Animated.View style={[s.sheet, { transform: [{ translateY: sheetTranslate }] }]}>
            {/* Photo */}
            <View style={s.sheetPhoto}>
              {selected.photoUrl
                ? <Image source={{ uri: selected.photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                : <View style={s.sheetPhotoPlaceholder}><Text style={s.sheetPhotoInitial}>{selected.name[0]}</Text></View>
              }
              {selected.openNow === true  && <View style={s.openBadge}><Text style={s.openBadgeText}>Open now</Text></View>}
              {selected.openNow === false && <View style={[s.openBadge, s.closedBadge]}><Text style={s.openBadgeText}>Closed</Text></View>}
              <TouchableOpacity style={s.sheetClose} onPress={closeSheet} activeOpacity={0.8}>
                <Text style={s.sheetCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={s.sheetScroll} showsVerticalScrollIndicator={false}>
              <View style={s.sheetBody}>
                <Text style={s.sheetName}>{selected.name}</Text>
                <Text style={s.sheetAddr}>{selected.address}</Text>
                <View style={s.metaRow}>
                  <Text style={s.ratingText}>★ {selected.rating}</Text>
                  <Text style={s.dot}>·</Text>
                  <Text style={s.reviewText}>{selected.reviewCount} reviews</Text>
                  {!!selected.priceRange && (
                    <><Text style={s.dot}>·</Text><Text style={s.reviewText}>{selected.priceRange}</Text></>
                  )}
                </View>

                <Text style={s.sheetSectionLabel}>LUMÉ RATINGS</Text>
                {loadingLume ? (
                  <ActivityIndicator color={Colors.gold} style={{ marginVertical: Spacing.md }} />
                ) : lumeCount === 0 ? (
                  <Text style={s.lumeEmpty}>No Lumé ratings yet — be the first.</Text>
                ) : (
                  <View style={s.lumeCard}>
                    <View style={s.lumeOverallRow}>
                      <Text style={s.lumeOverallNum}>{lumeAvg}</Text>
                      <View>
                        <StarRating value={Math.round(lumeAvg ?? 0)} size="sm" />
                        <Text style={s.lumeCount}>{lumeCount} {lumeCount === 1 ? 'rating' : 'ratings'}</Text>
                      </View>
                    </View>
                    {Object.entries({
                      Ambience:        categoryAvgs.ambience,
                      'Price value':   categoryAvgs.priceValue,
                      Staff:           categoryAvgs.staff,
                      Hygiene:         categoryAvgs.hygiene,
                      'Stylist skill': categoryAvgs.stylistSkill,
                    }).map(([label, val]) => val != null ? (
                      <View key={label} style={s.lumeCatRow}>
                        <Text style={s.lumeCatLabel}>{label}</Text>
                        <View style={s.lumeCatRight}>
                          <Text style={s.lumeCatNum}>{val}</Text>
                          <StarRating value={Math.round(val)} size="sm" />
                        </View>
                      </View>
                    ) : null)}
                  </View>
                )}

                {lumeCount > 0 && topPriceTier && (
                  <>
                    <Text style={s.sheetSectionLabel}>HAIRCUT PRICE</Text>
                    <View style={s.priceCard}>
                      <Text style={s.priceTierLabel}>{tierLabels[topPriceTier[0]] ?? topPriceTier[0]}</Text>
                      <Text style={s.priceReportCount}>
                        reported by {topPriceTier[1]} {topPriceTier[1] === 1 ? 'user' : 'users'}
                      </Text>
                    </View>
                  </>
                )}

                <View style={s.actionRow}>
                  <TouchableOpacity
                    style={[s.actionBtn, s.dirBtn]}
                    activeOpacity={0.85}
                    onPress={() => {
                      const url = `https://www.google.com/maps/dir/?api=1` +
                        `&destination=${selected.latitude},${selected.longitude}` +
                        `&destination_place_id=${selected.id}&travelmode=driving`;
                      Linking.openURL(url);
                    }}
                  >
                    <Text style={s.dirBtnText}>Directions</Text>
                  </TouchableOpacity>
                  {fetchingPhone && (
                    <View style={[s.actionBtn, s.callBtn, s.callBtnDisabled]}>
                      <ActivityIndicator color={Colors.gold} size="small" />
                    </View>
                  )}
                  {!fetchingPhone && sheetPhone && (
                    <TouchableOpacity
                      style={[s.actionBtn, s.callBtn]}
                      activeOpacity={0.85}
                      onPress={() => Linking.openURL(`tel:${sheetPhone}`)}
                    >
                      <Text style={s.callBtnText}>Call</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={s.rateBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    closeSheet();
                    router.push({
                      pathname: '/salons/rate-salon',
                      params: { placeId: selected.id, name: selected.name, address: selected.address },
                    });
                  }}
                >
                  <Text style={s.rateBtnText}>Rate this salon</Text>
                </TouchableOpacity>

                <View style={{ height: Spacing.xl }} />
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      )}
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
  arrow: { fontSize: 28, color: Colors.gold, lineHeight: 32 },
  title: { fontFamily: Typography.serif, fontSize: Typography.size.lg, color: Colors.cream },
});

// ─── STYLES ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: Colors.background },
  centreBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xl },
  topBar:    { backgroundColor: Colors.background, zIndex: 10 },

  // Permission / city
  iconCircle:     { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xl },
  iconGlyph:      { fontSize: 28, color: Colors.gold },
  permTitle:      { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream, textAlign: 'center', marginBottom: Spacing.sm },
  permBody:       { fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xxl },
  primaryBtn:     { width: '100%', backgroundColor: Colors.gold, borderRadius: Radius.input, paddingVertical: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  primaryBtnText: { fontSize: Typography.size.md, fontWeight: '600', color: Colors.background },
  ghostBtn:       { paddingVertical: Spacing.sm },
  ghostBtnText:   { fontSize: Typography.size.base, color: Colors.textSecondary },
  cityInput:      { width: '100%', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.input, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: Typography.size.md, color: Colors.cream, marginBottom: Spacing.md },
  disabled:       { opacity: 0.4 },
  loadingText:    { fontSize: Typography.size.base, color: Colors.textSecondary, marginTop: Spacing.md },

  // Error states
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorIcon:      { fontSize: 40, marginBottom: 16 },
  errorTitle:     { fontFamily: Typography.serif, fontSize: 20, color: Colors.cream, textAlign: 'center', marginBottom: 8 },
  errorMessage:   { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  goldButton:     { backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginBottom: 12 },
  goldButtonText: { color: Colors.background, fontWeight: '600', fontSize: 14 },
  retryLink:      { padding: 8 },
  retryText:      { color: Colors.textSecondary, fontSize: 14 },

  map: { flex: 1 },

  pin:           { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  pinActive:     { backgroundColor: Colors.gold, borderColor: Colors.gold },
  pinText:       { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  pinTextActive: { color: Colors.background },

  cardsWrap:   { backgroundColor: Colors.background, paddingTop: Spacing.md },
  cardsLabel:  { fontSize: Typography.size.sm, color: Colors.textSecondary, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  cardsScroll: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },

  card:             { width: CARD_W, backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  cardActive:       { borderColor: Colors.gold },
  cardThumb:        { height: 90, backgroundColor: Colors.border, overflow: 'hidden' },
  cardThumbOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  cardBody:         { padding: Spacing.sm },
  cardName:         { fontSize: Typography.size.md, color: Colors.cream, fontWeight: '600', marginBottom: 2 },
  cardAddr:         { fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing.xs },
  metaRow:          { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.xs },
  ratingText:       { fontSize: Typography.size.sm, color: Colors.gold },
  dot:              { fontSize: Typography.size.sm, color: Colors.textTertiary },
  reviewText:       { fontSize: Typography.size.sm, color: Colors.textSecondary },
  distText:         { fontSize: Typography.size.sm, color: Colors.textSecondary },
  tagsRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag:              { backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText:          { fontSize: 10, color: Colors.textSecondary },

  openBadge:     { position: 'absolute', top: Spacing.sm, left: Spacing.sm, backgroundColor: '#1A3A1A', borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  closedBadge:   { backgroundColor: '#3A1A1A' },
  openBadgeText: { fontSize: 10, color: '#6BCB77', fontWeight: '600' },

  // Sheet
  overlay:               { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:                 { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  sheetScroll:           { flex: 1 },
  sheetPhoto:            { height: 160, backgroundColor: Colors.border, overflow: 'hidden' },
  sheetPhotoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface2 },
  sheetPhotoInitial:     { fontFamily: Typography.serif, fontSize: 48, color: Colors.gold },
  sheetClose:            { position: 'absolute', top: Spacing.sm, right: Spacing.sm, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  sheetCloseText:        { fontSize: 14, color: Colors.cream, lineHeight: 18 },
  sheetBody:             { padding: Spacing.lg },
  sheetName:             { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream, marginBottom: 4 },
  sheetAddr:             { fontSize: Typography.size.base, color: Colors.textSecondary, marginBottom: Spacing.sm },
  sheetSectionLabel:     { fontSize: Typography.size.xs, color: Colors.gold, letterSpacing: 6, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },

  // Lumé ratings
  lumeEmpty:      { fontSize: Typography.size.sm, color: Colors.textTertiary, marginBottom: Spacing.sm },
  lumeCard:       { backgroundColor: Colors.surface2, borderRadius: Radius.card, padding: Spacing.md, marginBottom: Spacing.sm },
  lumeOverallRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  lumeOverallNum: { fontFamily: Typography.serif, fontSize: 36, color: Colors.cream },
  lumeCount:      { fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
  lumeCatRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  lumeCatLabel:   { fontSize: Typography.size.sm, color: Colors.textSecondary },
  lumeCatRight:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  lumeCatNum:     { fontSize: Typography.size.sm, color: Colors.cream, width: 28, textAlign: 'right' },

  // Price
  priceCard:        { backgroundColor: Colors.surface2, borderRadius: Radius.card, padding: Spacing.md, marginBottom: Spacing.sm },
  priceTierLabel:   { fontSize: Typography.size.md, color: Colors.cream, fontWeight: '600' },
  priceReportCount: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },

  // Buttons
  actionRow:      { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  actionBtn:      { flex: 1, borderRadius: Radius.input, paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center' },
  dirBtn:         { backgroundColor: Colors.gold },
  dirBtnText:     { fontSize: Typography.size.md, fontWeight: '600', color: Colors.background },
  callBtn:        { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.gold },
  callBtnDisabled:{ borderColor: Colors.border },
  callBtnText:    { fontSize: Typography.size.md, fontWeight: '600', color: Colors.gold },
  rateBtn:        { backgroundColor: Colors.surface2, borderRadius: Radius.input, borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  rateBtnText:    { fontSize: Typography.size.md, color: Colors.cream, fontWeight: '600' },
});
