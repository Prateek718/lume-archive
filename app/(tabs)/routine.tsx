// Routine tab — week strip, streak + adherence, today's checklist, past-day view.
// Drives all state from the habit engine (routine_checkins table).

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  fetchTodayRoutine, fetchPastDayRoutine, fetchDailyAdherence,
  recordCheckin, unrecordCheckin, recordBulkCheckin,
  todayISO,
  type RoutineDayStep,
} from '../../services/habitService';
import { getProductMap } from '../../services/scanService';
import { fetchActiveKit } from '../../services/kitService';
import {
  computeStreak, buildWeekStrip, computeRollingAdherence,
  type DayAdherence, type StreakInfo, type WeekDay,
} from '../../lib/habit';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import ProductPickerSheet from '../../components/ProductPickerSheet';
import { PRODUCTS } from '../../constants/productConstants';
import type { MatchedProduct } from '../../types';

// ─── Step-id helpers ─────────────────────────────────────────────────────────

// Map known step ids → PRODUCTS catalogue categories. The routine engine's step ids
// come from Gemini (skin_am_*, skin_pm_*, beard_*) plus hair_* from user hair recs.
const STEP_CATEGORY_STATIC: Record<string, string> = {
  skin_am_cleanse:    'face_cleanser',
  skin_pm_cleanse:    'face_cleanser',
  skin_am_spf:        'spf_sunscreen',
  skin_am_moisturize: 'moisturiser',
  skin_pm_moisturize: 'moisturiser',
  skin_am_toner:      'toner',
  skin_pm_toner:      'toner',
  skin_am_eye:        'eye_cream',
  skin_pm_eye:        'eye_cream',
  beard_wash:         'beard_wash',
  beard_oil:          'beard_oil',
  beard_balm:         'beard_balm',
};

// Derive category from the human-readable product description — used when the
// step id alone isn't enough (e.g. skin_am_serum → vitamin C vs niacinamide vs HA).
function categoryFromProduct(product: string): string | undefined {
  const p = product.toLowerCase();
  if (p.includes('vitamin c') || p.includes('vitc'))     return 'serum_vitamin_c';
  if (p.includes('niacinamide'))                         return 'serum_niacinamide';
  if (p.includes('hyaluronic') || p.includes('ha serum'))return 'serum_hyaluronic_acid';
  if (p.includes('retinol'))                             return 'retinol';
  if (p.includes('aha') || p.includes('bha') || p.includes('exfolia')) return 'aha_exfoliant';
  if (p.includes('sunscreen') || p.includes('spf'))      return 'spf_sunscreen';
  if (p.includes('cleanser') || p.includes('face wash')) return 'face_cleanser';
  if (p.includes('moisturis') || p.includes('moisturiz'))return 'moisturiser';
  if (p.includes('eye'))                                 return 'eye_cream';
  if (p.includes('toner'))                               return 'toner';
  if (p.includes('shampoo'))                             return 'shampoo';
  if (p.includes('conditioner'))                         return 'conditioner';
  if (p.includes('hair mask'))                           return 'hair_mask';
  if (p.includes('hair oil'))                            return 'hair_oil';
  if (p.includes('hair serum') || p.includes('serum'))   return 'hair_serum';
  if (p.includes('scalp'))                               return 'scalp_serum';
  if (p.includes('beard wash'))                          return 'beard_wash';
  if (p.includes('beard oil'))                           return 'beard_oil';
  if (p.includes('beard balm'))                          return 'beard_balm';
  return undefined;
}

function deriveCategory(stepId: string, product: string | undefined): string | undefined {
  if (STEP_CATEGORY_STATIC[stepId]) return STEP_CATEGORY_STATIC[stepId];
  if (product) {
    const fromProduct = categoryFromProduct(product);
    if (fromProduct) return fromProduct;
  }
  // Hair step ids look like "hair_<category>".
  if (stepId.startsWith('hair_')) {
    const tail = stepId.slice(5);
    if (tail) return tail === 'shampoo' || tail === 'conditioner' || tail === 'mask'
      ? (tail === 'mask' ? 'hair_mask' : tail)
      : `hair_${tail}`;
  }
  return undefined;
}

