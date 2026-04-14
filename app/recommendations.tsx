// Recommendations home screen — category cards with score strip.
// Navigates to hair-detail, skin-detail, beard-detail, makeup-detail.

import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { getLatestSavedScan } from '../services/scanService';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import type { Scan } from '../types';

export default function RecommendationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanId, scanJson } = useLocalSearchParams<{ scanId?: string; scanJson?: string }>();

  const [scan,    setScan]    = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [gender,  setGender]  = useState('man');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const load = async () => {
      if (scanJson) {
        setScan(JSON.parse(scanJson) as Scan);
      } else if (scanId) {
        const { data: scanData } = await supabase
          .from('scans').select('*').eq('id', scanId).single();
        if (scanData) setScan(scanData as Scan);
      } else {
        // No params — fall back to the most recently cached scan
        const latest = await getLatestSavedScan();
        if (latest) setScan(latest);
      }

      let g = 'man';
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users').select('gender').eq('id', user.id).single();
        if (profile?.gender) g = profile.gender as string;
      }

      setGender(g);
      setLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    };
    load();
  }, [scanId, scanJson]);

  const goDetail = (path: string) => {
    if (!scan) return;
    router.push({ pathname: path as any, params: { scanJson: JSON.stringify(scan), gender } });
  };

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.gold} size="large" />
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
  const hairTags  = [scan.hair_texture, scan.hair_condition].filter(Boolean) as string[];
  const skinTags  = [scan.skin_type, ...(scan.skin_concerns?.slice(0, 1) ?? [])].filter(Boolean) as string[];
  const thirdTags = isWoman
    ? [scan.brow_condition, scan.undereye].filter(Boolean) as string[]
    : [scan.beard_condition ?? scan.beard_density].filter(Boolean) as string[];

  return (
    <View style={s.screen}>
      <StatusBar style="light" />

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
        <Text style={s.title}>Your{'\n'}recommendations</Text>
        <Text style={s.subtitle}>Show this to your stylist</Text>

        <CategoryCard
          iconChar="≈"
          iconBg="#2A2010"
          iconColor={Colors.gold}
          title="Hair"
          subtitle="Style · Care routine · Products"
          tags={hairTags}
          onPress={() => goDetail('/hair-detail')}
        />
        <CategoryCard
          iconChar="◯"
          iconBg="#10182A"
          iconColor="#7EB8F7"
          title="Skin"
          subtitle="Analysis · Daily routine · Products"
          tags={skinTags}
          onPress={() => goDetail('/skin-detail')}
        />
        {isWoman ? (
          <CategoryCard
            iconChar="✦"
            iconBg="#1A1020"
            iconColor="#C47FD4"
            title="Makeup"
            subtitle="Features · Technique · Products"
            tags={thirdTags}
            onPress={() => goDetail('/makeup-detail')}
          />
        ) : (
          <CategoryCard
            iconChar="≡"
            iconBg="#1A2010"
            iconColor="#6BCB77"
            title="Beard"
            subtitle="Shape · Grooming routine · Products"
            tags={thirdTags}
            onPress={() => goDetail('/beard-detail')}
          />
        )}

        <View style={{ height: Spacing.xxxl }} />
      </Animated.ScrollView>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CategoryCard({ iconChar, iconBg, iconColor, title, subtitle, tags, onPress }: {
  iconChar: string; iconBg: string; iconColor: string;
  title: string; subtitle: string; tags: string[]; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      <View style={s.cardRow}>
        <View style={[s.iconBox, { backgroundColor: iconBg }]}>
          <Text style={[s.iconChar, { color: iconColor }]}>{iconChar}</Text>
        </View>
        <View style={s.cardMid}>
          <Text style={s.cardTitle}>{title}</Text>
          <Text style={s.cardSub}>{subtitle}</Text>
        </View>
        <Text style={s.cardArrow}>›</Text>
      </View>
      {tags.length > 0 && (
        <View style={s.tagRow}>
          {tags.map(tag => (
            <View key={tag} style={s.tag}>
              <Text style={s.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: Colors.background },
  center:    { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: Colors.textSecondary, fontSize: Typography.size.base },
  linkText:  { color: Colors.gold, fontSize: Typography.size.base },

  topBar:    { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs },
  backArrow: { fontSize: 32, color: Colors.gold, lineHeight: 40 },

  scroll:   { flex: 1 },
  content:  { paddingHorizontal: Spacing.lg },

  title:    { fontFamily: Typography.serif, fontSize: 22, color: Colors.cream, lineHeight: 30, marginBottom: Spacing.xs },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.xl },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  cardRow:   { flexDirection: 'row', alignItems: 'center' },
  iconBox:   { width: 48, height: 48, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  iconChar:  { fontSize: 22 },
  cardMid:   { flex: 1 },
  cardTitle: { fontSize: 15, color: Colors.cream, marginBottom: 2 },
  cardSub:   { fontSize: 13, color: Colors.textSecondary },
  cardArrow: { fontSize: 22, color: Colors.textTertiary, lineHeight: 28 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm, paddingLeft: 60 },
  tag:    { backgroundColor: Colors.goldDim, borderRadius: Radius.pill, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  tagText:{ fontSize: Typography.size.xs, color: Colors.gold, textTransform: 'capitalize' },

});
