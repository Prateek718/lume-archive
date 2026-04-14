// Salon detail screen — community ratings, services, claim / rate / directions.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

interface CommunityRating {
  rating_overall:  number | null;
  rating_staff:    number | null;
  rating_hygiene:  number | null;
  rating_value:    number | null;
  rating_ambience: number | null;
}

interface SalonProfile {
  services_hair:         string[] | null;
  services_skin:         string[] | null;
  services_nails_makeup: string[] | null;
}

function avg(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v != null);
  if (!nums.length) return null;
  return parseFloat((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1));
}

function MiniStars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={{ fontSize: 13, color: n <= filled ? '#C9A84C' : '#2A2420' }}>★</Text>
      ))}
    </View>
  );
}

export default function SalonDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    google_place_id: string;
    name:            string;
    address:         string;
    rating:          string;
    distance:        string;
    city?:           string;
  }>();

  const [loading,  setLoading]  = useState(true);
  const [ratings,  setRatings]  = useState<CommunityRating[]>([]);
  const [profile,  setProfile]  = useState<SalonProfile | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!params.google_place_id) { setLoading(false); return; }

      const [ratingsRes, profileRes] = await Promise.all([
        supabase
          .from('salon_ratings')
          .select('rating_overall, rating_staff, rating_hygiene, rating_value, rating_ambience')
          .eq('google_place_id', params.google_place_id),
        supabase
          .from('salon_profiles')
          .select('services_hair, services_skin, services_nails_makeup')
          .eq('google_place_id', params.google_place_id)
          .maybeSingle(),
      ]);

      setRatings((ratingsRes.data as CommunityRating[]) ?? []);
      setProfile((profileRes.data as SalonProfile | null) ?? null);
      setLoading(false);
    };
    load();
  }, [params.google_place_id]);

  const googleRating = parseFloat(params.rating ?? '0');
  const distance     = params.distance ? `${params.distance} km away` : '';

  // Community averages
  const avgOverall  = avg(ratings.map(r => r.rating_overall));
  const avgStaff    = avg(ratings.map(r => r.rating_staff));
  const avgHygiene  = avg(ratings.map(r => r.rating_hygiene));
  const avgValue    = avg(ratings.map(r => r.rating_value));
  const avgAmbience = avg(ratings.map(r => r.rating_ambience));
  const hasRatings  = ratings.length > 0;

  // Profile service categories
  const serviceCategories: { label: string; items: string[] }[] = [];
  if (profile?.services_hair?.length)
    serviceCategories.push({ label: 'Hair', items: profile.services_hair });
  if (profile?.services_skin?.length)
    serviceCategories.push({ label: 'Skin', items: profile.services_skin });
  if (profile?.services_nails_makeup?.length)
    serviceCategories.push({ label: 'Nails & Makeup', items: profile.services_nails_makeup });

  const directionsUrl =
    `https://www.google.com/maps/place/?q=place_id:${params.google_place_id}`;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Back bar */}
      <View style={s.backBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={s.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={s.salonName}>{params.name}</Text>
        <Text style={s.salonMeta}>
          {params.address}
          {distance ? `  ·  ${distance}` : ''}
        </Text>
        {googleRating > 0 && (
          <View style={s.ratingRow}>
            <MiniStars rating={googleRating} />
            <Text style={s.ratingNum}>{googleRating}</Text>
            <Text style={s.ratingSource}>Google rating</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color="#C9A84C" style={{ marginTop: Spacing.xxl }} />
        ) : (
          <>
            {/* ── Community ratings ── */}
            {hasRatings && (
              <>
                <Text style={s.sectionLabel}>COMMUNITY RATINGS</Text>
                <View style={s.card}>
                  {avgOverall != null && (
                    <View style={[s.catRow, s.catRowBorder]}>
                      <Text style={s.catLabel}>Overall</Text>
                      <View style={s.catRight}>
                        <MiniStars rating={avgOverall} />
                        <Text style={s.catNum}>{avgOverall}</Text>
                      </View>
                    </View>
                  )}
                  {([
                    { label: 'Staff skill',     val: avgStaff    },
                    { label: 'Hygiene',          val: avgHygiene  },
                    { label: 'Value for money',  val: avgValue    },
                    { label: 'Ambience',         val: avgAmbience },
                  ] as const).filter(r => r.val != null).map((row, i, arr) => (
                    <View
                      key={row.label}
                      style={[s.catRow, i < arr.length - 1 && s.catRowBorder]}
                    >
                      <Text style={s.catLabel}>{row.label}</Text>
                      <View style={s.catRight}>
                        <Text style={s.catNum}>{row.val}</Text>
                      </View>
                    </View>
                  ))}
                  <Text style={s.ratingCount}>
                    {ratings.length} {ratings.length === 1 ? 'rating' : 'ratings'} from Lumé users
                  </Text>
                </View>
              </>
            )}

            {/* ── Services offered (if profile) ── */}
            {serviceCategories.length > 0 && (
              <>
                <Text style={s.sectionLabel}>SERVICES OFFERED</Text>
                <View style={s.card}>
                  {serviceCategories.map((cat, i) => (
                    <View key={cat.label} style={[s.serviceBlock, i < serviceCategories.length - 1 && s.serviceBlockBorder]}>
                      <Text style={s.serviceGroupLabel}>{cat.label.toUpperCase()}</Text>
                      <View style={s.pillsWrap}>
                        {cat.items.map(item => (
                          <View key={item} style={s.servicePill}>
                            <Text style={s.servicePillText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── Claim this salon (no profile) ── */}
            {!profile && (
              <>
                <Text style={s.sectionLabel}>OWN THIS SALON?</Text>
                <View style={s.claimCard}>
                  <Text style={s.claimTitle}>Create your Lumé profile</Text>
                  <Text style={s.claimSub}>
                    Show your services and connect with customers who've been analysed by Lumé.
                  </Text>
                  <TouchableOpacity
                    style={s.claimBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push({
                      pathname: '/salons/salon-profile-create',
                      params: {
                        google_place_id: params.google_place_id,
                        name:            params.name,
                        city:            params.city ?? '',
                      },
                    })}
                  >
                    <Text style={s.claimBtnText}>Create salon profile</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Bottom actions */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <TouchableOpacity
          style={s.rateBtn}
          activeOpacity={0.85}
          onPress={() => router.push({
            pathname: '/salons/rate-salon',
            params: {
              placeId: params.google_place_id,
              name:    params.name,
              address: params.address,
            },
          })}
        >
          <Text style={s.rateBtnText}>Rate this salon</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.dirBtn}
          activeOpacity={0.85}
          onPress={() => Linking.openURL(directionsUrl)}
        >
          <Text style={s.dirBtnText}>Directions</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#0A0A0A' },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

  backBar:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn:  { width: 40, alignItems: 'center' },
  backArrow:{ fontSize: 28, color: '#C9A84C', lineHeight: 32 },

  salonName: { fontFamily: Typography.serif, fontSize: 22, color: '#F5F0E8', marginBottom: 4 },
  salonMeta: { fontSize: 13, color: '#8A7A6A', lineHeight: 18, marginBottom: Spacing.sm },

  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.lg },
  ratingNum:    { fontSize: 13, color: '#C9A84C', fontWeight: '600' },
  ratingSource: { fontSize: 13, color: '#4A4540' },

  sectionLabel: { fontSize: 10, color: '#C9A84C', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.sm, marginTop: Spacing.lg },

  card: {
    backgroundColor: '#1A1412',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#2A2420',
    overflow:        'hidden',
    marginBottom:    Spacing.sm,
  },
  catRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  catRowBorder: { borderBottomWidth: 1, borderBottomColor: '#2A2420' },
  catLabel:     { fontSize: 15, color: '#F5F0E8' },
  catRight:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catNum:       { fontSize: 15, color: '#C9A84C', fontWeight: '600', minWidth: 28, textAlign: 'right' },
  ratingCount:  { fontSize: 11, color: '#4A4540', textAlign: 'center', paddingVertical: Spacing.sm },

  // Services
  serviceBlock:        { padding: Spacing.md },
  serviceBlockBorder:  { borderBottomWidth: 1, borderBottomColor: '#2A2420' },
  serviceGroupLabel:   { fontSize: 10, color: '#8A7A6A', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.xs },
  pillsWrap:           { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  servicePill: {
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderWidth:     1,
    borderColor:     'rgba(201,168,76,0.25)',
    borderRadius:    999,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  servicePillText: { fontSize: 13, color: '#C9A84C' },

  // Claim card
  claimCard: {
    borderWidth:  1,
    borderColor:  'rgba(201,168,76,0.3)',
    borderRadius: 12,
    padding:      Spacing.lg,
    marginBottom: Spacing.sm,
  },
  claimTitle: { fontSize: 15, color: '#F5F0E8', marginBottom: 6 },
  claimSub:   { fontSize: 13, color: '#8A7A6A', lineHeight: 20, marginBottom: Spacing.lg },
  claimBtn:   { backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  claimBtnText:{ fontSize: 14, fontWeight: '600', color: '#0A0A0A' },

  // Bottom actions
  bottomBar: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    flexDirection:   'row',
    gap:             Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop:      Spacing.sm,
    backgroundColor: '#0A0A0A',
    borderTopWidth:  1,
    borderTopColor:  '#2A2420',
  },
  rateBtn:     { flex: 1, backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: Spacing.md, alignItems: 'center' },
  rateBtnText: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  dirBtn:      { flex: 1, borderWidth: 1, borderColor: '#2A2420', borderRadius: 10, paddingVertical: Spacing.md, alignItems: 'center', backgroundColor: '#1A1412' },
  dirBtnText:  { fontSize: 13, fontWeight: '600', color: '#F5F0E8' },
});
