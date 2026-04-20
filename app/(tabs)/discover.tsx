// Discover tab — Find nearby salons + recent ratings.

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

const LATEST_SCAN_KEY = '@lume/latest_scan';

function getSalonSuggestion(
  concerns: string[]
): { service: string; reason: string } | null {
  if (concerns.includes('acne'))
    return {
      service: 'facial or extraction',
      reason: 'Your scan detected acne — a professional facial can help with deep cleansing.',
    };
  if (concerns.includes('dark_circles') || concerns.includes('hyperpigmentation'))
    return {
      service: 'brightening or eye treatment',
      reason: 'Your scan detected pigmentation concerns — a professional treatment can complement your home routine.',
    };
  if (concerns.includes('dryness') || concerns.includes('dehydration'))
    return {
      service: 'hydrating facial',
      reason: 'Your scan detected dehydration — a hydrating treatment helps restore your skin barrier.',
    };
  if (concerns.includes('oiliness'))
    return {
      service: 'deep cleansing facial',
      reason: 'Your scan detected oiliness — a professional deep cleanse complements your daily routine.',
    };
  if (concerns.includes('uneven_texture'))
    return {
      service: 'exfoliation or peel',
      reason: 'Your scan detected uneven texture — a professional exfoliation can accelerate improvement.',
    };
  return null;
}

interface RecentRating {
  id:             string;
  salon_name:     string;
  rating_overall: number | null;
  created_at:     string;
}

function daysAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function MiniStars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  const filled = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={{ fontSize: 13, color: n <= filled ? Colors.accent : Colors.border }}>★</Text>
      ))}
    </View>
  );
}

export default function DiscoverScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const [recent,       setRecent]       = useState<RecentRating[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [scanConcerns, setScanConcerns] = useState<string[]>([]);
  const [scanLoaded,   setScanLoaded]   = useState(false);

  const loadRecent = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('salon_ratings')
        .select('id, salon_name, rating_overall, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);
      setRecent((data as RecentRating[]) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  useEffect(() => {
    AsyncStorage.getItem(LATEST_SCAN_KEY)
      .then(raw => {
        if (!raw) return;
        const scan = JSON.parse(raw);
        const concerns = (scan?.skin_concerns ?? []) as string[];
        setScanConcerns(concerns);
      })
      .catch(() => {})
      .finally(() => setScanLoaded(true));
  }, []);

  const onRefresh = () => { setRefreshing(true); loadRecent(); };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
      >
        <View style={s.header}>
          <Text style={s.title}>Discover</Text>
          <Text style={s.subtitle}>Find salons near you</Text>
        </View>

        {scanLoaded && (() => {
          const suggestion = getSalonSuggestion(scanConcerns);
          if (!suggestion) return null;
          return (
            <View style={s.suggestionCard}>
              <Text style={s.suggestionLabel}>BASED ON YOUR SCAN</Text>
              <Text style={s.suggestionService}>{suggestion.service}</Text>
              <Text style={s.suggestionReason}>{suggestion.reason}</Text>
              <Text style={s.suggestionCta}>Find salons offering this →</Text>
            </View>
          );
        })()}

        <TouchableOpacity
          style={s.actionCard}
          onPress={() => router.push('/salons/nearby')}
          activeOpacity={0.8}
        >
          <View style={s.actionIconBox}>
            <Text style={s.actionIcon}>◎</Text>
          </View>
          <View style={s.actionText}>
            <Text style={s.actionTitle}>Find nearby salons</Text>
            <Text style={s.actionSubtitle}>Browse salons and view Lumé profiles</Text>
          </View>
          <Text style={s.actionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.actionCard}
          onPress={() => router.push('/salons/rate-salon' as never)}
          activeOpacity={0.8}
        >
          <View style={s.actionIconBox}>
            <Text style={s.actionIcon}>★</Text>
          </View>
          <View style={s.actionText}>
            <Text style={s.actionTitle}>Rate a salon</Text>
            <Text style={s.actionSubtitle}>Help the community find the best salons</Text>
          </View>
          <Text style={s.actionArrow}>›</Text>
        </TouchableOpacity>

        <Text style={s.sectionLabel}>YOUR RECENT RATINGS</Text>

        {loading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.lg }} />
        ) : recent.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>Rate a salon after your next visit.</Text>
          </View>
        ) : (
          recent.map(r => (
            <View key={r.id} style={s.ratingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.ratingName} numberOfLines={1}>{r.salon_name}</Text>
                <Text style={s.ratingDate}>{daysAgo(r.created_at)}</Text>
              </View>
              <MiniStars rating={r.rating_overall} />
            </View>
          ))
        )}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg },

  header:   { paddingTop: Spacing.md, paddingBottom: Spacing.xl },
  title:    { fontFamily: Typography.serif, fontSize: 22, color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.text2, marginTop: 4 },

  suggestionCard: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    padding:         14,
    marginBottom:    16,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  suggestionLabel: {
    fontSize:       9,
    color:          Colors.text2,
    letterSpacing:  1.3,
    textTransform:  'uppercase',
    marginBottom:   6,
  },
  suggestionService: {
    fontFamily:    'Georgia',
    fontSize:      16,
    color:         Colors.text,
    marginBottom:  4,
    textTransform: 'capitalize',
  },
  suggestionReason: {
    fontSize:     12,
    color:        Colors.text2,
    lineHeight:   18,
    marginBottom: 10,
  },
  suggestionCta: {
    fontSize:   12,
    color:      Colors.accent,
    fontWeight: '500',
  },

  actionCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    marginBottom:    Spacing.sm,
  },
  actionIconBox: {
    width:           44,
    height:          44,
    borderRadius:    Radius.icon,
    backgroundColor: Colors.surface2,
    alignItems:      'center',
    justifyContent:  'center',
    marginRight:     Spacing.md,
  },
  actionIcon:    { fontSize: 18, color: Colors.accent },
  actionText:    { flex: 1 },
  actionTitle:   { fontSize: 15, color: Colors.text, fontWeight: '600', marginBottom: 2 },
  actionSubtitle:{ fontSize: 13, color: Colors.text2 },
  actionArrow:   { fontSize: 22, color: Colors.text3, lineHeight: 28 },

  sectionLabel: {
    fontSize:       10,
    color:          Colors.text,
    letterSpacing:  1.5,
    textTransform:  'uppercase',
    marginTop:      Spacing.xl,
    marginBottom:   Spacing.sm,
  },

  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.lg,
    alignItems:      'center',
  },
  emptyText: { fontSize: 13, color: Colors.text3 },

  ratingRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    marginBottom:    Spacing.xs,
  },
  ratingName: { fontSize: 15, color: Colors.text, fontWeight: '600', marginBottom: 2 },
  ratingDate: { fontSize: 13, color: Colors.text2 },

});
