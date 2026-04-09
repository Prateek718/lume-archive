// Salons tab — home screen with three action cards and recent ratings.

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking,
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

function renderStars(rating: number | null) {
  if (!rating) return null;
  const filled = Math.round(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Text key={n} style={{ fontSize: 12, color: n <= filled ? Colors.gold : Colors.border }}>★</Text>
      ))}
    </View>
  );
}

export default function SalonsHomeScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const [recent, setRecent]       = useState<RecentRating[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecent = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('salon_ratings')
        .select('id, salon_name, rating_overall, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(2);
      setRecent((data as RecentRating[]) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadRecent(); }, []);

  const onRefresh = () => { setRefreshing(true); loadRecent(); };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Discover</Text>
          <Text style={s.subtitle}>Find salons and stylists near you</Text>
        </View>

        {/* Action cards */}
        <ActionCard
          icon="◎"
          iconBg="#2A2010"
          iconColor={Colors.gold}
          title="Find nearby salons"
          subtitle="Map and list of salons near you"
          onPress={() => router.push('/salons/nearby')}
        />
        <ActionCard
          icon="★"
          iconBg="#0D2010"
          iconColor="#6BCB77"
          title="Rate a salon"
          subtitle="Share your experience"
          onPress={() => router.push('/salons/rate-salon')}
        />
        {/* Coming soon */}
        <Text style={s.comingSoonLabel}>COMING SOON</Text>

        <TouchableOpacity
          style={[s.card, s.cardDisabled]}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={s.cardRow}>
            <View style={[s.iconBox, { backgroundColor: '#1A1020' }]}>
              <Text style={s.iconChar}>✂️</Text>
            </View>
            <View style={s.cardMid}>
              <Text style={s.cardTitle}>Find a stylist</Text>
              <Text style={s.cardSub}>Browse verified stylists near you</Text>
            </View>
            <View style={s.soonBadge}>
              <Text style={s.soonText}>SOON</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.card, s.cardDisabled]}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={s.cardRow}>
            <View style={[s.iconBox, { backgroundColor: '#10182A' }]}>
              <Text style={s.iconChar}>📅</Text>
            </View>
            <View style={s.cardMid}>
              <Text style={s.cardTitle}>Book an appointment</Text>
              <Text style={s.cardSub}>Schedule with your stylist</Text>
            </View>
            <View style={s.soonBadge}>
              <Text style={s.soonText}>SOON</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Stylist waitlist banner */}
        <View style={s.stylistBanner}>
          <Text style={s.stylistBannerTitle}>Are you a stylist?</Text>
          <Text style={s.stylistBannerSub}>
            Join our platform and connect with clients
          </Text>
          <TouchableOpacity
            style={s.stylistBannerBtn}
            onPress={() => Linking.openURL('https://getlume.app/stylists')}
            activeOpacity={0.85}
          >
            <Text style={s.stylistBannerBtnText}>Make your profile</Text>
          </TouchableOpacity>
        </View>

        {/* Recent ratings */}
        <Text style={s.sectionLabel}>YOUR RECENT RATINGS</Text>
        {loading ? (
          <ActivityIndicator color={Colors.gold} style={{ marginTop: Spacing.lg }} />
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
              {renderStars(r.rating_overall)}
            </View>
          ))
        )}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

function ActionCard({
  icon, iconBg, iconColor, title, subtitle, onPress,
}: {
  icon: string; iconBg: string; iconColor: string;
  title: string; subtitle: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.actionCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.actionIconBox, { backgroundColor: iconBg }]}>
        <Text style={[s.actionIcon, { color: iconColor }]}>{icon}</Text>
      </View>
      <View style={s.actionText}>
        <Text style={s.actionTitle}>{title}</Text>
        <Text style={s.actionSubtitle}>{subtitle}</Text>
      </View>
      <Text style={s.actionArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg },

  header:   { paddingTop: Spacing.md, paddingBottom: Spacing.xl },
  title:    { fontFamily: Typography.serif, fontSize: Typography.size.xxxl, color: Colors.cream },
  subtitle: { fontSize: Typography.size.base, color: Colors.textSecondary, marginTop: 4 },

  actionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  actionIconBox: { width: 44, height: 44, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  actionIcon:    { fontSize: 20 },
  actionText:    { flex: 1 },
  actionTitle:   { fontSize: Typography.size.md, color: Colors.cream, fontWeight: '600', marginBottom: 2 },
  actionSubtitle:{ fontSize: Typography.size.sm, color: Colors.textSecondary },
  actionArrow:   { fontSize: 24, color: Colors.textTertiary, lineHeight: 28 },

  sectionLabel: {
    fontSize: Typography.size.xs, color: Colors.gold,
    letterSpacing: 6, textTransform: 'uppercase',
    marginTop: Spacing.xl, marginBottom: Spacing.sm,
  },
  comingSoonLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 3,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  cardRow:  { flexDirection: 'row', alignItems: 'center' },
  iconBox:  { width: 44, height: 44, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  iconChar: { fontSize: 20 },
  cardMid:  { flex: 1 },
  cardTitle:{ fontSize: Typography.size.md, color: Colors.cream, fontWeight: '600', marginBottom: 2 },
  cardSub:  { fontSize: Typography.size.sm, color: Colors.textSecondary },
  cardDisabled: {
    opacity: 0.6,
    borderColor: 'rgba(201,168,76,0.2)',
  },
  soonBadge: {
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  soonText: {
    fontSize: 9,
    color: Colors.gold,
    letterSpacing: 1,
    fontWeight: '600',
  },
  stylistBanner: {
    backgroundColor: 'rgba(201,168,76,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.15)',
    borderRadius: Radius.card,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  stylistBannerTitle: {
    fontFamily: Typography.serif,
    fontSize: 16,
    color: Colors.cream,
    marginBottom: 4,
  },
  stylistBannerSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  stylistBannerBtn: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.input,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  stylistBannerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.background,
  },
  emptyCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, alignItems: 'center',
  },
  emptyText: { fontSize: Typography.size.base, color: Colors.textTertiary },

  ratingRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.xs,
  },
  ratingName: { fontSize: Typography.size.base, color: Colors.cream, fontWeight: '600', marginBottom: 2 },
  ratingDate: { fontSize: Typography.size.sm, color: Colors.textSecondary },
});
