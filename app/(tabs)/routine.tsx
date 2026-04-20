// Routine tab — daily grooming checklist with skin, hair, beard/makeup categories

import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { logRoutineStep } from '../../services/scanService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import type { HairProfile, HairRecommendations } from '../../types';
import { isBaldProfile } from '../../types';

// ── Types ─────────────────────────────────────────────────────────────────────
type RoutineStep = {
  id:       string;
  label:    string;
  product?: string;
  time:     'Morning' | 'Evening' | 'Hair' | 'Beard' | 'Makeup';
  level?:   'simple' | 'balanced' | 'full';
  order?:   number;
  washDay?: boolean;
};
type StreakData = { current: number; best: number; lastDate: string };
type Category  = 'skin' | 'hair' | 'scalp' | 'beard' | 'makeup';

// ── AsyncStorage keys ─────────────────────────────────────────────────────────
const ROUTINE_LOG_KEY    = '@lume/routine_log';
const ROUTINE_STREAK_KEY = '@lume/routine_streak';
const WASH_HISTORY_KEY   = '@lume/wash_history';

// ── Level ordering ────────────────────────────────────────────────────────────
const LEVEL_RANK: Record<string, number> = { simple: 1, balanced: 2, full: 3 };

// ── Defaults ──────────────────────────────────────────────────────────────────
const SKIN_DEFAULT: RoutineStep[] = [
  { id: 'morning_0', label: 'Cleanse',  product: 'Gel cleanser',          time: 'Morning', level: 'simple',   order: 1 },
  { id: 'morning_1', label: 'Tone',     product: 'Toner',                 time: 'Morning', level: 'balanced', order: 2 },
  { id: 'morning_2', label: 'Eye care', product: 'Eye cream',             time: 'Morning', level: 'full',     order: 3 },
  { id: 'morning_3', label: 'Brighten', product: 'Vitamin C serum',       time: 'Morning', level: 'balanced', order: 4 },
  { id: 'morning_4', label: 'Nourish',  product: 'Moisturiser',           time: 'Morning', level: 'simple',   order: 5 },
  { id: 'morning_5', label: 'Protect',  product: 'Sunscreen SPF 50',      time: 'Morning', level: 'simple',   order: 6 },
  { id: 'evening_0', label: 'Cleanse',  product: 'Gel cleanser',          time: 'Evening', level: 'simple',   order: 1 },
  { id: 'evening_1', label: 'Tone',     product: 'Toner',                 time: 'Evening', level: 'balanced', order: 2 },
  { id: 'evening_2', label: 'Eye care', product: 'Eye cream',             time: 'Evening', level: 'full',     order: 3 },
  { id: 'evening_3', label: 'Balance',  product: 'Niacinamide serum',     time: 'Evening', level: 'simple',   order: 4 },
  { id: 'evening_4', label: 'Nourish',  product: 'Moisturiser',           time: 'Evening', level: 'simple',   order: 5 },
  { id: 'evening_5', label: 'Renew',    product: 'Retinol · 2–3x/week',  time: 'Evening', level: 'full',     order: 6 },
];

const HAIR_DEFAULT: RoutineStep[] = [
  { id: 'hair_wash_0', label: 'Cleanse',   product: 'Shampoo',     time: 'Hair', level: 'simple',   order: 1, washDay: true  },
  { id: 'hair_wash_1', label: 'Condition', product: 'Conditioner', time: 'Hair', level: 'simple',   order: 2, washDay: true  },
  { id: 'hair_wash_2', label: 'Restore',   product: 'Hair mask',   time: 'Hair', level: 'full',     order: 3, washDay: true  },
  { id: 'hair_care_0', label: 'Nourish',   product: 'Hair oil',    time: 'Hair', level: 'balanced', order: 4, washDay: false },
  { id: 'hair_care_1', label: 'Smooth',    product: 'Hair serum',  time: 'Hair', level: 'full',     order: 5, washDay: false },
];

const SCALP_DEFAULT: RoutineStep[] = [
  { id: 'scalp_0', label: 'Cleanse',  product: 'Gentle scalp shampoo', time: 'Hair', level: 'simple',   order: 1 },
  { id: 'scalp_1', label: 'Hydrate',  product: 'Scalp moisturiser',    time: 'Hair', level: 'simple',   order: 2 },
  { id: 'scalp_2', label: 'Protect',  product: 'SPF 50 sunscreen',     time: 'Hair', level: 'balanced', order: 3 },
  { id: 'scalp_3', label: 'Treat',    product: 'Scalp serum',          time: 'Hair', level: 'full',     order: 4 },
];

