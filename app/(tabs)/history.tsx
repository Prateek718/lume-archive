// History tab — Scans section (timeline + line chart) + Routine section (daily checklist)

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Polyline, Circle as SvgCircle, Line, Text as SvgText } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { getTierLabel } from '../../constants/tiers';
import type { Scan } from '../../types';

// ── Routine steps — shown as a daily checklist ────────────────────────────
const ROUTINE_STEPS = [
  { id: 'cleanse_am',  label: 'Cleanse',        time: 'AM' },
  { id: 'moisturise',  label: 'Moisturise',      time: 'AM' },
  { id: 'spf',         label: 'SPF 30+',         time: 'AM' },
  { id: 'cleanse_pm',  label: 'Cleanse',         time: 'PM' },
  { id: 'serum',       label: 'Serum / treatment',time: 'PM' },
  { id: 'night_cream', label: 'Night cream',     time: 'PM' },
];

// Key: YYYY-MM-DD — value: JSON array of completed step IDs
function todayKey() {
  return `routine_${new Date().toISOString().slice(0, 10)}`;
}

// ── Mini line chart ───────────────────────────────────────────────────────
function LineChart({ scans }: { scans: Scan[] }) {
  if (scans.length < 2) return null;

  const W = 320, H = 100, PAD = 12;
  const scores = scans.map(s => s.score_overall ?? 0);
  const minY = Math.max(0,  Math.min(...scores) - 10);
  const maxY = Math.min(100, Math.max(...scores) + 10);

  const px = (i: number) => PAD + (i / (scans.length - 1)) * (W - PAD * 2);
  const py = (v: number) => PAD + ((maxY - v) / (maxY - minY)) * (H - PAD * 2);

  const points = scans.map((s, i) => `${px(i)},${py(s.score_overall ?? 0)}`).join(' ');

  return (
    <Svg width={W} height={H} style={s.chart}>
      {/* Baseline */}
      <Line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={Colors.border} strokeWidth={1} />
      {/* Line */}
      <Polyline points={points} fill="none" stroke={Colors.gold} strokeWidth={2} />
      {/* Dots */}
      {scans.map((sc, i) => (
        <SvgCircle
          key={sc.id}
          cx={px(i)} cy={py(sc.score_overall ?? 0)}
          r={3} fill={Colors.gold}
        />
      ))}
      {/* First & last score labels */}
      <SvgText x={px(0)} y={py(scores[0]) - 6} fill={Colors.textSecondary} fontSize={10} textAnchor="middle">
        {scores[0]}
      </SvgText>
      <SvgText x={px(scans.length - 1)} y={py(scores[scores.length - 1]) - 6} fill={Colors.cream} fontSize={10} textAnchor="middle">
        {scores[scores.length - 1]}
      </SvgText>
    </Svg>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'scans' | 'routine'>('scans');

  // Scans
  const [scans, setScans]       = useState<Scan[]>([]);
  const [loadingScans, setLoadingScans] = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [gender, setGender]     = useState<string>('man');

  // Routine
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [streak,  setStreak]  = useState(0);

  // ── Load gender from guest profile ───────────────────────────────────────
  useEffect(() => {
    const loadGender = async () => {
      const profileStr = await AsyncStorage.getItem('@lume/guest_profile');
      const profile = profileStr ? JSON.parse(profileStr) as { gender?: string } : { gender: 'man' };
      if (profile.gender) setGender(profile.gender);
    };
    loadGender();
  }, []);

  // ── Fetch scans ───────────────────────────────────────────────────────────
  const fetchScans = useCallback(async () => {
    const profileStr = await AsyncStorage.getItem('@lume/guest_profile');
    const profile = profileStr ? JSON.parse(profileStr) as { id: string } : { id: 'guest' };
    const userId = profile.id;
    const { data } = await supabase
      .from('scans')
      .select('id, score_overall, score_hair, score_skin, score_beard, score_makeup, tier_label, face_shape, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    setScans((data as Scan[]) ?? []);
    setLoadingScans(false);
    setRefreshing(false);
  }, []);

  // ── Load routine state ────────────────────────────────────────────────────
  const loadRoutine = useCallback(async () => {
    const raw = await AsyncStorage.getItem(todayKey());
    const done: string[] = raw ? JSON.parse(raw) : [];
    setChecked(new Set(done));
    // Streak: count consecutive past days with all 6 steps complete
    let s = 0;
    const today = new Date();
    for (let d = 1; d <= 30; d++) {
      const day = new Date(today);
      day.setDate(today.getDate() - d);
      const key = `routine_${day.toISOString().slice(0, 10)}`;
      const val = await AsyncStorage.getItem(key);
      const dayDone: string[] = val ? JSON.parse(val) : [];
      if (dayDone.length === ROUTINE_STEPS.length) { s++; } else { break; }
    }
    setStreak(s);
  }, []);

  useEffect(() => { fetchScans(); loadRoutine(); }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchScans();
    loadRoutine();
  };

  const toggleStep = async (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    setChecked(next);
    await AsyncStorage.setItem(todayKey(), JSON.stringify([...next]));
  };

  // ── Scans section ─────────────────────────────────────────────────────────
  const ScansSection = () => {
    if (loadingScans) {
      return <ActivityIndicator color={Colors.gold} style={{ marginTop: Spacing.xxl }} />;
    }
    if (scans.length === 0) {
      return (
        <View style={s.emptyBox}>
          <Text style={s.emptyTitle}>No scans yet</Text>
          <Text style={s.emptyBody}>Head to the Scan tab to get your first grooming score.</Text>
        </View>
      );
    }

    const latest = scans[scans.length - 1];
    const first  = scans[0];
    const improvement = (latest.score_overall ?? 0) - (first.score_overall ?? 0);

    return (
      <>
        {/* Progress card */}
        <View style={s.progressCard}>
          <Text style={s.progressLabel}>OVERALL PROGRESS</Text>
          <View style={s.progressRow}>
            <View style={s.progressStat}>
              <Text style={s.progressNum}>{latest.score_overall ?? '–'}</Text>
              <Text style={s.progressCaption}>Current score</Text>
            </View>
            {scans.length > 1 && (
              <View style={s.progressStat}>
                <Text style={[s.progressNum, { color: improvement >= 0 ? Colors.gold : '#A32D2D' }]}>
                  {improvement >= 0 ? '+' : ''}{improvement}
                </Text>
                <Text style={s.progressCaption}>Since first scan</Text>
              </View>
            )}
            <View style={s.progressStat}>
              <Text style={s.progressNum}>{scans.length}</Text>
              <Text style={s.progressCaption}>Total scans</Text>
            </View>
          </View>
          <LineChart scans={scans} />
        </View>

        {/* Scan timeline (newest first) */}
        {[...scans].reverse().map((scan, i) => {
          const date = new Date(scan.created_at ?? '');
          const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          return (
            <View key={scan.id} style={s.scanRow}>
              <View style={s.scanDotCol}>
                <View style={[s.scanDot, i === 0 && s.scanDotActive]} />
                {i < scans.length - 1 && <View style={s.scanLine} />}
              </View>
              <View style={s.scanCard}>
                <View style={s.scanCardTop}>
                  <Text style={s.scanScore}>{scan.score_overall ?? '–'}</Text>
                  <View style={s.scanBadge}>
                    <Text style={s.scanBadgeText}>{scan.tier_label ?? getTierLabel(scan.score_overall ?? 0)}</Text>
                  </View>
                  <Text style={s.scanDate}>{dateStr}</Text>
                </View>
                <View style={s.scanSubScores}>
                  <Text style={s.scanSub}>Hair {scan.score_hair ?? '–'}</Text>
                  <Text style={s.scanSubDot}>·</Text>
                  <Text style={s.scanSub}>Skin {scan.score_skin ?? '–'}</Text>
                  {gender === 'woman' ? (
                    <>
                      <Text style={s.scanSubDot}>·</Text>
                      <Text style={s.scanSub}>Makeup {scan.score_makeup ?? '–'}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={s.scanSubDot}>·</Text>
                      <Text style={s.scanSub}>Beard {scan.score_beard ?? '–'}</Text>
                    </>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </>
    );
  };

  // ── Routine section ───────────────────────────────────────────────────────
  const RoutineSection = () => {
    const completedToday = checked.size;
    const total = ROUTINE_STEPS.length;
    const pct = Math.round((completedToday / total) * 100);

    return (
      <>
        <View style={s.streakCard}>
          <View style={s.streakLeft}>
            <Text style={s.streakNum}>{streak}</Text>
            <Text style={s.streakLabel}>day streak</Text>
          </View>
          <View style={s.streakRight}>
            <Text style={s.streakToday}>{completedToday}/{total} today</Text>
            <View style={s.streakBar}>
              <View style={[s.streakFill, { width: `${pct}%` as any }]} />
            </View>
          </View>
        </View>

        {(['AM', 'PM'] as const).map(period => (
          <View key={period} style={s.periodBlock}>
            <Text style={s.periodLabel}>{period} ROUTINE</Text>
            {ROUTINE_STEPS.filter(r => r.time === period).map(step => {
              const done = checked.has(step.id);
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

  emptyBox:   { alignItems: 'center', paddingTop: Spacing.xxxl },
  emptyTitle: { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream, marginBottom: Spacing.sm },
  emptyBody:  { fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  // Progress card
  progressCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, marginBottom: Spacing.lg,
  },
  progressLabel:   { fontSize: Typography.size.xs, color: Colors.gold, letterSpacing: 6, textTransform: 'uppercase', marginBottom: Spacing.md },
  progressRow:     { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.md },
  progressStat:    { alignItems: 'center' },
  progressNum:     { fontFamily: Typography.serif, fontSize: Typography.size.xxl, color: Colors.cream },
  progressCaption: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
  chart:           { alignSelf: 'center' },

  // Timeline
  scanRow:    { flexDirection: 'row', marginBottom: Spacing.md },
  scanDotCol: { alignItems: 'center', marginRight: Spacing.md, paddingTop: 6 },
  scanDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  scanDotActive: { backgroundColor: Colors.gold },
  scanLine:   { flex: 1, width: 1, backgroundColor: Colors.border, marginTop: 4 },
  scanCard:   { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  scanCardTop:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  scanScore:  { fontFamily: Typography.serif, fontSize: Typography.size.xxl, color: Colors.cream },
  scanBadge:  { backgroundColor: Colors.goldDim, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  scanBadgeText: { fontSize: Typography.size.xs, color: Colors.gold, fontWeight: '600' },
  scanDate:   { marginLeft: 'auto', fontSize: Typography.size.xs, color: Colors.textSecondary },
  scanSubScores: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scanSub:    { fontSize: Typography.size.sm, color: Colors.textSecondary },
  scanSubDot: { fontSize: Typography.size.sm, color: Colors.textTertiary },

  // Streak card
  streakCard:  {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.lg, alignItems: 'center',
  },
  streakLeft:    { marginRight: Spacing.xl },
  streakNum:     { fontFamily: Typography.serif, fontSize: 40, color: Colors.gold },
  streakLabel:   { fontSize: Typography.size.sm, color: Colors.textSecondary },
  streakRight:   { flex: 1 },
  streakToday:   { fontSize: Typography.size.base, color: Colors.cream, marginBottom: Spacing.xs },
  streakBar:     { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  streakFill:    { height: 4, backgroundColor: Colors.gold, borderRadius: 2 },

  // Routine
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
