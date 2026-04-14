// Discover tab — Find nearby salons + recent ratings.

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

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
        <Text key={n} style={{ fontSize: 12, color: n <= filled ? '#C9A84C' : Colors.border }}>★</Text>
      ))}
    </View>
  );
}

export default function DiscoverScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const [recent,     setRecent]     = useState<RecentRating[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = () => { setRefreshing(true); loadRecent(); };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A84C" />
        }
      >
        <View style={s.header}>
          <Text style={s.title}>Discover</Text>
          <Text style={s.subtitle}>Find salons near you</Text>
        </View>

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

        <Text style={s.sectionLabel}>YOUR RECENT RATINGS</Text>

        {loading ? (
          <ActivityIndicator color="#C9A84C" style={{ marginTop: Spacing.lg }} />
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
  screen:  { flex: 1, backgroundColor: '#0A0A0A' },
  content: { paddingHorizontal: Spacing.lg },

  header:   { paddingTop: Spacing.md, paddingBottom: Spacing.xl },
  title:    { fontFamily: Typography.serif, fontSize: Typography.size.xxxl, color: '#F5F0E8' },
  subtitle: { fontSize: Typography.size.base, color: Colors.textSecondary, marginTop: 4 },

  actionCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#1A1412',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#2A2420',
    padding:         Spacing.md,
    marginBottom:    Spacing.sm,
  },
  actionIconBox: {
    width:           44,
    height:          44,
    borderRadius:    Radius.icon,
    backgroundColor: '#2A2010',
    alignItems:      'center',
    justifyContent:  'center',
    marginRight:     Spacing.md,
  },
  actionIcon:    { fontSize: 20, color: '#C9A84C' },
  actionText:    { flex: 1 },
  actionTitle:   { fontSize: Typography.size.md, color: '#F5F0E8', fontWeight: '600', marginBottom: 2 },
  actionSubtitle:{ fontSize: Typography.size.sm, color: Colors.textSecondary },
  actionArrow:   { fontSize: 24, color: Colors.textTertiary, lineHeight: 28 },

  sectionLabel: {
    fontSize:       Typography.size.xs,
    color:          '#C9A84C',
    letterSpacing:  6,
    textTransform:  'uppercase',
    marginTop:      Spacing.xl,
    marginBottom:   Spacing.sm,
  },

  emptyCard: {
    backgroundColor: '#1A1412',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#2A2420',
    padding:         Spacing.lg,
    alignItems:      'center',
  },
  emptyText: { fontSize: Typography.size.base, color: Colors.textTertiary },

  ratingRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#1A1412',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#2A2420',
    padding:         Spacing.md,
    marginBottom:    Spacing.xs,
  },
  ratingName: { fontSize: Typography.size.base, color: '#F5F0E8', fontWeight: '600', marginBottom: 2 },
  ratingDate: { fontSize: Typography.size.sm, color: Colors.textSecondary },
});
