// Salon detail screen. Loads claim profile (may be null) + ratings summary.
// Renders verification chip, stats band, dimension stars, services, and CTAs
// to rate or get directions. Unclaimed salons show an "Are you the owner?"
// link routing into the claim flow.

import { useCallback, useEffect, useState } from 'react';
import {
  Linking, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  BackButton, ChapterLabel, Display, PrimaryButton, TextLink,
} from '../../../components/editorial';
import { Palette } from '../../../constants/theme';
import { StarRating } from '../../../components/ui/StarRating';
import {
  fetchSalonProfile, fetchSalonRatings,
  type SalonRatingsSummary,
} from '../../../services/salonService';
import type { SalonProfile } from '../../../types';

export default function SalonDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ placeId?: string; salonName?: string }>();
  const placeId = typeof params.placeId === 'string' ? params.placeId : null;
  const fallbackName = typeof params.salonName === 'string' ? params.salonName : 'Salon';

  const [profile, setProfile] = useState<SalonProfile | null>(null);
  const [ratings, setRatings] = useState<SalonRatingsSummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!placeId) { setLoaded(true); return; }
    const [p, r] = await Promise.all([
      fetchSalonProfile(placeId),
      fetchSalonRatings(placeId),
    ]);
    setProfile(p);
    setRatings(r);
    setLoaded(true);
  }, [placeId]);

  useEffect(() => { void reload(); }, [reload]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  if (!placeId) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }
  if (!loaded || !ratings) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  const rawName = profile?.salon_name ?? fallbackName;
  const cleanName = rawName.replace(/[,.\s]+$/, '');
  const neighborhood = profile?.city ?? null;
  const verified = profile?.verification_status === 'verified';
  const services = collectServices(profile);

  const dimensionRows: Array<{ label: string; value: number }> = [];
  if (ratings.averages.service != null) dimensionRows.push({ label: 'Service', value: ratings.averages.service });
  if (ratings.averages.staff   != null) dimensionRows.push({ label: 'Staff',   value: ratings.averages.staff });
  if (ratings.averages.hygiene != null) dimensionRows.push({ label: 'Hygiene', value: ratings.averages.hygiene });
  if (ratings.averages.value   != null) dimensionRows.push({ label: 'Value',   value: ratings.averages.value });

  const onDirections = () => {
    const query = encodeURIComponent(cleanName + (neighborhood ? `, ${neighborhood}` : ''));
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={{ paddingHorizontal: 32, paddingTop: 12 }}>
          <ChapterLabel style={verified ? { color: Palette.accent } : undefined}>
            {verified
              ? `Verified${neighborhood ? ` · ${neighborhood}` : ''}`
              : (neighborhood ?? 'Salon')}
          </ChapterLabel>
          <Display style={{ marginTop: 12, fontSize: 30, lineHeight: 34 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              {cleanName}
            </Text>
          </Display>
        </View>

        {/* Stats band */}
        <View style={{ paddingHorizontal: 32, paddingTop: 28 }}>
          <View
            style={{
              flexDirection:     'row',
              borderTopWidth:    1,
              borderTopColor:    Palette.rule,
              borderBottomWidth: 1,
              borderBottomColor: Palette.rule,
              backgroundColor:   Palette.accentSoft,
            }}
          >
            <StatCell
              label="Overall"
              value={ratings.averages.overall != null ? `${ratings.averages.overall.toFixed(1)}/5` : '—'}
            />
            <StatCell
              label="Ratings"
              value={ratings.count > 0 ? String(ratings.count) : '—'}
              right
            />
          </View>
        </View>

        {/* Dimensions — stars only, hidden entirely if all dimensions are null */}
        {dimensionRows.length > 0 && (
          <View style={{ paddingHorizontal: 32, paddingTop: 28 }}>
            <ChapterLabel>By dimension</ChapterLabel>
            <View style={{ height: 14 }} />
            {dimensionRows.map((row) => (
              <DimensionStarRow key={row.label} label={row.label} value={row.value} />
            ))}
          </View>
        )}

        {/* Services offered (claim only) */}
        {services.length > 0 && (
          <View style={{ paddingHorizontal: 32, paddingTop: 28 }}>
            <ChapterLabel>Services offered</ChapterLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {services.map((s) => (
                <View
                  key={s}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical:   6,
                    borderWidth:       1,
                    borderColor:       Palette.rule,
                    borderRadius:      999,
                  }}
                >
                  <Text style={{
                    fontFamily: 'Inter_400Regular',
                    fontSize:   11.5,
                    color:      Palette.ink2,
                  }}>
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={{ paddingHorizontal: 32, paddingTop: 36 }}>
          <PrimaryButton
            label="Rate this salon →"
            onPress={() => router.push({
              pathname: '/(discover)/rate/[placeId]',
              params: { placeId, salonName: cleanName },
            })}
          />
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <TextLink label="Get directions →" onPress={onDirections} />
          </View>
        </View>

        {/* Owner CTA for unclaimed salons */}
        {!profile && (
          <View style={{ paddingHorizontal: 32, paddingTop: 24, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => router.push({
                pathname: '/(discover)/claim/welcome',
                params: { placeId, salonName: cleanName },
              })}
            >
              <Text style={{
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle:  'italic',
                fontSize:   14,
                color:      Palette.ink3,
              }}>
                Are you the owner? Claim this salon →
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function collectServices(profile: SalonProfile | null): string[] {
  if (!profile) return [];
  return [
    ...(profile.services_hair   ?? []),
    ...(profile.services_skin   ?? []),
    ...(profile.services_beard  ?? []),
    ...(profile.services_bridal ?? []),
    ...(profile.services_other  ?? []),
  ];
}

function StatCell({
  label, value, right,
}: { label: string; value: string; right?: boolean }) {
  return (
    <View
      style={{
        flex:             1,
        paddingVertical:  18,
        alignItems:       'center',
        borderRightWidth: right ? 0 : 1,
        borderRightColor: Palette.rule,
      }}
    >
      <Text style={{
        fontFamily:    'Inter_500Medium',
        fontSize:      9,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color:         Palette.ink3,
        marginBottom:  6,
      }}>
        {label}
      </Text>
      <Text style={{
        fontFamily: 'CormorantGaramond_500Medium_Italic',
        fontStyle:  'italic',
        fontSize:   24,
        color:      Palette.ink,
      }}>
        {value}
      </Text>
    </View>
  );
}

function DimensionStarRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={{
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    }}>
      <Text style={{
        fontFamily: 'CormorantGaramond_400Regular_Italic',
        fontStyle:  'italic',
        fontSize:   15,
        color:      Palette.ink,
      }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StarRating value={value} size="small" readOnly />
        <Text style={{
          fontFamily:  'CormorantGaramond_400Regular_Italic',
          fontStyle:   'italic',
          fontSize:    14,
          color:       Palette.ink2,
          fontVariant: ['tabular-nums'],
        }}>
          {value.toFixed(1)}
        </Text>
      </View>
    </View>
  );
}
