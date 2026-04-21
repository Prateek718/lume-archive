// Recommendations viewer — read-only view of a saved scan's prescription.
// Reachable from Profile (latest scan card and scan history). Differs from
// /recommendations (post-scan flow) by always loading via scanId, hiding the
// "Set up hair profile" upsell, and capping with a "See your routine" CTA
// that lands users back on the routine tab.

import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import type { Scan, HairProfile, HairRecommendations } from '../types';
import { isBaldProfile } from '../types';

function firstSentence(text?: string): string {
  if (!text) return '';
  const end = text.search(/[.!?]/);
  return end === -1 ? text.trim() : text.slice(0, end + 1).trim();
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function RecommendationsViewScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { scanId } = useLocalSearchParams<{ scanId: string }>();

  const [scan,        setScan]        = useState<Scan | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [gender,      setGender]      = useState('man');
  const [hairProfile, setHairProfile] = useState<HairProfile | null>(null);
  const [hairRecs,    setHairRecs]    = useState<HairRecommendations | null>(null);
  const [city,        setCity]        = useState<string | null>(null);
  const [ageRange,    setAgeRange]    = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!scanId) { setLoading(false); return; }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const [scanRes, profileRes] = await Promise.all([
          supabase.from('scans').select('*').eq('id', scanId).single(),
          user
            ? supabase
                .from('users')
                .select('gender, hair_profile, hair_recommendations, city, age_range')
                .eq('id', user.id)
                .single()
            : Promise.resolve({ data: null }),
        ]);

        if (scanRes.data) setScan(scanRes.data as Scan);

        const profile = profileRes.data as {
          gender?:               string | null;
          hair_profile?:         HairProfile | null;
          hair_recommendations?: HairRecommendations | null;
          city?:                 string | null;
          age_range?:            string | null;
        } | null;
        if (profile) {
          setGender(profile.gender ?? 'man');
          setHairProfile(profile.hair_profile ?? null);
          setHairRecs(profile.hair_recommendations ?? null);
          setCity(profile.city ?? null);
          setAgeRange(profile.age_range ?? null);
        }
      } catch (err) {
        console.error('[recommendations-view] load failed', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [scanId]);

  const goDetail = (path: string, extraParams?: Record<string, string>) => {
    if (!scan) return;
    router.push({
      pathname: path as any,
      params: { scanJson: JSON.stringify(scan), gender, ...extraParams },
    });
  };

  if (loading) {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!scan?.recommendations) {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Text style={s.errorText}>This scan has no recommendations.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: Spacing.lg }}>
          <Text style={s.linkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isWoman = gender === 'woman';
  const bald    = isBaldProfile(hairProfile);
  const rec     = scan.recommendations;

  const hairTags = hairProfile
    ? bald
      ? ['Bald / Shaved', hairProfile.scalp_concern && hairProfile.scalp_concern !== 'none' ? hairProfile.scalp_concern : null].filter(Boolean) as string[]
      : [hairProfile.texture, hairProfile.primary_concern?.[0] && hairProfile.primary_concern[0] !== 'none' ? hairProfile.primary_concern[0] : null].filter(Boolean) as string[]
    : [];
  const skinTags  = [scan.skin_type, ...(scan.skin_concerns?.slice(0, 2) ?? [])].filter(Boolean) as string[];
  const thirdTags = isWoman
    ? [scan.brow_condition, scan.undereye].filter(Boolean) as string[]
    : [scan.beard_condition ?? scan.beard_density].filter(Boolean) as string[];

  const SKIN_CATS   = ['face_cleanser', 'moisturiser', 'spf_sunscreen', 'serum_vitamin_c', 'serum_niacinamide', 'eye_cream'];
  const BEARD_CATS  = ['beard_oil', 'beard_wash', 'beard_balm'];
  const MAKEUP_CATS = ['foundation_fair', 'foundation_medium', 'foundation_deep', 'kajal_eyeliner', 'eyebrow_pencil', 'lipstick_nude', 'lipstick_berry', 'concealer'];

  const skinProductCount   = (rec.products ?? []).filter(p => SKIN_CATS.includes(p.category)).length;
  const beardProductCount  = (rec.products ?? []).filter(p => BEARD_CATS.includes(p.category)).length;
  const makeupProductCount = (rec.products ?? []).filter(p => MAKEUP_CATS.includes(p.category)).length;

  const skinStepCount = new Set([
    ...(rec.skin?.routine?.morning?.map(st => st.product) ?? []),
    ...(rec.skin?.routine?.evening?.map(st => st.product) ?? []),
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
        <Text style={s.topTitle}>Your prescription</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text style={s.title}>Your plan</Text>
          <Text style={s.subtitle}>
            {[scan.skin_type, city, ageRange].filter(Boolean).join(' · ')}
          </Text>
          {scan.created_at && (
            <Text style={s.scanDate}>Scanned {formatDate(scan.created_at)}</Text>
          )}
        </View>

        {hairProfile && (
          <CategoryCard
            title={bald ? 'Scalp Care' : 'Hair'}
            meta={`${hairRecs?.routine?.length ?? 0} steps · ${hairRecs?.products?.length ?? 0} products`}
            tags={hairTags}
            preview={firstSentence(hairRecs?.advice) || hairRecs?.summary || 'Personalised routine ready.'}
            onPress={() => goDetail('/hair-detail', hairRecs ? { hairRecsJson: JSON.stringify(hairRecs) } : {})}
          />
        )}

        <CategoryCard
          title="Skin"
          meta={`${skinStepCount} steps · ${skinProductCount} products`}
          tags={skinTags}
          preview={firstSentence(rec.skin?.advice) || rec.skin?.summary || ''}
          onPress={() => goDetail('/skin-detail')}
        />

        {isWoman ? (
          <CategoryCard
            title="Makeup"
            meta={`${rec.makeup?.techniques?.length ?? 0} steps · ${makeupProductCount} products`}
            tags={thirdTags}
            preview={firstSentence(rec.makeup?.advice) || rec.makeup?.summary || ''}
            onPress={() => goDetail('/makeup-detail')}
          />
        ) : (
          <CategoryCard
            title="Beard"
            meta={`${beardProductCount} products · Daily`}
            tags={thirdTags}
            preview={firstSentence(rec.beard?.advice) || rec.beard?.summary || ''}
            onPress={() => goDetail('/beard-detail')}
          />
        )}

        <TouchableOpacity
          style={s.routineCta}
          activeOpacity={0.85}
          onPress={() => router.push('/(tabs)/routine')}
        >
          <Text style={s.routineCtaText}>See your routine</Text>
        </TouchableOpacity>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

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

const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: Colors.background },
  center:    { alignItems: 'center', justifyContent: 'center' },
  errorText: { color: Colors.text, fontSize: Typography.size.base },
  linkText:  { color: Colors.accent, fontSize: Typography.size.base },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs,
  },
  backArrow: { fontSize: 32, color: Colors.text, lineHeight: 40 },
  topTitle:  { fontFamily: Typography.serif, fontSize: 18, color: Colors.text },

  scroll:   { flex: 1 },
  content:  { paddingHorizontal: Spacing.lg },

  header:   { paddingTop: 16, paddingBottom: 12 },
  title:    { fontFamily: Typography.serif, fontSize: 24, color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: Colors.text2 },
  scanDate: { fontSize: 11, color: Colors.text3, marginTop: 4 },

  categoryCard: {
    backgroundColor: Colors.card,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         14,
    marginBottom:    10,
  },
  categoryCardInner: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    marginBottom:   8,
  },
  categoryLeft:    { flex: 1 },
  categoryTitle:   { fontFamily: Typography.serif, fontSize: 18, color: Colors.text, marginBottom: 3 },
  categoryMeta:    { fontSize: 12, color: Colors.text2, marginBottom: 6 },
  pillsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  concernPill:     { backgroundColor: Colors.accentBg, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  concernPillText: { fontSize: 9, color: Colors.accent },
  healthyPill:     { backgroundColor: Colors.successBg, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  healthyPillText: { fontSize: 9, color: Colors.green },
  categoryChevron: { fontSize: 18, color: Colors.text3, marginLeft: 8 },
  categoryDivider: { height: 1, backgroundColor: Colors.border, marginBottom: 8 },
  categoryPreview: { fontSize: 11, color: Colors.text2, lineHeight: 17 },

  routineCta: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.input,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       Spacing.md,
  },
  routineCtaText: { fontSize: 14, color: Colors.textOnAccent, fontWeight: '600' },
});