function fallbackLabel(stepId: string): string {
  const short = stepId.replace(/^(skin_am_|skin_pm_|beard_|hair_)/, '').replace(/_/g, ' ');
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function cadencePill(step: RoutineDayStep): string | null {
  if (step.time_of_day === 'weekly')  return 'Weekly';
  if (step.time_of_day === 'monthly') return 'Monthly';
  return null;
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function RoutineScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [hasScan, setHasScan] = useState<boolean>(false);
  const [productMap, setProductMap] = useState<Record<string, MatchedProduct[]>>({});
  const [kitMap, setKitMap] = useState<Record<string, { name: string; brand: string }>>({});

  const [todaySteps,    setTodaySteps]    = useState<RoutineDayStep[]>([]);
  const [yesterdaySteps, setYesterdaySteps] = useState<RoutineDayStep[]>([]);
  const [pastDaySteps,  setPastDaySteps]  = useState<RoutineDayStep[]>([]);
  const [dailyAdherence, setDailyAdherence] = useState<DayAdherence[]>([]);

  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [period, setPeriod] = useState<'am' | 'pm'>(() =>
    new Date().getHours() < 16 ? 'am' : 'pm'
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerStepId, setPickerStepId] = useState<string>('');
  const [pickerCategory, setPickerCategory] = useState<string>('');
  const [pickerStepLabel, setPickerStepLabel] = useState<string>('');
  const [pickerReason, setPickerReason] = useState<string>('');

  const [yesterdaySheet, setYesterdaySheet] = useState<{ visible: boolean; step?: RoutineDayStep }>({ visible: false });

  // ── Load everything ────────────────────────────────────────────────────────
  const loadAll = useCallback(async (signalRefreshing = false) => {
    if (signalRefreshing) setRefreshing(true); else setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); setRefreshing(false); return; }
      setUserId(user.id);

      // Latest scan id — needed for productMap (picker catalogue).
      const { data: scansData } = await supabase
        .from('scans')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
      const scanId = (scansData?.[0] as { id: string } | undefined)?.id ?? null;
      setHasScan(!!scanId);

      // Today + yesterday + adherence + product catalogue + active kit, all in parallel.
      const [today, yesterday, adherence, pm, kitRows] = await Promise.all([
        fetchTodayRoutine(user.id),
        fetchPastDayRoutine(user.id, yesterdayISO()),
        fetchDailyAdherence(user.id, 30),
        scanId ? getProductMap(scanId) : Promise.resolve({} as Record<string, MatchedProduct[]>),
        fetchActiveKit(user.id),
      ]);
      setTodaySteps(today);
      setYesterdaySteps(yesterday);
      setDailyAdherence(adherence);
      setProductMap(pm);

      // Build kit lookup: kit_item_id -> { name, brand } via PRODUCTS catalogue.
      const km: Record<string, { name: string; brand: string }> = {};
      for (const row of kitRows) {
        const p = PRODUCTS.find((q) => q.id === row.product_id);
        if (p) km[row.id] = { name: p.name, brand: p.brand };
        else km[row.id] = { name: row.product_id, brand: '' };
      }
      setKitMap(km);

      if (selectedDate !== todayISO()) {
        const past = await fetchPastDayRoutine(user.id, selectedDate);
        setPastDaySteps(past);
      }
    } catch (err) {
      console.error('[routine] loadAll failed', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // ── Derived ────────────────────────────────────────────────────────────────
  const viewingToday = selectedDate === todayISO();

  const streak: StreakInfo = useMemo(() => computeStreak(dailyAdherence), [dailyAdherence]);
  const adherencePct = useMemo(() => computeRollingAdherence(dailyAdherence), [dailyAdherence]);
  const weekStrip: WeekDay[] = useMemo(() => buildWeekStrip(dailyAdherence, todayISO()), [dailyAdherence]);

  const missedYesterdayIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of yesterdaySteps) {
      if (!r.completed) set.add(r.step_id);
    }
    return set;
  }, [yesterdaySteps]);

  const activeSteps = viewingToday ? todaySteps : pastDaySteps;

  // Display sections — beard and hair are shown in both AM and PM today views.
  const skinAmSteps  = activeSteps.filter(s => s.step_id.startsWith('skin_am_'));
  const skinPmSteps  = activeSteps.filter(s => s.step_id.startsWith('skin_pm_'));
  const beardSteps   = activeSteps.filter(s => s.step_id.startsWith('beard_'));
  const hairSteps    = activeSteps.filter(s => s.step_id.startsWith('hair_'));

  // Mark-all bucket — skin_am_* + beard with am bucket (or pm equivalents).
  // Hair is excluded; cadence-driven steps shouldn't be bulk-toggled.
  const currentPeriodSteps = useMemo<RoutineDayStep[]>(() => {
    if (!viewingToday) return [];
    if (period === 'am') {
      return [
        ...skinAmSteps,
        ...beardSteps.filter(b => b.time_of_day !== 'pm'),  // 'am' or 'daily'
      ];
    }
    return [
      ...skinPmSteps,
      ...beardSteps.filter(b => b.time_of_day === 'pm'),
    ];
  }, [viewingToday, period, skinAmSteps, skinPmSteps, beardSteps]);

  const periodUnchecked = currentPeriodSteps.filter(s => !s.completed);
  const periodAllDone = currentPeriodSteps.length > 0 && periodUnchecked.length === 0;

  // Today's completion ratio for the week-strip "today" dot.
  const todayPct = activeSteps.length === 0
    ? 0
    : Math.round((activeSteps.filter(x => x.completed).length / activeSteps.length) * 100);

  // ── Actions (optimistic) ──────────────────────────────────────────────────
  // Each toggle / mark-all updates local state immediately, then fires the
  // Supabase write in the background. On error we revert. We never re-fetch
  // the routine on a tap — the list must not re-shuffle mid-interaction.
  const adjustAdherence = useCallback((delta: number, date: string) => {
    setDailyAdherence((prev) => {
      const idx = prev.findIndex((d) => d.date === date);
      if (idx === -1) {
        // Today may not be in the window yet — append.
        return [...prev, { date, scheduled_count: 0, completed_count: Math.max(0, delta) }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], completed_count: Math.max(0, next[idx].completed_count + delta) };
      return next;
    });
  }, []);

  const toggleStep = useCallback((step: RoutineDayStep) => {
    if (!userId || !viewingToday) return;
    const willComplete = !step.completed;
    const nowIso = new Date().toISOString();
    const date = selectedDate;

    setTodaySteps((prev) => prev.map((s) => s.row_id === step.row_id
      ? { ...s, completed: willComplete, completed_at: willComplete ? nowIso : null }
      : s));
    adjustAdherence(willComplete ? 1 : -1, date);

    (async () => {
      try {
        if (willComplete) {
          await recordCheckin(userId, step.step_id, date, step.kit_item_id ?? undefined);
        } else {
          await unrecordCheckin(userId, step.step_id, date);
        }
      } catch (err) {
        console.error('[routine] toggleStep failed', err);
        setTodaySteps((prev) => prev.map((s) => s.row_id === step.row_id
          ? { ...s, completed: step.completed, completed_at: step.completed_at }
          : s));
        adjustAdherence(willComplete ? -1 : 1, date);
        Alert.alert('Could not save', 'Please try again.');
      }
    })();
  }, [userId, viewingToday, selectedDate, adjustAdherence]);

  const handleMarkAll = useCallback(() => {
    if (!userId || !viewingToday) return;
    const willMark = !periodAllDone;
    const targets = willMark
      ? periodUnchecked
      : currentPeriodSteps.filter((s) => s.completed);
    if (targets.length === 0) return;

    const targetIds = new Set(targets.map((s) => s.row_id));
    const nowIso = new Date().toISOString();
    const date = selectedDate;
    const snapshot = targets.map((s) => ({ row_id: s.row_id, completed: s.completed, completed_at: s.completed_at }));

    setTodaySteps((prev) => prev.map((s) => targetIds.has(s.row_id)
      ? { ...s, completed: willMark, completed_at: willMark ? nowIso : null }
      : s));
    adjustAdherence(willMark ? targets.length : -targets.length, date);

    (async () => {
      try {
        if (willMark) {
          await recordBulkCheckin(userId, targets.map((t) => t.step_id), date);
        } else {
          // habitService has no bulk un-record; fan out.
          await Promise.all(targets.map((t) => unrecordCheckin(userId, t.step_id, date)));
        }
      } catch (err) {
        console.error('[routine] markAll failed', err);
        setTodaySteps((prev) => prev.map((s) => {
          const snap = snapshot.find((x) => x.row_id === s.row_id);
          return snap ? { ...s, completed: snap.completed, completed_at: snap.completed_at } : s;
        }));
        adjustAdherence(willMark ? -targets.length : targets.length, date);
        Alert.alert('Could not save', 'Please try again.');
      }
    })();
  }, [userId, viewingToday, periodAllDone, periodUnchecked, currentPeriodSteps, selectedDate, adjustAdherence]);

  const markYesterdayDone = useCallback((stepId: string) => {
    if (!userId) return;
    const date = yesterdayISO();
    const target = yesterdaySteps.find((s) => s.step_id === stepId);
    setYesterdaySheet({ visible: false });
    if (!target || target.completed) return;

    const nowIso = new Date().toISOString();
    setYesterdaySteps((prev) => prev.map((s) => s.step_id === stepId
      ? { ...s, completed: true, completed_at: nowIso }
      : s));
    adjustAdherence(1, date);

    (async () => {
      try {
        await recordCheckin(userId, stepId, date);
      } catch (err) {
        console.error('[routine] markYesterdayDone failed', err);
        setYesterdaySteps((prev) => prev.map((s) => s.step_id === stepId
          ? { ...s, completed: false, completed_at: null }
          : s));
        adjustAdherence(-1, date);
        Alert.alert('Could not save', 'Please try again.');
      }
    })();
  }, [userId, yesterdaySteps, adjustAdherence]);

  const openPicker = useCallback((step: RoutineDayStep) => {
    const category = deriveCategory(step.step_id, step.product);
    if (!category) return;
    setPickerStepId(step.step_id);
    setPickerCategory(category);
    setPickerStepLabel(step.label || fallbackLabel(step.step_id));
    setPickerReason(step.product ?? '');
    setPickerVisible(true);
  }, []);

  const onSelectDay = useCallback(async (w: WeekDay) => {
    if (w.is_today) {
      setSelectedDate(todayISO());
      return;
    }
    if (!userId) return;
    setSelectedDate(w.date);
    try {
      const past = await fetchPastDayRoutine(userId, w.date);
      setPastDaySteps(past);
    } catch (err) {
      console.error('[routine] fetch past day failed', err);
    }
  }, [userId]);

  // ── Step row ───────────────────────────────────────────────────────────────
  const renderStep = (step: RoutineDayStep) => {
    const label = step.label || fallbackLabel(step.step_id);
    const category = deriveCategory(step.step_id, step.product);
    const hasProducts = category ? (productMap[category]?.length ?? 0) > 0 : false;
    const cadence = cadencePill(step);
    const linkedKit = step.kit_item_id ? kitMap[step.kit_item_id] ?? null : null;
    const showPickerChip = viewingToday && !linkedKit && hasProducts;

    const onRowLongPress = () => {
      if (!viewingToday) return;
      if (missedYesterdayIds.has(step.step_id)) {
        setYesterdaySheet({ visible: true, step });
      }
    };

    return (
      <TouchableOpacity
        key={step.row_id}
        style={[s.stepRow, step.completed && s.stepRowDone]}
        activeOpacity={viewingToday ? 0.75 : 1}
        onPress={viewingToday ? () => toggleStep(step) : undefined}
        onLongPress={onRowLongPress}
        delayLongPress={500}
      >
        {viewingToday ? (
          <View style={[s.checkbox, step.completed && s.checkboxDone]}>
            {step.completed && <Text style={s.checkmark}>✓</Text>}
          </View>
        ) : (
          <View style={[s.dot, step.completed && s.dotDone]} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[s.stepLabel, step.completed && s.stepLabelDone]}>{label}</Text>
          {linkedKit ? (
            <Text style={s.stepProductLinked} numberOfLines={1}>
              {linkedKit.brand ? `${linkedKit.name} · ${linkedKit.brand}` : linkedKit.name}
            </Text>
          ) : (
            <>
              {step.product ? <Text style={s.stepProduct}>{step.product}</Text> : null}
              {showPickerChip && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); openPicker(step); }}
                  style={s.pickChip}
                  activeOpacity={0.75}
                >
                  <Text style={s.pickChipText}>Pick product →</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
        {cadence && (
          <View style={s.cadencePill}>
            <Text style={s.cadencePillText}>{cadence}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ── Week strip dot ─────────────────────────────────────────────────────────
  const WeekDot = ({ w }: { w: WeekDay }) => {
    const isSelected = selectedDate === w.date;
    const styles: any[] = [s.dotCircle];
    let inner: React.ReactNode = null;

    if (w.is_today) {
      inner = <Text style={s.dotToday}>{todayPct}</Text>;
      styles.push(s.dotCircleToday);
    } else if (w.status === 'adherent') {
      styles.push(s.dotCircleAdherent);
    } else if (w.status === 'missed' || w.status === 'pending') {
      styles.push(s.dotCircleMissed);
    } else if (w.status === 'freeze_used') {
      styles.push(s.dotCircleFreeze);
    } else {
      styles.push(s.dotCircleEmpty);
    }

    return (
      <TouchableOpacity style={s.dotCell} onPress={() => onSelectDay(w)} activeOpacity={0.7}>
        <View style={styles}>{inner}</View>
        <Text style={[s.dotLabel, isSelected && s.dotLabelSelected]}>{w.label}</Text>
        {isSelected && <View style={s.dotUnderline} />}
      </TouchableOpacity>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.screen, { paddingTop: insets.top, justifyContent: 'center' }]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!hasScan) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <View style={s.header}>
          <Text style={s.headerTitle}>Routine</Text>
        </View>
        <View style={s.emptyBox}>
          <Text style={s.emptyTitle}>Scan your face to build your routine</Text>
          <Text style={s.emptyBody}>
            Your personalised routine appears here after your first scan.
          </Text>
          <TouchableOpacity
            style={s.emptyBtn}
            onPress={() => router.replace('/(tabs)/scan')}
            activeOpacity={0.8}
          >
            <Text style={s.emptyBtnText}>Take a scan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <Text style={s.headerTitle}>Routine</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor={Colors.accent} />}
      >
        {/* Week strip */}
        <View style={s.weekStrip}>
          {weekStrip.map(w => <WeekDot key={w.date} w={w} />)}
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <View style={s.streakTop}>
              <Text style={s.streakFlame}>🔥</Text>
              <Text style={s.statBigNum}>{streak.current_streak}</Text>
              {streak.freezes_banked > 0 && (
                <Text style={s.freezeBadge}>+{streak.freezes_banked}</Text>
              )}
            </View>
            <Text style={s.statCaption}>day streak</Text>
            {streak.longest_streak > streak.current_streak && (
              <Text style={s.longestCaption}>longest {streak.longest_streak}</Text>
            )}
          </View>
          <View style={s.statCard}>
            <View style={s.streakTop}>
              <Text style={s.statBigNum}>{adherencePct}</Text>
              <Text style={s.statPct}>%</Text>
            </View>
            <Text style={s.statCaption}>last 30 days</Text>
          </View>
        </View>

        {/* Past-day chip */}
        {!viewingToday && (
          <TouchableOpacity
            style={s.pastChip}
            activeOpacity={0.8}
            onPress={() => setSelectedDate(todayISO())}
          >
            <Text style={s.pastChipText}>
              Viewing {formatShortDate(selectedDate)} — Back to today
            </Text>
          </TouchableOpacity>
        )}

        {/* TODAY VIEW */}
        {viewingToday && (
          <>
            {/* AM/PM toggle */}
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.toggleBtn, period === 'am' && s.toggleBtnActive]}
                onPress={() => setPeriod('am')}
                activeOpacity={0.8}
              >
                <Text style={[s.toggleBtnText, period === 'am' && s.toggleBtnTextActive]}>☀ AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, period === 'pm' && s.toggleBtnActive]}
                onPress={() => setPeriod('pm')}
                activeOpacity={0.8}
              >
                <Text style={[s.toggleBtnText, period === 'pm' && s.toggleBtnTextActive]}>☽ PM</Text>
              </TouchableOpacity>
            </View>

            {/* Mark all done */}
            {currentPeriodSteps.length > 0 && (
              <TouchableOpacity
                style={[s.markAllBtn, periodAllDone && s.markAllBtnUndo]}
                onPress={handleMarkAll}
                activeOpacity={0.8}
              >
                <Text style={[s.markAllText, periodAllDone && s.markAllTextUndo]}>
                  {periodAllDone ? 'Unmark all' : 'Mark all done'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Skin section — AM or PM depending on toggle */}
            {(period === 'am' ? skinAmSteps : skinPmSteps).length > 0 && (
              <>
                <Text style={s.sectionLabel}>SKIN</Text>
                {(period === 'am' ? skinAmSteps : skinPmSteps).map(renderStep)}
              </>
            )}

            {/* Beard section — always full beard, ignores AM/PM toggle */}
            {beardSteps.length > 0 && (
              <>
                <Text style={s.sectionLabel}>BEARD</Text>
                {beardSteps.map(renderStep)}
              </>
            )}

            {/* Hair section — full hair routine, ignores AM/PM toggle */}
            {hairSteps.length > 0 && (
              <>
                <Text style={s.sectionLabel}>HAIR</Text>
                {hairSteps.map(renderStep)}
              </>
            )}

            {/* Empty fallback when nothing is scheduled at all today */}
            {skinAmSteps.length === 0 && skinPmSteps.length === 0
             && beardSteps.length === 0 && hairSteps.length === 0 && (
              <View style={s.emptySection}>
                <Text style={s.emptySectionText}>No routine scheduled today</Text>
              </View>
            )}
          </>
        )}

        {/* PAST DAY VIEW */}
        {!viewingToday && (
          <>
            {skinAmSteps.length > 0 && (
              <>
                <Text style={s.sectionLabel}>AM</Text>
                {skinAmSteps.map(renderStep)}
              </>
            )}
            {skinPmSteps.length > 0 && (
              <>
                <Text style={s.sectionLabel}>PM</Text>
                {skinPmSteps.map(renderStep)}
              </>
            )}
            {beardSteps.length > 0 && (
              <>
                <Text style={s.sectionLabel}>BEARD</Text>
                {beardSteps.map(renderStep)}
              </>
            )}
            {hairSteps.length > 0 && (
              <>
                <Text style={s.sectionLabel}>HAIR</Text>
                {hairSteps.map(renderStep)}
              </>
            )}
            {activeSteps.length === 0 && (
              <View style={s.emptySection}>
                <Text style={s.emptySectionText}>No routine was tracked on this day</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>

      {/* ── Product picker ── */}
      <ProductPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        stepName={pickerStepLabel}
        categoryName={pickerCategory}
        reason={pickerReason}
        products={productMap[pickerCategory] ?? []}
        userId={userId ?? undefined}
        stepId={pickerStepId || undefined}
        onBought={() => { loadAll(); }}
      />

      {/* ── Yesterday-missed action sheet ── */}
      <Modal
        visible={yesterdaySheet.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setYesterdaySheet({ visible: false })}
      >
        <TouchableOpacity
          style={s.sheetOverlay}
          activeOpacity={1}
          onPress={() => setYesterdaySheet({ visible: false })}
        >
          <View style={s.actionSheet}>
            <Text style={s.sheetTitle}>
              {yesterdaySheet.step ? (yesterdaySheet.step.label || fallbackLabel(yesterdaySheet.step.step_id)) : ''}
            </Text>
            <TouchableOpacity
              style={s.sheetAction}
              onPress={() => yesterdaySheet.step && markYesterdayDone(yesterdaySheet.step.step_id)}
              activeOpacity={0.75}
            >
              <Text style={s.sheetActionText}>Mark as done yesterday</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.sheetCancel}
              onPress={() => setYesterdaySheet({ visible: false })}
              activeOpacity={0.75}
            >
              <Text style={s.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: Colors.background },
  header:      { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  headerTitle: { fontFamily: Typography.serif, fontSize: 22, color: Colors.text },
  content:     { paddingHorizontal: Spacing.lg },

  // Empty state
  emptyBox:     { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxxl },
  emptyTitle:   { fontFamily: Typography.serif, fontSize: 20, color: Colors.text, marginBottom: Spacing.sm, textAlign: 'center' },
  emptyBody:    { fontSize: 13, color: Colors.text2, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  emptyBtn:     { backgroundColor: Colors.accent, borderRadius: Radius.input, paddingHorizontal: 28, paddingVertical: 12 },
  emptyBtnText: { fontSize: 13, color: Colors.textOnAccent, fontWeight: '600' },

  // Week strip
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm, marginBottom: Spacing.md },
  dotCell:   { alignItems: 'center', width: 36 },
  dotCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  dotCircleAdherent: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dotCircleMissed:   { backgroundColor: Colors.border, borderColor: Colors.border },
  dotCircleFreeze:   { backgroundColor: 'transparent', borderColor: Colors.green, borderStyle: 'dashed' },
  dotCircleToday:    { borderColor: Colors.accent, borderWidth: 2, backgroundColor: Colors.card },
  dotCircleEmpty:    { backgroundColor: Colors.surface, borderColor: Colors.border2 },
  dotToday:          { fontSize: 10, color: Colors.accent, fontWeight: '600' },
  dotLabel:          { fontSize: 10, color: Colors.text2, marginTop: 4 },
  dotLabelSelected:  { color: Colors.text, fontWeight: '600' },
  dotUnderline:      { width: 18, height: 1.5, backgroundColor: Colors.accent, marginTop: 2, borderRadius: 1 },

  // Stats row
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, alignItems: 'center',
  },
  streakTop: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  streakFlame: { fontSize: 18 },
  statBigNum:  { fontFamily: Typography.serif, fontSize: 28, color: Colors.text, lineHeight: 32 },
  statPct:     { fontSize: 14, color: Colors.text2, marginLeft: 2 },
  freezeBadge: { fontSize: 11, color: Colors.accent, marginLeft: 2 },
  statCaption:   { fontSize: 11, color: Colors.text2, marginTop: 2, textAlign: 'center' },
  longestCaption:{ fontSize: 10, color: Colors.text3, marginTop: 2 },

  // Past-day chip
  pastChip:     { backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'center', marginBottom: Spacing.md },
  pastChipText: { fontSize: 12, color: Colors.text },

  // AM/PM toggle
  toggleRow:          { flexDirection: 'row', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.input, padding: 3, marginBottom: Spacing.md, gap: 3 },
  toggleBtn:          { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive:    { backgroundColor: Colors.accent },
  toggleBtnText:      { fontSize: 12, fontWeight: '500', color: Colors.text2 },
  toggleBtnTextActive:{ color: Colors.textOnAccent },

  // Mark all
  markAllBtn:     { backgroundColor: Colors.accent, borderRadius: Radius.input, paddingVertical: 10, alignItems: 'center', marginBottom: Spacing.md },
  markAllBtnUndo: { backgroundColor: Colors.surface2 },
  markAllText:    { fontSize: 13, color: Colors.textOnAccent, fontWeight: '600' },
  markAllTextUndo:{ color: Colors.text },

  // Section labels
  sectionLabel: { fontSize: 10, color: Colors.accent, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: Spacing.md, marginBottom: Spacing.xs },

  // Step rows
  stepRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.xs },
  stepRowDone:   { borderColor: Colors.accentTintBorderStrong },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  checkboxDone:  { backgroundColor: Colors.accent, borderColor: Colors.accent },
  checkmark:     { fontSize: 11, color: Colors.textOnAccent, fontWeight: '700' },
  dot:           { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.border, marginRight: Spacing.md, marginLeft: 5 },
  dotDone:       { backgroundColor: Colors.accent, borderColor: Colors.accent },
  stepLabel:     { fontSize: 15, color: Colors.text, fontWeight: '500' },
  stepLabelDone: { color: Colors.text2 },
  stepProduct:   { fontSize: 11, color: Colors.text2, marginTop: 1 },
  stepProductLinked: { fontSize: 12, color: Colors.text, marginTop: 2, fontWeight: '500' },
  pickChip:      { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.accent },
  pickChipText:  { fontSize: 10, color: Colors.accent, fontWeight: '600' },

  cadencePill:      { backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginLeft: Spacing.sm },
  cadencePillText:  { fontSize: 10, color: Colors.text2 },

  emptySection:     { paddingVertical: Spacing.lg, alignItems: 'center' },
  emptySectionText: { fontSize: 13, color: Colors.text2 },

  // Action sheet / modal
  sheetOverlay: { flex: 1, backgroundColor: Colors.overlaySheet, justifyContent: 'flex-end' },
  actionSheet:  { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, paddingBottom: Spacing.xl },
  sheetTitle:   { fontFamily: Typography.serif, fontSize: 16, color: Colors.text, marginBottom: Spacing.md },
  sheetAction:  { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border2 },
  sheetActionText: { fontSize: 15, color: Colors.accent, fontWeight: '500' },
  sheetCancel:  { paddingVertical: 14, marginTop: 4, alignItems: 'center' },
  sheetCancelText: { fontSize: 13, color: Colors.text2 },
});