const BEARD_DEFAULT: RoutineStep[] = [
  { id: 'beard_0', label: 'Cleanse', product: 'Beard wash', time: 'Beard', level: 'simple', order: 1 },
  { id: 'beard_1', label: 'Nourish', product: 'Beard oil',  time: 'Beard', level: 'simple', order: 2 },
  { id: 'beard_2', label: 'Shape',   product: 'Beard balm', time: 'Beard', level: 'simple', order: 3 },
];

const MAKEUP_DEFAULT: RoutineStep[] = [
  { id: 'makeup_0', label: 'Prep',    product: 'Primer',      time: 'Makeup', level: 'simple',   order: 1 },
  { id: 'makeup_1', label: 'Even',    product: 'Foundation',  time: 'Makeup', level: 'simple',   order: 2 },
  { id: 'makeup_2', label: 'Define',  product: 'Brow pencil', time: 'Makeup', level: 'balanced', order: 3 },
  { id: 'makeup_3', label: 'Enhance', product: 'Concealer',   time: 'Makeup', level: 'balanced', order: 4 },
  { id: 'makeup_4', label: 'Colour',  product: 'Lip colour',  time: 'Makeup', level: 'full',     order: 5 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getLatestScanId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('scans')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return (data?.id as string | null) ?? null;
}

function isYesterday(dateStr: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateStr === yesterday.toISOString().slice(0, 10);
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr);
  const now  = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

type StepItem = { label: string; product?: string; level?: string; order?: number };

function buildStepsFromScan(
  items: StepItem[] | undefined,
  prefix: string,
  time: RoutineStep['time'],
  defaults: RoutineStep[],
): RoutineStep[] {
  if (!items || items.length === 0) return defaults;
  // Only accept structured objects — filter out any legacy flat strings
  const valid = items.filter(
    (item): item is StepItem =>
      typeof item === 'object' && item !== null && typeof item.label === 'string',
  );
  if (valid.length === 0) return defaults;
  return valid.map((item, i) => {
    const def = defaults[i];
    return {
      id:      `${prefix}_${i}`,
      label:   item.label,
      product: item.product,
      time,
      level:   (item.level ?? def?.level ?? 'simple') as RoutineStep['level'],
      order:   item.order ?? def?.order ?? i + 1,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
export default function RoutineScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [gender,       setGender]       = useState('man');
  const [category,     setCategory]     = useState<Category>('skin');
  const [routineLevel, setRoutineLevel] = useState<'simple' | 'balanced' | 'full'>('simple');
  const [scanCount,    setScanCount]    = useState(0);
  const [period,       setPeriod]       = useState<'AM' | 'PM'>(() =>
    new Date().getHours() < 14 ? 'AM' : 'PM'
  );

  const [skinSteps,   setSkinSteps]   = useState<RoutineStep[]>(SKIN_DEFAULT);
  const [hairSteps,   setHairSteps]   = useState<RoutineStep[]>(HAIR_DEFAULT);
  const [scalpSteps,  setScalpSteps]  = useState<RoutineStep[]>(SCALP_DEFAULT);
  const [beardSteps,  setBeardSteps]  = useState<RoutineStep[]>(BEARD_DEFAULT);
  const [makeupSteps, setMakeupSteps] = useState<RoutineStep[]>(MAKEUP_DEFAULT);
  const [hairProfile, setHairProfile] = useState<HairProfile | null>(null);
  const [hairRecs,    setHairRecs]    = useState<HairRecommendations | null>(null);

  const [routineLog,  setRoutineLog]  = useState<Record<string, string[]>>({});
  const [streakData,  setStreakData]  = useState<StreakData>({ current: 0, best: 0, lastDate: '' });
  const [washHistory, setWashHistory] = useState<string[]>([]);
  const [isWashDay,   setIsWashDay]   = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('users')
      .select('gender, routine_level, hair_profile, hair_recommendations')
      .eq('id', user.id)
      .single();

    if (profile) {
      const g = profile.gender ?? 'man';
      setGender(g);
      setRoutineLevel((profile as { routine_level?: string }).routine_level as 'simple' | 'balanced' | 'full' ?? 'simple');
      const hp = (profile as { hair_profile?: HairProfile | null }).hair_profile ?? null;
      const hr = (profile as { hair_recommendations?: HairRecommendations | null }).hair_recommendations ?? null;
      setHairProfile(hp);
      setHairRecs(hr);
      if (hr?.routine && hr.routine.length > 0) {
        const hrSteps: RoutineStep[] = hr.routine.map((s, i) => ({
          id:      `hair_${i}`,
          label:   s.label,
          product: s.product,
          time:    'Hair' as const,
          level:   s.level,
          order:   s.order,
          // orders 1-3 are wash-day steps; orders 4+ are everyday steps
          washDay: s.order != null ? s.order <= 3 : undefined,
        }));
        if (isBaldProfile(hp)) {
          setScalpSteps(hrSteps);
        } else {
          setHairSteps(hrSteps);
        }
      }
    }

    const { data: scansData, count } = await supabase
      .from('scans')
      .select('recommendations', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    setScanCount(count ?? 0);

    const latestRecs = scansData?.[0]?.recommendations as Record<string, any> | null;
    if (latestRecs) {
      const skin = latestRecs.skin ?? {};
      let morningItems: StepItem[] | undefined;
      let eveningItems: StepItem[] | undefined;

      morningItems = skin.routine?.morning as StepItem[] | undefined;
      eveningItems = skin.routine?.evening as StepItem[] | undefined;

      const newSkin = [
        ...buildStepsFromScan(morningItems, 'morning', 'Morning', SKIN_DEFAULT.filter(s => s.time === 'Morning')),
        ...buildStepsFromScan(eveningItems, 'evening', 'Evening', SKIN_DEFAULT.filter(s => s.time === 'Evening')),
      ];
      if (newSkin.length > 0) setSkinSteps(newSkin);

      // Hair steps come from hair_recommendations (user profile), not scan recommendations
      // They will be set separately after hairRecs state is loaded above

      if (latestRecs.beard?.routine) {
        const newBeard = buildStepsFromScan(latestRecs.beard.routine, 'beard', 'Beard', BEARD_DEFAULT);
        if (newBeard.length > 0) setBeardSteps(newBeard);
      }

      if (latestRecs.makeup?.routine) {
        const newMakeup = buildStepsFromScan(latestRecs.makeup.routine, 'makeup', 'Makeup', MAKEUP_DEFAULT);
        if (newMakeup.length > 0) setMakeupSteps(newMakeup);
      }
    }

    const logRaw = await AsyncStorage.getItem(ROUTINE_LOG_KEY);
    setRoutineLog(logRaw ? JSON.parse(logRaw) as Record<string, string[]> : {});

    const streakRaw = await AsyncStorage.getItem(ROUTINE_STREAK_KEY);
    setStreakData(streakRaw ? JSON.parse(streakRaw) as StreakData : { current: 0, best: 0, lastDate: '' });

    const washRaw = await AsyncStorage.getItem(WASH_HISTORY_KEY);
    const wh: string[] = washRaw ? JSON.parse(washRaw) as string[] : [];
    setWashHistory(wh);
    setIsWashDay(wh.includes(new Date().toISOString().slice(0, 10)));
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
  };

  // ── Toggle step ─────────────────────────────────────────────────────────────
  const toggleStep = async (step: RoutineStep) => {
    const todayKey  = new Date().toISOString().slice(0, 10);
    const todayDone = [...(routineLog[todayKey] ?? [])];
    const idx       = todayDone.indexOf(step.id);
    const adding    = idx < 0;

    if (adding) todayDone.push(step.id);
    else todayDone.splice(idx, 1);

    const newLog = { ...routineLog, [todayKey]: todayDone };
    setRoutineLog(newLog);
    await AsyncStorage.setItem(ROUTINE_LOG_KEY, JSON.stringify(newLog));

    if (adding) {
      // Log to Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const latestScanId = await getLatestScanId(user.id);
        const cat: 'skin_am' | 'skin_pm' | 'hair' | 'beard' | 'makeup' =
          category === 'skin' && period === 'AM' ? 'skin_am' :
          category === 'skin' && period === 'PM' ? 'skin_pm' :
          category === 'hair'  || category === 'scalp' ? 'hair' :
          category === 'beard' ? 'beard' :
          'makeup';

        await logRoutineStep({
          userId:      user.id,
          scanId:      latestScanId,
          stepLabel:   step.label,
          stepProduct: step.product,
          category:    cat,
        });
      }

      if (streakData.lastDate !== todayKey) {
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
    }
  };

  // ── Toggle wash day ─────────────────────────────────────────────────────────
  const toggleWashDay = async (value: boolean) => {
    setIsWashDay(value);
    const todayKey = new Date().toISOString().slice(0, 10);
    let wh = [...washHistory];
    if (value && !wh.includes(todayKey)) wh.push(todayKey);
    else if (!value) wh = wh.filter(d => d !== todayKey);
    setWashHistory(wh);
    await AsyncStorage.setItem(WASH_HISTORY_KEY, JSON.stringify(wh));
  };

  // ── Computed ────────────────────────────────────────────────────────────────
  const todayKey  = new Date().toISOString().slice(0, 10);
  const todayDone = new Set<string>(routineLog[todayKey] ?? []);
  const levelRank = LEVEL_RANK[routineLevel] ?? 1;

  const filterSteps = (steps: RoutineStep[]) =>
    steps
      .filter(s => LEVEL_RANK[s.level ?? 'simple'] <= levelRank)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  const skinFiltered   = filterSteps(skinSteps.filter(s => s.time === (period === 'AM' ? 'Morning' : 'Evening')));
  const hairFiltered   = filterSteps(hairSteps).filter(s =>
    s.washDay === undefined ||
    (s.washDay === true  && isWashDay) ||
    (s.washDay === false && !isWashDay)
  );
  const scalpFiltered  = filterSteps(scalpSteps);
  const beardFiltered  = filterSteps(beardSteps);
  const makeupFiltered = filterSteps(makeupSteps);

  const bald = isBaldProfile(hairProfile);

  const sectionSteps: RoutineStep[] =
    category === 'skin'   ? skinFiltered   :
    category === 'hair'   ? hairFiltered   :
    category === 'scalp'  ? scalpFiltered  :
    category === 'beard'  ? beardFiltered  :
                            makeupFiltered;
  const sectionDone = sectionSteps.filter(s => todayDone.has(s.id)).length;
  const sectionPct  = sectionSteps.length > 0
    ? Math.round((sectionDone / sectionSteps.length) * 100)
    : 0;

  // Wash stats
  const monthStart      = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const washesThisMonth = washHistory.filter(d => d >= monthStart).length;
  const sortedWash      = [...washHistory].sort();
  let avgDaysBetween    = 0;
  if (sortedWash.length > 1) {
    const gaps: number[] = [];
    for (let i = 1; i < sortedWash.length; i++) {
      gaps.push(daysSince(sortedWash[i - 1]) - daysSince(sortedWash[i]));
    }
    avgDaysBetween = Math.round(Math.abs(gaps.reduce((a, b) => a + b, 0) / gaps.length));
  }
  const lastWash      = sortedWash[sortedWash.length - 1];
  const daysSinceWash = lastWash ? daysSince(lastWash) : null;

  const isWoman        = gender === 'woman';
  const hairProfileSet = hairProfile != null && Object.keys(hairProfile).length > 0;
  const categories: { key: Category; label: string }[] = isWoman
    ? [
        { key: 'skin',   label: 'Skin'   },
        { key: bald ? 'scalp' : 'hair', label: bald ? 'Scalp' : 'Hair' },
        { key: 'makeup', label: 'Makeup' },
      ]
    : [
        { key: 'skin',   label: 'Skin'  },
        { key: bald ? 'scalp' : 'hair', label: bald ? 'Scalp' : 'Hair' },
        { key: 'beard',  label: 'Beard' },
      ];

  // ── Step row ────────────────────────────────────────────────────────────────
  const renderStep = (step: RoutineStep) => {
    const done      = todayDone.has(step.id);
    const isEvening = step.time === 'Evening';
    return (
      <TouchableOpacity
        key={step.id}
        style={[s.stepRow, done && s.stepRowDone]}
        onPress={() => toggleStep(step)}
        activeOpacity={0.75}
      >
        <View style={[s.checkbox, done && s.checkboxDone]}>
          {done && <Text style={s.checkmark}>✓</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.stepLabel, done && s.stepLabelDone, isEvening && !done && s.stepLabelPM]}>
            {step.label}
          </Text>
          {step.product ? <Text style={s.stepProduct}>{step.product}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <Text style={s.headerTitle}>Routine</Text>
      </View>

      {/* Category pills */}
      <View style={s.pillsRow}>
        {categories.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[s.pill, category === key && s.pillActive]}
            onPress={() => setCategory(key)}
            activeOpacity={0.8}
          >
            <Text style={[s.pillText, category === key && s.pillTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* Empty state */}
        {scanCount === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>No routine yet</Text>
            <Text style={s.emptyBody}>
              Take your first scan to get a personalised routine tailored to your face.
            </Text>
            <TouchableOpacity
              style={s.emptyBtn}
              onPress={() => router.replace('/(tabs)/scan')}
              activeOpacity={0.8}
            >
              <Text style={s.emptyBtnText}>Take a scan</Text>
            </TouchableOpacity>
          </View>
        ) : (
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
                <Text style={s.streakToday}>{sectionDone}/{sectionSteps.length} today</Text>
                <View style={s.streakBar}>
                  <View style={[s.streakFill, { width: `${sectionPct}%` as any }]} />
                </View>
              </View>
            </View>

            {/* SKIN */}
            {category === 'skin' && (
              <>
                <View style={s.toggleRow}>
                  <TouchableOpacity
                    style={[s.toggleBtn, period === 'AM' && s.toggleBtnAM]}
                    onPress={() => setPeriod('AM')}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.toggleBtnText, period === 'AM' && s.toggleBtnTextAM]}>☀ AM</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.toggleBtn, period === 'PM' && s.toggleBtnPM]}
                    onPress={() => setPeriod('PM')}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.toggleBtnText, period === 'PM' && s.toggleBtnTextPM]}>☽ PM</Text>
                  </TouchableOpacity>
                </View>
                {skinFiltered.map(renderStep)}
              </>
            )}

            {/* HAIR */}
            {category === 'hair' && (
              <>
                {!hairProfileSet ? (
                  <TouchableOpacity
                    style={s.hairSetupBox}
                    onPress={() => router.push({ pathname: '/hair-profile' as any, params: { returnTo: 'routine' } })}
                    activeOpacity={0.8}
                  >
                    <Text style={s.hairSetupTitle}>Set up your hair profile</Text>
                    <Text style={s.hairSetupBody}>
                      Answer a few quick questions about your hair. We'll generate a personalised wash routine and product picks.
                    </Text>
                    <Text style={s.hairSetupBtn}>Get started →</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <View style={s.washCard}>
                      <View style={s.washRow}>
                        <View>
                          <Text style={s.washTitle}>Wash day</Text>
                          {daysSinceWash !== null && (
                            <Text style={s.washSub}>
                              {daysSinceWash === 0 ? 'Last washed today' : `${daysSinceWash}d since last wash`}
                            </Text>
                          )}
                        </View>
                        <Switch
                          value={isWashDay}
                          onValueChange={toggleWashDay}
                          trackColor={{ false: Colors.border, true: Colors.accent }}
                          thumbColor={Colors.text}
                        />
                      </View>
                      <View style={s.washStats}>
                        <View style={s.washStat}>
                          <Text style={s.washStatNum}>{washesThisMonth}</Text>
                          <Text style={s.washStatLabel}>THIS MONTH</Text>
                        </View>
                        <View style={s.washStatDivider} />
                        <View style={s.washStat}>
                          <Text style={s.washStatNum}>{avgDaysBetween > 0 ? `${avgDaysBetween}d` : '—'}</Text>
                          <Text style={s.washStatLabel}>AVG INTERVAL</Text>
                        </View>
                      </View>
                    </View>
                    {hairFiltered.map(renderStep)}
                  </>
                )}
              </>
            )}

            {/* SCALP (bald users) */}
            {category === 'scalp' && (
              <>
                {!hairProfileSet ? (
                  <TouchableOpacity
                    style={s.hairSetupBox}
                    onPress={() => router.push({ pathname: '/hair-profile' as any, params: { returnTo: 'routine' } })}
                    activeOpacity={0.8}
                  >
                    <Text style={s.hairSetupTitle}>Set up your scalp profile</Text>
                    <Text style={s.hairSetupBody}>
                      Answer 3 quick questions about your scalp. We'll generate a personalised daily scalp care and sun protection routine.
                    </Text>
                    <Text style={s.hairSetupBtn}>Get started →</Text>
                  </TouchableOpacity>
                ) : (
                  scalpFiltered.map(renderStep)
                )}
              </>
            )}

            {/* BEARD */}
            {category === 'beard' && beardFiltered.map(renderStep)}

            {/* MAKEUP */}
            {category === 'makeup' && makeupFiltered.map(renderStep)}

            <TouchableOpacity
              onPress={() => router.push('/profile/routine-level' as never)}
              style={s.changeLevelLink}
              activeOpacity={0.8}
            >
              <Text style={s.changeLevelLinkText}>Change routine level →</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: Colors.background },
  header:      { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  headerTitle: { fontFamily: Typography.serif, fontSize: 22, color: Colors.surface },
  content:     { paddingHorizontal: Spacing.lg },

  // Category pills
  pillsRow:       { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  pill:           { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.pill, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  pillActive:     { backgroundColor: Colors.accent, borderColor: Colors.accent },
  pillText:       { fontSize: 9, color: Colors.text, fontWeight: '600' },
  pillTextActive: { color: Colors.surface },

  // Empty state
  emptyBox:     { alignItems: 'center', paddingTop: Spacing.xxxl },
  emptyTitle:   { fontFamily: Typography.serif, fontSize: 22, color: Colors.surface, marginBottom: Spacing.sm },
  emptyBody:    { fontSize: 13, color: Colors.text, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.lg },
  emptyBtn:     { backgroundColor: Colors.accent, borderRadius: Radius.input, paddingHorizontal: 28, paddingVertical: 12 },
  emptyBtnText: { fontSize: 13, color: Colors.surface, fontWeight: '600' },

  // Streak
  streakCard:  { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, marginBottom: Spacing.lg, alignItems: 'center' },
  streakLeft:  { marginRight: Spacing.xl, alignItems: 'center' },
  streakEmoji: { fontSize: 22, marginBottom: 2 },
  streakNum:   { fontFamily: Typography.serif, fontSize: 32, color: Colors.accent, lineHeight: 36 },
  streakLabel: { fontSize: 13, color: Colors.text2 },
  streakRight: { flex: 1 },
  streakBest:  { fontSize: 13, color: Colors.text2, marginBottom: Spacing.xs },
  streakToday: { fontSize: 13, color: Colors.text, marginBottom: Spacing.xs },
  streakBar:   { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  streakFill:  { height: 4, backgroundColor: Colors.accent, borderRadius: 2 },

  // AM/PM toggle
  toggleRow:       { flexDirection: 'row', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 3, marginBottom: 14, gap: 3 },
  toggleBtn:       { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnAM:     { backgroundColor: Colors.accent },
  toggleBtnPM:     { backgroundColor: Colors.surface2 },
  toggleBtnText:   { fontSize: 12, fontWeight: '500', color: Colors.text2 },
  toggleBtnTextAM: { color: Colors.surface },
  toggleBtnTextPM: { color: Colors.text },

  // Wash day card
  washCard:        { backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md },
  washRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  washTitle:       { fontSize: 15, color: Colors.text },
  washSub:         { fontSize: 12, color: Colors.text2, marginTop: 2 },
  washStats:       { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  washStat:        { flex: 1, alignItems: 'center' },
  washStatNum:     { fontFamily: Typography.serif, fontSize: 18, color: Colors.text },
  washStatLabel:   { fontSize: 9, color: Colors.text2, letterSpacing: 1, marginTop: 2 },
  washStatDivider: { width: 1, height: 30, backgroundColor: Colors.border },

  // Step rows
  stepRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.xs },
  stepRowDone:   { borderColor: Colors.accent + '66' },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  checkboxDone:  { backgroundColor: Colors.accent, borderColor: Colors.accent },
  checkmark:     { fontSize: 11, color: Colors.surface, fontWeight: '700' },
  stepLabel:     { fontSize: 15, color: Colors.text },
  stepLabelDone: { color: Colors.text2 },
  stepLabelPM:   { color: Colors.text },
  stepProduct:   { fontSize: 11, color: Colors.text2, marginTop: 1 },

  // Change level
  changeLevelLink:     { alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  changeLevelLinkText: { fontSize: 13, color: Colors.text },

  // Hair profile setup box
  hairSetupBox:  { backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: 'rgba(230,199,156,0.5)', padding: Spacing.lg, marginBottom: Spacing.md },
  hairSetupTitle:{ fontFamily: Typography.serif, fontSize: 18, color: Colors.text, marginBottom: Spacing.xs },
  hairSetupBody: { fontSize: 13, color: Colors.text2, lineHeight: 20, marginBottom: Spacing.md },
  hairSetupBtn:  { fontSize: 13, color: Colors.accent },
});
