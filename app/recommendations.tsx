// Recommendations home screen — category cards with score strip.
// Navigates to hair-detail, skin-detail, beard-detail, makeup-detail.

import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { getLatestSavedScan } from '../services/scanService';
import { Colors, Typography, Spacing } from '../constants/theme';
import type { Scan, HairProfile, HairRecommendations } from '../types';
import { isBaldProfile } from '../types';

export default function RecommendationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanId, scanJson } = useLocalSearchParams<{ scanId?: string; scanJson?: string }>();

  const [scan,        setScan]        = useState<Scan | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [gender,      setGender]      = useState('man');
  const [hairProfile, setHairProfile] = useState<HairProfile | null>(null);
  const [hairRecs,    setHairRecs]    = useState<HairRecommendations | null>(null);
  const [city,        setCity]        = useState<string | null>(null);
  const [ageRange,    setAgeRange]    = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const load = async () => {
      const fetchScanData = async (): Promise<Scan | null> => {
        if (scanJson) return JSON.parse(scanJson) as Scan;
        if (scanId) {
          const { data } = await supabase
            .from('scans').select('*').eq('id', scanId).single();
          return data as Scan | null;
        }
        return getLatestSavedScan();
      };

      const fetchUserData = async (): Promise<{
        g: string;
        hp: HairProfile | null;
        hr: HairRecommendations | null;
        city: string | null;
        ageRange: string | null;
      }> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { g: 'man', hp: null, hr: null, city: null, ageRange: null };
        const { data: profile } = await supabase
          .from('users')
          .select('gender, hair_profile, hair_recommendations, city, age_range')
          .eq('id', user.id)
          .single();
        return {
          g:       (profile?.gender as string | null) ?? 'man',
          hp:      (profile?.hair_profile as HairProfile | null) ?? null,
          hr:      (profile?.hair_recommendations as HairRecommendations | null) ?? null,
          city:    (profile?.city as string | null) ?? null,
          ageRange:(profile?.age_range as string | null) ?? null,
        };
      };

      const [scanResult, userData] = await Promise.all([fetchScanData(), fetchUserData()]);

      if (scanResult) setScan(scanResult);
      setGender(userData.g);
      if (userData.hp)       setHairProfile(userData.hp);
      if (userData.hr)       setHairRecs(userData.hr);
      if (userData.city)     setCity(userData.city);
      if (userData.ageRange) setAgeRange(userData.ageRange);

      setLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    };
    load();
  }, [scanId, scanJson]);

  const goDetail = (path: string, extraParams?: Record<string, string>) => {
    if (!scan) return;
    router.push({
      pathname: path as any,
      params: { scanJson: JSON.stringify(scan), gender, ...extraParams },
    });
  };

  if (loading) {
    return (
      <View style={s.screen}>
        <StatusBar style="dark" />
        <View style={[s.topBar, { paddingTop: insets.top + 4 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
        </View>
        <View style={[{ paddingHorizontal: Spacing.lg }, s.skeletonWrap]}>
          {[1, 2, 3].map(i => (
            <View key={i} style={s.skeletonCard}>
              <View style={s.skeletonTitle} />
              <View style={s.skeletonLine} />
              <View style={s.skeletonLineShort} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (!scan?.recommendations) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Text style={s.errorText}>Could not load recommendations.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: Spacing.lg }}>
          <Text style={s.linkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isWoman = gender === 'woman';
  const bald    = isBaldProfile(hairProfile);
  const rec     = scan!.recommendations!;

  const hairTags = hairProfile
    ? bald
      ? ['Bald / Shaved', hairProfile.scalp_concern && hairProfile.scalp_concern !== 'none' ? hairProfile.scalp_concern : null].filter(Boolean) as string[]
      : [hairProfile.texture, hairProfile.primary_concern && hairProfile.primary_concern !== 'none' ? hairProfile.primary_concern : null].filter(Boolean) as string[]
    : [];
  const skinTags  = [scan?.skin_type, ...(scan?.skin_concerns?.slice(0, 2) ?? [])].filter(Boolean) as string[];
  const thirdTags = isWoman
    ? [scan?.brow_condition, scan?.undereye].filter(Boolean) as string[]
    : [scan?.beard_condition ?? scan?.beard_density].filter(Boolean) as string[];

  // Product counts per domain
  const SKIN_CATS   = ['face_cleanser', 'moisturiser', 'spf_sunscreen', 'serum_vitamin_c', 'serum_niacinamide', 'eye_cream'];
  const BEARD_CATS  = ['beard_oil', 'beard_wash', 'beard_balm'];
  const MAKEUP_CATS = ['foundation_fair', 'foundation_medium', 'foundation_deep', 'kajal_eyeliner', 'eyebrow_pencil', 'lipstick_nude', 'lipstick_berry', 'concealer'];

  const skinProductCount   = (rec.products ?? []).filter(p => SKIN_CATS.includes(p.category)).length;
  const beardProductCount  = (rec.products ?? []).filter(p => BEARD_CATS.includes(p.category)).length;
  const makeupProductCount = (rec.products ?? []).filter(p => MAKEUP_CATS.includes(p.category)).length;

  const skinStepCount = new Set([
    ...(rec.skin?.routine?.morning?.map(s => s.product) ?? []),
    ...(rec.skin?.routine?.evening?.map(s => s.product) ?? []),
  ]).size;

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />

      <View style={[s.topBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        style={[s.scroll, { opacity: fadeAnim }]}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text style={s.title}>Your plan</Text>
          <Text style={s.subtitle}>
            {[scan?.skin_type, city, ageRange].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <CategoryCard
          title={bald ? 'Scalp Care' : 'Hair'}
          meta={hairProfile
            ? `${hairRecs?.routine?.length ?? 0} steps · ${hairRecs?.products?.length ?? 0} products`
            : 'Set up hair profile'}
          tags={hairTags}
          preview={hairRecs?.summary ?? (hairProfile ? 'Personalised routine ready.' : 'Tap to create your hair profile.')}
          onPress={() => {
            if (!hairProfile) {
              router.push({ pathname: '/hair-profile' as any, params: { returnTo: 'hair-detail' } });
            } else {
              goDetail('/hair-detail', hairRecs ? { hairRecsJson: JSON.stringify(hairRecs) } : {});
            }
          }}
        />

        <CategoryCard
          title="Skin"
          meta={`${skinStepCount} products · AM + PM routine`}
          tags={skinTags}
          preview={rec.skin?.summary ?? ''}
          onPress={() => goDetail('/skin-detail')}
        />

        {isWoman ? (
          <CategoryCard
            title="Makeup"
            meta={`${rec.makeup?.techniques?.length ?? 0} steps · ${makeupProductCount} products`}
            tags={thirdTags}
            preview={rec.makeup?.summary ?? ''}
            onPress={() => goDetail('/makeup-detail')}
          />
        ) : (
          <CategoryCard
            title="Beard"
            meta={`${beardProductCount} products · Daily`}
            tags={thirdTags}
            preview={rec.beard?.summary ?? ''}
            onPress={() => goDetail('/beard-detail')}
          />
        )}

        <View style={{ height: Spacing.xxxl }} />
      </Animated.ScrollView>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function isPositiveTag(tag: string): boolean {
  return ['normal', 'healthy', 'well_groomed', 'balanced', 'Bald / Shaved'].includes(tag);
}

function CategoryCard({ title, meta, tags, preview, onPress }: {
  title: string; meta: string; tags: string[]; preview: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.categoryCard} onPress={onPress} activeOpacity={0.8}>
      <View style={s.categoryCardInner}>
        <View style={s.categoryLeft}>
          <Text style={s.categoryTitle}>{title}</Text>
          <Text style={s.categoryMeta}>{meta}</Text>
          {tags.length > 0 && (
            <View style={s.pillsRow}>
              {tags.map(tag => (
                <View key={tag} style={isPositiveTag(tag) ? s.healthyPill : s.concernPill}>
                  <Text style={isPositiveTag(tag) ? s.healthyPillText : s.concernPillText}>
                    {tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <Text style={s.categoryChevron}>›</Text>
      </View>
      <View style={s.categoryDivider} />
      <Text style={s.categoryPreview} numberOfLines={2}>{preview}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: Colors.background },
  center:    { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: Colors.text, fontSize: Typography.size.base },
  linkText:  { color: Colors.text, fontSize: Typography.size.base },

  topBar:    { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs },
  backArrow: { fontSize: 32, color: Colors.text, lineHeight: 40 },

  scroll:   { flex: 1 },
  content:  { paddingHorizontal: Spacing.lg },

  header:   { paddingTop: 16, paddingBottom: 12 },
  title:    { fontFamily: 'Georgia', fontSize: 24, color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.text2 },

  categoryCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  categoryCardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  categoryLeft:    { flex: 1 },
  categoryTitle:   { fontFamily: 'Georgia', fontSize: 18, color: Colors.text, marginBottom: 3 },
  categoryMeta:    { fontSize: 12, color: Colors.text2, marginBottom: 6 },
  pillsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  concernPill:     { backgroundColor: '#F5EAE4', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  concernPillText: { fontSize: 9, color: Colors.accent },
  healthyPill:     { backgroundColor: '#EAF2EB', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  healthyPillText: { fontSize: 9, color: Colors.green },
  categoryChevron: { fontSize: 18, color: Colors.text3, marginLeft: 8 },
  categoryDivider: { height: 1, backgroundColor: Colors.border, marginBottom: 8 },
  categoryPreview: { fontSize: 11, color: Colors.text2, lineHeight: 17 },

  skeletonWrap:      { gap: 10, marginTop: 8 },
  skeletonCard:      { backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, height: 110, justifyContent: 'center', gap: 8 },
  skeletonTitle:     { width: '40%', height: 16, backgroundColor: Colors.surface, borderRadius: 4 },
  skeletonLine:      { width: '80%', height: 10, backgroundColor: Colors.surface, borderRadius: 4 },
  skeletonLineShort: { width: '55%', height: 10, backgroundColor: Colors.surface, borderRadius: 4 },

});
