// History tab — Scans section (timeline) + Routine section (daily checklist)

import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { getTierLabel, getTierFromScore, getCategoryDiamonds } from '../../constants/tiers';
import type { Scan } from '../../types';

// ── Types ──────────────────────────────────────────────────────────────────
type RoutineStep = { id: string; label: string; time: 'Morning' | 'Evening' };
type StreakData  = { current: number; best: number; lastDate: string };

// ── Routine AsyncStorage keys ──────────────────────────────────────────────
const ROUTINE_LOG_KEY    = '@lume/routine_log';
const ROUTINE_STEPS_KEY  = '@lume/routine_steps';
const ROUTINE_STREAK_KEY = '@lume/routine_streak';

const DEFAULT_STEPS: RoutineStep[] = [
  { id: 'morning_1', label: 'Gentle cleanser',  time: 'Morning' },
  { id: 'morning_2', label: 'Moisturiser',       time: 'Morning' },
  { id: 'morning_3', label: 'SPF 30+',           time: 'Morning' },
  { id: 'evening_1', label: 'Cleanser',          time: 'Evening' },
  { id: 'evening_2', label: 'Night moisturiser', time: 'Evening' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function isYesterday(dateStr: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateStr === yesterday.toISOString().slice(0, 10);
}

// ── Diamonds ──────────────────────────────────────────────────────────────
function Diamonds({ count, total = 3 }: { count: number; total?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 8,
            height: 8,
            backgroundColor: i < count ? '#C9A84C' : '#2A2420',
            borderRadius: 2,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router  = useRouter();
  const [tab, setTab] = useState<'scans' | 'routine'>('scans');

  // Scans
  const [scans,        setScans]        = useState<Scan[]>([]);
  const [loadingScans, setLoadingScans] = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [gender,       setGender]       = useState<string>('man');
  const [isGuest,      setIsGuest]      = useState(false);

  // Routine
  const [routineSteps, setRoutineSteps] = useState<RoutineStep[]>(DEFAULT_STEPS);
  const [routineLog,   setRoutineLog]   = useState<Record<string, string[]>>({});
  const [streakData,   setStreakData]   = useState<StreakData>({ current: 0, best: 0, lastDate: '' });

  // ── Fetch scans ───────────────────────────────────────────────────────────
  const fetchScans = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      setIsGuest(false);
      // Get gender from Supabase profile
      const { data: profile } = await supabase
        .from('users')
        .select('gender')
        .eq('id', user.id)
        .single();
      if (profile?.gender) setGender(profile.gender as string);

      const { data: scansData, error } = await supabase
        .from('scans')
        .select('id, score_overall, tier_label, face_shape, hair_texture, hair_condition, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[history] Error fetching scans:', error.message);
      } else {
        setScans(scansData ?? []);
      }
    } else {
      setIsGuest(true);
      // Fall back to gender from AsyncStorage for guest
      const profileStr = await AsyncStorage.getItem('@lume/guest_profile');
      const guestProfile = profileStr ? JSON.parse(profileStr) as { gender?: string } : { gender: 'man' };
      if (guestProfile.gender) setGender(guestProfile.gender);
      setScans([]);
    }

    setLoadingScans(false);
    setRefreshing(false);
  }, []);

  // ── Load routine state ────────────────────────────────────────────────────
  const loadRoutine = useCallback(async () => {
    // Load steps (or persist defaults)
    const stepsRaw = await AsyncStorage.getItem(ROUTINE_STEPS_KEY);
    const steps: RoutineStep[] = stepsRaw
      ? JSON.parse(stepsRaw) as RoutineStep[]
      : DEFAULT_STEPS;
    if (!stepsRaw) {
      await AsyncStorage.setItem(ROUTINE_STEPS_KEY, JSON.stringify(DEFAULT_STEPS));
    }
    setRoutineSteps(steps);

    // Load full log
    const logRaw = await AsyncStorage.getItem(ROUTINE_LOG_KEY);
    const log: Record<string, string[]> = logRaw
      ? JSON.parse(logRaw) as Record<string, string[]>
      : {};
    setRoutineLog(log);

    // Load streak
    const streakRaw = await AsyncStorage.getItem(ROUTINE_STREAK_KEY);
    const streak: StreakData = streakRaw
      ? JSON.parse(streakRaw) as StreakData
      : { current: 0, best: 0, lastDate: '' };
    setStreakData(streak);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchScans();
      loadRoutine();
    }, [fetchScans, loadRoutine]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchScans();
    loadRoutine();
  };

  const toggleStep = async (stepId: string) => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayDone = [...(routineLog[todayKey] ?? [])];
    const idx = todayDone.indexOf(stepId);
    const adding = idx < 0;

    if (adding) {
      todayDone.push(stepId);
    } else {
      todayDone.splice(idx, 1);
    }

    const newLog = { ...routineLog, [todayKey]: todayDone };
    setRoutineLog(newLog);
    await AsyncStorage.setItem(ROUTINE_LOG_KEY, JSON.stringify(newLog));

    // Update streak only when checking (not unchecking) and lastDate ≠ today
    if (adding && streakData.lastDate !== todayKey) {
      const next: StreakData = { ...streakData };
      if (isYesterday(next.lastDate)) {
        next.current += 1;
        next.best = Math.max(next.current, next.best);
      } else {
        next.current = 1;
        next.best = Math.max(1, next.best);
      }
      next.lastDate = todayKey;
      setStreakData(next);
      await AsyncStorage.setItem(ROUTINE_STREAK_KEY, JSON.stringify(next));
    }
  };

  // ── Scans section ─────────────────────────────────────────────────────────
  const ScansSection = () => {
    if (loadingScans) {
      return <ActivityIndicator color={Colors.gold} style={{ marginTop: Spacing.xxl }} />;
    }
    if (scans.length === 0) {
      return isGuest ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyTitle}>No scan history</Text>
          <Text style={s.emptyBody}>Sign in to save and view your scan history</Text>
          <TouchableOpacity
            style={s.emptyBtn}
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.85}
          >
            <Text style={s.emptyBtnText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.emptyBox}>
          <Text style={s.emptyTitle}>No scans yet</Text>
          <Text style={s.emptyBody}>Head to the Scan tab to get your first grooming score.</Text>
        </View>
      );
    }

    const latest    = scans[0]; // newest first
    const latestTier = getTierFromScore(latest.score_overall ?? 0);

    return (
      <>
        {/* Progress card */}
        <View style={s.progressCard}>
          <Text style={s.progressLabel}>GROOMING PROFILE</Text>
          <View style={s.progressRow}>
            <View style={s.progressStat}>
              <Text style={s.progressTier}>{latestTier.name}</Text>
              <View style={{ marginTop: 6 }}>
                <Diamonds count={latestTier.diamonds} />
              </View>
              <Text style={s.progressCaption}>Current tier</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.progressStat}>
              <Text style={s.progressNum}>{scans.length}</Text>
              <Text style={s.progressCaption}>Total scans</Text>
            </View>
          </View>
        </View>

        {/* Scan timeline (newest first) */}
        {scans.map((scan, i) => {
          const tier    = getTierFromScore(scan.score_overall ?? 0);
          const date    = new Date(scan.created_at ?? '');
          const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          const pills   = [
            scan.face_shape   && `${scan.face_shape} face`,
            scan.hair_texture && `${scan.hair_texture} hair`,
          ].filter(Boolean) as string[];
          return (
            <View key={scan.id} style={s.scanRow}>
              <View style={s.scanDotCol}>
                <View style={[s.scanDot, i === 0 && s.scanDotActive]} />
                {i < scans.length - 1 && <View style={s.scanLine} />}
              </View>
              <View style={s.scanCard}>
                <View style={s.scanCardTop}>
                  <View style={s.scanBadge}>
                    <Text style={s.scanBadgeText}>{scan.tier_label ?? tier.name}</Text>
                  </View>
                  <Diamonds count={tier.diamonds} />
                  <Text style={s.scanDate}>{dateStr}</Text>
                </View>
                {pills.length > 0 && (
                  <View style={s.scanPills}>
                    {pills.map(p => (
                      <View key={p} style={s.scanPill}>
                        <Text style={s.scanPillText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </>
    );
  };

  // ── Routine section ───────────────────────────────────────────────────────
  const RoutineSection = () => {
    if (isGuest) {
      return (
        <View style={s.emptyBox}>
          <Text style={s.emptyTitle}>Sign in to track your routine</Text>
          <Text style={s.emptyBody}>Build streaks and track your grooming consistency</Text>
          <TouchableOpacity
            style={s.emptyBtn}
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.85}
          >
            <Text style={s.emptyBtnText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const todayKey   = new Date().toISOString().slice(0, 10);
    const todayDone  = new Set<string>(routineLog[todayKey] ?? []);
    const total      = routineSteps.length;
    const completed  = todayDone.size;
    const pct        = total > 0 ? Math.round((completed / total) * 100) : 0;

    return (
      <>
        {/* Streak card */}
        <View style={s.streakCard}>
          <View style={s.streakLeft}>
            <Text style={s.streakEmoji}>🔥</Text>
            <Text style={s.streakNum}>{streakData.current}</Text>
            <Text style={s.streakLabel}>day streak</Text>
          </View>
          <View style={s.streakRight}>
            <Text style={s.streakBest}>Best: {streakData.best} days</Text>
            <Text style={s.streakToday}>{completed}/{total} today</Text>
            <View style={s.streakBar}>
              <View style={[s.streakFill, { width: `${pct}%` as any }]} />
            </View>
          </View>
        </View>

        {/* Morning + Evening checklists */}
        {(['Morning', 'Evening'] as const).map(period => (
          <View key={period} style={s.periodBlock}>
            <Text style={s.periodLabel}>{period.toUpperCase()} ROUTINE</Text>
            {routineSteps.filter(r => r.time === period).map(step => {
              const done = todayDone.has(step.id);
              return (
                <TouchableOpacity
                  key={step.id}
                  style={[s.stepRow, done && s.stepRowDone]}
                  onPress={() => toggleStep(step.id)}
                  activeOpacity={0.75}
                >
                  <View style={[s.checkbox, done && s.checkboxDone]}>
                    {done && <Text style={s.checkmark}>✓</Text>}
                  </View>
                  <Text style={[s.stepLabel, done && s.stepLabelDone]}>{step.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </>
    );
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>History</Text>
      </View>

      {/* Toggle pills */}
      <View style={s.pillsRow}>
        {(['scans', 'routine'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.pill, tab === t && s.pillActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[s.pillText, tab === t && s.pillTextActive]}>
              {t === 'scans' ? 'Scans' : 'Routine'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.gold}
          />
        }
      >
        {tab === 'scans' ? <ScansSection /> : <RoutineSection />}
        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: Colors.background },
  header:  { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  headerTitle: { fontFamily: Typography.serif, fontSize: Typography.size.xxl, color: Colors.cream },
  content: { paddingHorizontal: Spacing.lg },

  pillsRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
  },
  pill:          { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.pill, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  pillActive:    { backgroundColor: Colors.gold, borderColor: Colors.gold },
  pillText:      { fontSize: Typography.size.sm, color: Colors.textSecondary, fontWeight: '600' },
  pillTextActive:{ color: Colors.background },

  emptyBox:     { alignItems: 'center', paddingTop: Spacing.xxxl },
  emptyTitle:   { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream, marginBottom: Spacing.sm },
  emptyBody:    { fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  emptyBtn:     { backgroundColor: Colors.gold, borderRadius: Radius.input, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xxl, alignItems: 'center' },
  emptyBtnText: { fontSize: Typography.size.md, fontWeight: '600', color: Colors.background },

  // Progress card
  progressCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, marginBottom: Spacing.lg,
  },
  progressLabel:   { fontSize: Typography.size.xs, color: Colors.gold, letterSpacing: 6, textTransform: 'uppercase', marginBottom: Spacing.md },
  progressRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  progressStat:    { alignItems: 'center' },
  progressTier:    { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream },
  progressNum:     { fontFamily: Typography.serif, fontSize: Typography.size.xxl, color: Colors.cream },
  progressCaption: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 6 },
  statDivider:     { width: 1, height: 40, backgroundColor: Colors.border },

  // Timeline
  scanRow:    { flexDirection: 'row', marginBottom: Spacing.md },
  scanDotCol: { alignItems: 'center', marginRight: Spacing.md, paddingTop: 6 },
  scanDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  scanDotActive: { backgroundColor: Colors.gold },
  scanLine:   { flex: 1, width: 1, backgroundColor: Colors.border, marginTop: 4 },
  scanCard:   { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  scanCardTop:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  scanBadge:  { backgroundColor: Colors.goldDim, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  scanBadgeText: { fontSize: Typography.size.xs, color: Colors.gold, fontWeight: '600' },
  scanDate:   { marginLeft: 'auto', fontSize: Typography.size.xs, color: Colors.textSecondary },
  scanPills:  { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.xs },
  scanPill:   { backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  scanPillText: { fontSize: 10, color: Colors.textSecondary, textTransform: 'capitalize' },

  // Streak card
  streakCard: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.lg, alignItems: 'center',
  },
  streakLeft:  { marginRight: Spacing.xl, alignItems: 'center' },
  streakEmoji: { fontSize: 24, marginBottom: 2 },
  streakNum:   { fontFamily: Typography.serif, fontSize: 40, color: Colors.gold, lineHeight: 44 },
  streakLabel: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  streakRight: { flex: 1 },
  streakBest:  { fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing.xs },
  streakToday: { fontSize: Typography.size.base, color: Colors.cream, marginBottom: Spacing.xs },
  streakBar:   { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  streakFill:  { height: 4, backgroundColor: Colors.gold, borderRadius: 2 },

  // Routine checklist
  periodBlock: { marginBottom: Spacing.lg },
  periodLabel: { fontSize: Typography.size.xs, color: Colors.gold, letterSpacing: 6, textTransform: 'uppercase', marginBottom: Spacing.sm },
  stepRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.xs },
  stepRowDone: { borderColor: Colors.gold + '66' },
  checkbox:    { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  checkboxDone:{ backgroundColor: Colors.gold, borderColor: Colors.gold },
  checkmark:   { fontSize: 12, color: Colors.background, fontWeight: '700' },
  stepLabel:   { fontSize: Typography.size.base, color: Colors.cream },
  stepLabelDone: { color: Colors.textSecondary },
});
