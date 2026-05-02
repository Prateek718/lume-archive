// Nearby salons list. States: requesting permission → loading → loaded list /
// empty / error / permission denied (city input fallback) / missing API key.
//
// Supports two query modes:
// - rateMode=1 → tapping a row routes to /(discover)/rate/[placeId]
// - claimMode=1 → tapping a row routes to /(discover)/claim/welcome with placeId
// - default → tapping a row opens the salon detail screen.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BackButton, ChapterLabel, Display, PrimaryButton, TextLink,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import {
  fetchNearbySalons, getCurrentLocation, priceLevelGlyph,
} from '../../services/locationService';
import { mergeWithLumeData } from '../../services/salonService';
import type { NearbySalon } from '../../types';

type Status =
  | { kind: 'init' }
  | { kind: 'permission_denied' }
  | { kind: 'loading' }
  | { kind: 'loaded'; salons: NearbySalon[] }
  | { kind: 'empty' }
  | { kind: 'missing_key' }
  | { kind: 'error'; message: string };

export default function NearbyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ rateMode?: string; claimMode?: string }>();
  const rateMode  = params.rateMode === '1';
  const claimMode = params.claimMode === '1';

  const [status, setStatus] = useState<Status>({ kind: 'init' });
  const [cityInput, setCityInput] = useState('');

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' });
    const loc = await getCurrentLocation();
    if (!loc) {
      setStatus({ kind: 'permission_denied' });
      return;
    }
    try {
      const raw = await fetchNearbySalons(loc.lat, loc.lng);
      if (raw.length === 0) {
        setStatus({ kind: 'empty' });
        return;
      }
      const merged = await mergeWithLumeData(raw);
      setStatus({ kind: 'loaded', salons: merged });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'MISSING_PLACES_KEY') {
        setStatus({ kind: 'missing_key' });
      } else {
        setStatus({ kind: 'error', message: msg });
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onSalonTap = (s: NearbySalon) => {
    if (rateMode) {
      router.push({
        pathname: '/(discover)/rate/[placeId]',
        params: { placeId: s.google_place_id, salonName: s.name },
      });
      return;
    }
    if (claimMode) {
      router.push({
        pathname: '/(discover)/claim/welcome',
        params: { placeId: s.google_place_id, salonName: s.name },
      });
      return;
    }
    router.push({
      pathname: '/(discover)/salon/[placeId]',
      params: { placeId: s.google_place_id, salonName: s.name },
    });
  };

  const headerLabel = (() => {
    if (rateMode)  return 'Rate a salon · within 5 km';
    if (claimMode) return 'Claim a salon · within 5 km';
    if (status.kind === 'loaded' && status.salons[0]?.neighborhood) {
      return `Within 5 km · ${status.salons[0].neighborhood}`;
    }
    return 'Within 5 km';
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 32, paddingTop: 12 }}>
          <ChapterLabel>{headerLabel}</ChapterLabel>
          <Display style={{ marginTop: 12, fontSize: 34, lineHeight: 38 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              Nearby
            </Text>
            {'\nsalons.'}
          </Display>
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 28 }}>
          {status.kind === 'init' && null}
          {status.kind === 'loading' && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color={Palette.accent} />
              <Text style={{
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle:  'italic',
                fontSize:   16,
                color:      Palette.ink3,
                marginTop:  18,
              }}>
                Finding salons near you...
              </Text>
            </View>
          )}

          {status.kind === 'permission_denied' && (
            <View style={{ paddingVertical: 12 }}>
              <Text style={{
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle:  'italic',
                fontSize:   16,
                color:      Palette.ink3,
                marginBottom: 14,
              }}>
                Location access denied. Enter your city to continue.
              </Text>
              <TextInput
                value={cityInput}
                onChangeText={setCityInput}
                placeholder="Enter city..."
                placeholderTextColor={Palette.ink4}
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: Palette.rule,
                  paddingVertical:   8,
                  fontFamily:        'CormorantGaramond_400Regular_Italic',
                  fontStyle:         'italic',
                  fontSize:          18,
                  color:             Palette.ink,
                }}
              />
              <Text style={{
                fontFamily: 'Inter_400Regular',
                fontSize:   11.5,
                color:      Palette.ink3,
                marginTop:  18,
              }}>
                Manual city search isn’t available yet. Enable location to find salons near you.
              </Text>
              <View style={{ height: 24 }} />
              <PrimaryButton label="Try again" onPress={() => void load()} />
            </View>
          )}

          {status.kind === 'missing_key' && (
            <Text style={{
              fontFamily: 'CormorantGaramond_400Regular_Italic',
              fontStyle:  'italic',
              fontSize:   15,
              color:      Palette.ink3,
              lineHeight: 22,
            }}>
              Location services unavailable. Set up Google Places API key in
              .env to enable salon discovery.
            </Text>
          )}

          {status.kind === 'error' && (
            <View style={{ paddingVertical: 12 }}>
              <Text style={{
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle:  'italic',
                fontSize:   16,
                color:      Palette.ink3,
                marginBottom: 18,
              }}>
                Could not load. Try again.
              </Text>
              <PrimaryButton label="Retry" onPress={() => void load()} />
            </View>
          )}

          {status.kind === 'empty' && (
            <Text style={{
              fontFamily: 'CormorantGaramond_400Regular_Italic',
              fontStyle:  'italic',
              fontSize:   16,
              color:      Palette.ink3,
            }}>
              No salons within 5 km. Try a different area.
            </Text>
          )}

          {status.kind === 'loaded' && status.salons.map((s, i) => (
            <SalonRow
              key={s.google_place_id}
              salon={s}
              first={i === 0}
              onPress={() => onSalonTap(s)}
              ctaLabel={
                rateMode  ? 'Rate →' :
                claimMode ? 'Claim →' : null
              }
            />
          ))}

          {status.kind === 'loaded' && !claimMode && (
            <View style={{ marginTop: 36, alignItems: 'center' }}>
              <TextLink
                label="Don’t see your salon? Claim it →"
                onPress={() => router.push('/(discover)/claim/welcome')}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SalonRow({
  salon, first, onPress, ctaLabel,
}: {
  salon: NearbySalon;
  first: boolean;
  onPress: () => void;
  ctaLabel: string | null;
}) {
  const subParts = [salon.neighborhood, `${salon.distance_km.toFixed(1)} km`].filter(Boolean);
  const subLine = subParts.join(' · ');

  const useLume = salon.is_verified && salon.rating_lume_count > 0;
  const ratingValue = useLume ? salon.rating_lume_avg : salon.rating_google;
  const ratingCount = useLume ? salon.rating_lume_count : salon.rating_count_google;
  const ratingSource = useLume ? `${ratingCount} ${ratingCount === 1 ? 'rating' : 'ratings'}` : 'Google rating';
  const price = priceLevelGlyph(salon.price_level);

  const ratingLine = [
    ratingValue != null ? `★ ${ratingValue.toFixed(1)}` : null,
    ratingValue != null ? ratingSource : null,
    price,
  ].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        paddingVertical:   16,
        borderTopWidth:    1,
        borderTopColor:    Palette.rule,
        borderBottomWidth: 1,
        borderBottomColor: Palette.rule,
        marginTop:         first ? 0 : -1,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{
          fontFamily: 'CormorantGaramond_500Medium_Italic',
          fontStyle:  'italic',
          fontSize:   18,
          color:      Palette.ink,
          flex:       1,
          paddingRight: 8,
        }}>
          {salon.name}
        </Text>
        {salon.is_verified && (
          <Text style={{
            fontFamily:    'Inter_500Medium',
            fontSize:      9,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            color:         Palette.accent,
          }}>
            verified
          </Text>
        )}
        {!salon.is_verified && ctaLabel && (
          <Text style={{
            fontFamily:    'Inter_500Medium',
            fontSize:      11,
            color:         Palette.accent,
            letterSpacing: 0.4,
          }}>
            {ctaLabel}
          </Text>
        )}
        {salon.is_verified && ctaLabel && (
          <Text style={{
            fontFamily:    'Inter_500Medium',
            fontSize:      11,
            color:         Palette.accent,
            letterSpacing: 0.4,
            marginLeft:    8,
          }}>
            {ctaLabel}
          </Text>
        )}
      </View>
      <Text style={{
        fontFamily: 'Inter_400Regular',
        fontSize:   11.5,
        color:      Palette.ink3,
        marginTop:  4,
      }}>
        {subLine}
      </Text>
      {!!ratingLine && (
        <Text style={{
          fontFamily: 'Inter_400Regular',
          fontSize:   11.5,
          color:      Palette.ink2,
          marginTop:  4,
        }}>
          {ratingLine}
        </Text>
      )}
    </TouchableOpacity>
  );
}
