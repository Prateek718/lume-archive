// Phase 5 — DailyRoutineScreen.
// Layout translated verbatim from design/source/screens-routine-rescan.jsx:80-206.
// Empty state translated verbatim from design/source/screens-extra-1.jsx:425-451.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import {
  Body,
  ChapterLabel,
  Display,
  PrimaryButton,
} from '../../components/editorial';
import {
  RoutineCheckStep,
  StreakCallout,
  WeekStrip,
} from '../../components/routine';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { buildWeekStrip, computeStreak, type DayAdherence } from '../../lib/habit';
import {
  fetchDailyAdherence,
  fetchTodayRoutine,
  recordCheckin,
  unrecordCheckin,
  type RoutineDayStep,
} from '../../services/habitService';

type Period = 'AM' | 'PM';
type CareCategory = 'skin' | 'hair' | 'beard' | 'makeup';

interface ScanRow {
  id:         string;
  created_at: string;
}

const CATEGORY_LABELS: Record<CareCategory, string> = {
  skin:   'Skin',
  hair:   'Hair',
  beard:  'Beard',
  makeup: 'Makeup',
};

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LABELS   = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatTodayDate(d: Date): string {
  return `${WEEKDAY_LABELS[d.getDay()]} · ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.floor(ms / 86_400_000);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export default function RoutineRoute() {
  const router = useRouter();

  const [userId,         setUserId]         = useState<string | null>(null);
  const [careCategories, setCareCategories] = useState<CareCategory[]>([]);
  const [todaySteps,     setTodaySteps]     = useState<RoutineDayStep[]>([]);
  const [dailyAdherence, setDailyAdherence] = useState<DayAdherence[]>([]);
  const [latestScan,     setLatestScan]     = useState<ScanRow | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null);

  const initialPeriod: Period = new Date().getHours() < 18 ? 'AM' : 'PM';
  const [period, setPeriod] = useState<Period>(initialPeriod);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) {
          if (!cancelled) { setErrorMsg('Not signed in.'); setLoading(false); }
          return;
        }

        const userPromise = supabase
          .from('users')
          .select('care_categories')
          .eq('id', uid)
          .single();
        const scanPromise = supabase
          .from('scans')
          .select('id, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const [stepsRes, adherenceRes, userRes, scanRes] = await Promise.all([
          fetchTodayRoutine(uid),
          fetchDailyAdherence(uid),
          userPromise,
          scanPromise,
        ]);

        if (cancelled) return;
        setUserId(uid);
        setTodaySteps(stepsRes);
        setDailyAdherence(adherenceRes);
        const cats = (userRes.data?.care_categories ?? ['skin']) as CareCategory[];
        setCareCategories(cats);
        setLatestScan((scanRes.data ?? null) as ScanRow | null);
      } catch (err) {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Derived ──────────────────────────────────────────────────────────────

  const today = useMemo(() => new Date(), []);
  const headerDate = useMemo(() => formatTodayDate(today), [today]);

  const daysSinceScan = useMemo(() => {
    if (!latestScan) return 0;
    return Math.max(0, daysBetween(latestScan.created_at, today.toISOString()));
  }, [latestScan, today]);

  const issueDay = daysSinceScan + 1;
  const daysToNextScan = Math.max(0, 28 - daysSinceScan);

  const weekDays = useMemo(
    () => buildWeekStrip(dailyAdherence, todayISO()),
    [dailyAdherence],
  );

  const { activeIdx, completedIdxs } = useMemo(() => {
    let active = 6;
    const completed: number[] = [];
    weekDays.forEach((d, i) => {
      if (d.is_today) active = i;
      if (d.status === 'adherent' || d.status === 'freeze_used') completed.push(i);
    });
    return { activeIdx: active, completedIdxs: completed };
  }, [weekDays]);

  const streakDays = useMemo(
    () => computeStreak(dailyAdherence).current_streak,
    [dailyAdherence],
  );

  const doneToday  = todaySteps.filter(s => s.completed).length;
  const totalToday = todaySteps.length;

  const amSteps = useMemo(
    () => todaySteps
      .filter(s => s.time_of_day === 'am' || s.time_of_day === 'daily')
      .sort((a, b) => a.order - b.order),
    [todaySteps],
  );
  const pmSteps = useMemo(
    () => todaySteps
      .filter(s => s.time_of_day === 'pm' || s.time_of_day === 'daily')
      .sort((a, b) => a.order - b.order),
    [todaySteps],
  );

  const visibleSteps = period === 'AM' ? amSteps : pmSteps;
  const numberOffset = period === 'AM' ? 0 : amSteps.length;

  // ─── Toggle handler ───────────────────────────────────────────────────────

  const handleToggle = async (step: RoutineDayStep) => {
    if (!userId) return;
    const date = todayISO();
    const wasChecked = step.completed;
    const nowIso = new Date().toISOString();

    setTodaySteps(prev => prev.map(s =>
      s.step_id === step.step_id
        ? { ...s, completed: !wasChecked, completed_at: wasChecked ? null : nowIso }
        : s,
    ));

    try {
      if (wasChecked) {
        await unrecordCheckin(userId, step.step_id, date);
      } else {
        await recordCheckin(userId, step.step_id, date, step.kit_item_id);
      }
      const fresh = await fetchDailyAdherence(userId);
      setDailyAdherence(fresh);
    } catch (err) {
      console.error('[routine] toggle failed', err);
      setTodaySteps(prev => prev.map(s =>
        s.step_id === step.step_id
          ? { ...s, completed: wasChecked, completed_at: wasChecked ? nowIso : null }
          : s,
      ));
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Palette.accent} />
      </SafeAreaView>
    );
  }

  if (errorMsg) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: 'center' }}>
          <ChapterLabel>A moment</ChapterLabel>
          <View style={{ height: 14 }} />
          <Body serif size={14} style={{ fontStyle: 'italic' }}>
            {errorMsg}
          </Body>
        </View>
      </SafeAreaView>
    );
  }

  if (!latestScan) {
    return <EmptyState onScan={() => router.push('/scan')} />;
  }

  const visibleCategories = (['skin', 'hair', 'makeup', 'beard'] as CareCategory[])
    .filter(c => careCategories.includes(c));

  const handleAreaTap = (cat: CareCategory) => {
    const query = latestScan?.id ? `?scanId=${encodeURIComponent(latestScan.id)}` : '';
    router.push(`/${cat}-detail${query}` as never);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {/* Issue header */}
        <View style={{ paddingTop: 12, paddingHorizontal: 32 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <ChapterLabel>{headerDate}</ChapterLabel>
            <ChapterLabel>Issue one · day {issueDay}</ChapterLabel>
          </View>
          <Display style={{ marginTop: 16, fontSize: 30, lineHeight: 33 }}>
            <Text style={{ fontFamily: 'CormorantGaramond_500Medium_Italic', fontStyle: 'italic', color: Palette.ink }}>
              Your ritual,
            </Text>
            {'\n'}today.
          </Display>
        </View>

        {/* Week strip */}
        <View style={{ paddingTop: 30, paddingHorizontal: 32 }}>
          <WeekStrip activeIdx={activeIdx} completedIdxs={completedIdxs} />
        </View>

        {/* Streak callout */}
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <StreakCallout
            streakDays={streakDays}
            doneToday={doneToday}
            totalToday={totalToday}
            daysToNextScan={daysToNextScan}
          />
        </View>

        {/* AM / PM toggle */}
        <View
          style={{
            marginTop:         28,
            marginHorizontal:  32,
            flexDirection:     'row',
            borderBottomWidth: 1,
            borderBottomColor: Palette.rule,
          }}
        >
          {(['AM', 'PM'] as Period[]).map((p) => {
            const active = period === p;
            return (
              <TouchableOpacity
                key={p}
                onPress={() => setPeriod(p)}
                activeOpacity={0.7}
                style={{
                  paddingVertical:   10,
                  marginRight:       30,
                  borderBottomWidth: 1.5,
                  borderBottomColor: active ? Palette.accent : 'transparent',
                  marginBottom:      -1,
                }}
              >
                <Text
                  style={{
                    fontFamily:     'Inter_500Medium',
                    fontSize:       12,
                    letterSpacing:  1.6,
                    textTransform:  'uppercase',
                    color:          active ? Palette.ink : Palette.ink3,
                  }}
                >
                  {p === 'AM' ? 'Morning' : 'Evening'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Steps */}
        <View style={{ paddingTop: 12, paddingHorizontal: 32 }}>
          {visibleSteps.length === 0 ? (
            <View style={{ paddingVertical: 28 }}>
              <Body serif size={14} style={{ fontStyle: 'italic', color: Palette.ink3 }}>
                Nothing scheduled for {period === 'AM' ? 'this morning' : 'tonight'}.
              </Body>
            </View>
          ) : (
            visibleSteps.map((step, i) => {
              const title = step.product || step.label;
              const note  = step.product ? step.label : '';
              return (
                <RoutineCheckStep
                  key={step.row_id}
                  num={pad2(numberOffset + i + 1)}
                  title={title}
                  note={note}
                  checked={step.completed}
                  onToggle={() => handleToggle(step)}
                  last={i === visibleSteps.length - 1}
                />
              );
            })
          )}
        </View>

        {/* Read more shortcuts */}
        {visibleCategories.length > 0 && (
          <View style={{ paddingTop: 28, paddingHorizontal: 32 }}>
            <ChapterLabel style={{ marginBottom: 12 }}>Read more</ChapterLabel>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {visibleCategories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => handleAreaTap(cat)}
                  activeOpacity={0.85}
                  style={{
                    flex:              1,
                    paddingVertical:   14,
                    paddingHorizontal: 10,
                    borderWidth:       1,
                    borderColor:       Palette.rule,
                    alignItems:        'center',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'CormorantGaramond_500Medium_Italic',
                      fontStyle:  'italic',
                      fontSize:   15,
                      color:      Palette.ink,
                    }}
                  >
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────
// Translated from design/source/screens-extra-1.jsx:425-451.

function EmptyState({ onScan }: { onScan: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ flex: 1, paddingTop: 40, paddingHorizontal: 32, paddingBottom: 32 }}>
        <ChapterLabel>Before we begin</ChapterLabel>
        <Display style={{ marginTop: 16, fontSize: 36, lineHeight: 39 }}>
          <Text style={{ fontFamily: 'CormorantGaramond_500Medium_Italic', fontStyle: 'italic', color: Palette.ink }}>
            Your ritual
          </Text>
          {'\n'}awaits.
        </Display>
        <Body serif size={14.5} style={{ marginTop: 22, lineHeight: 24 }}>
          Take your first reading to see your personalised routine. It takes about a minute.
        </Body>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width:           160,
              height:          210,
              borderRadius:    999,
              borderWidth:     1,
              borderColor:     Palette.rule,
              alignItems:      'center',
              justifyContent:  'center',
            }}
          >
            <Text
              style={{
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle:  'italic',
                fontSize:   14,
                color:      Palette.ink3,
              }}
            >
              no reading yet
            </Text>
          </View>
        </View>
        <PrimaryButton label="Take first reading →" onPress={onScan} />
      </View>
    </SafeAreaView>
  );
}
