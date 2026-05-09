// Delta service — computes and stores the scan_deltas row for a rescan.
// Called from scanService.runScanPhase2 after a new scan is saved. The
// resulting row powers the /scan-delta view screen.

import { supabase } from '../lib/supabase';
import { computeStreak, stripSlotSuffix, type DayAdherence } from '../lib/habit';
import { checkMilestonesForScan } from '../lib/milestones';
import { PRODUCTS } from '../constants/productConstants';
import type { RescanFeedback } from '../types';
import type { Scan } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScoreChange {
  from:  number;
  to:    number;
  delta: number;
}

export interface ScoreChanges {
  skin: ScoreChange;
}

export interface AdherenceByCategory {
  skin_am?: number;
  skin_pm?: number;
  beard?:   number;
  hair?:    number;
}

export interface WeeklyAdherencePoint {
  week_start_date: string;   // YYYY-MM-DD (Monday)
  pct:             number;   // 0..1
}

export interface ProductUsageSummary {
  product_id:                    string;
  product_name:                  string;
  brand:                         string;
  days_active:                   number;
  completions_tied_to_product:   number;
}

export interface ScanDeltaRow {
  id:                     string;
  user_id:                string;
  from_scan_id:           string;
  to_scan_id:             string;
  days_between:           number;
  score_changes:          ScoreChanges;
  concerns_improved:      string[];
  concerns_new:           string[];
  concerns_persistent:    string[];
  adherence_overall:      number | null;
  adherence_by_category:  AdherenceByCategory;
  adherence_weekly:       WeeklyAdherencePoint[];
  streak_longest:         number | null;
  streak_at_rescan:       number | null;
  freezes_used:           number;
  products_used:          ProductUsageSummary[];
  user_feedback:          RescanFeedback;
  computed_at:            string;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mondayStartISO(d: Date): string {
  // getDay(): Sunday=0, Monday=1, ..., Saturday=6. Shift so Monday=0.
  const dow    = (d.getDay() + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  return toISODate(monday);
}

function diffDays(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / MS_PER_DAY));
}

// ─── Category classification ────────────────────────────────────────────────

type AdherenceCategory = 'skin_am' | 'skin_pm' | 'beard' | 'hair';

// Drive category from the step_key prefix + slot suffix. step_keys are the
// canonical keys written to routine_plan_steps (skin_cleanse_am, hair_shampoo,
// beard_oil, …). Returns null for anything that doesn't match.
function categoryForStepKey(stepKey: string): AdherenceCategory | null {
  if (stepKey.startsWith('skin_')) {
    if (stepKey.endsWith('_am')) return 'skin_am';
    if (stepKey.endsWith('_pm')) return 'skin_pm';
    return null;
  }
  if (stepKey.startsWith('beard_')) return 'beard';
  if (stepKey.startsWith('hair_'))  return 'hair';
  return null;
}

// ─── Main entry point ───────────────────────────────────────────────────────

export async function computeAndStoreScanDelta(params: {
  userId:       string;
  newScanId:    string;
  userFeedback?: RescanFeedback;
}): Promise<void> {
  const { userId, newScanId, userFeedback } = params;

  try {
    // Fetch the new (to) scan.
    const { data: newScanData, error: newErr } = await supabase
      .from('scans')
      .select('id, created_at, skin_concerns, score_skin')
      .eq('id', newScanId)
      .single();
    if (newErr || !newScanData) {
      console.warn('[deltaService] new scan not found', newErr);
      return;
    }
    const newScan = newScanData as Pick<Scan,
      'id' | 'created_at' | 'skin_concerns' | 'score_skin'>;

    // Fetch the previous scan (most recent before the new one).
    const { data: prevScans } = await supabase
      .from('scans')
      .select('id, created_at, skin_concerns, score_skin')
      .eq('user_id', userId)
      .lt('created_at', newScan.created_at)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!prevScans || prevScans.length === 0) {
      // First scan — nothing to delta against.
      return;
    }
    const prevScan = prevScans[0] as Pick<Scan,
      'id' | 'created_at' | 'skin_concerns' | 'score_skin'>;

    const fromDate     = new Date(prevScan.created_at);
    const toDate       = new Date(newScan.created_at);
    const daysBetween  = diffDays(fromDate, toDate);

    // ── Score changes ──────────────────────────────────────────────────────
    // Phase 6.0: only skin condition is scored. beard/makeup are no longer tracked.
    const mkChange = (from: number | null | undefined, to: number | null | undefined): ScoreChange => {
      const f = from ?? 0;
      const t = to ?? 0;
      return { from: f, to: t, delta: t - f };
    };

    const scoreChanges: ScoreChanges = {
      skin: mkChange(prevScan.score_skin, newScan.score_skin),
    };

    // ── Concerns delta ─────────────────────────────────────────────────────
    const fromConcerns = new Set(prevScan.skin_concerns ?? []);
    const toConcerns   = new Set(newScan.skin_concerns ?? []);
    const concerns_improved   = [...fromConcerns].filter(c => !toConcerns.has(c));
    const concerns_new        = [...toConcerns].filter(c => !fromConcerns.has(c));
    const concerns_persistent = [...fromConcerns].filter(c => toConcerns.has(c));

    // ── Adherence metrics ─────────────────────────────────────────────────
    // Active plan during the window = prevScan's plan_steps (the schedule the
    // user was acting on between fromDate and toDate). Completions are bound
    // to whichever scan was active when they were logged via completions.scan_id,
    // but for this aggregate we filter by user + date range.
    const fromISO = toISODate(fromDate);
    const toISO   = toISODate(toDate);

    const [planRes, complRes] = await Promise.all([
      supabase
        .from('routine_plan_steps')
        .select('step_key, time_of_day, step_type')
        .eq('scan_id', prevScan.id),
      supabase
        .from('routine_completions')
        .select('step_key, date')
        .eq('user_id', userId)
        .gte('date', fromISO)
        .lt('date', toISO),
    ]);

    const planSteps = (planRes.data ?? []) as Array<{
      step_key: string; time_of_day: 'am' | 'pm' | 'daily'; step_type: 'maintenance' | 'treatment';
    }>;
    const completions = (complRes.data ?? []) as Array<{ step_key: string; date: string }>;

    // Per-category scheduled-per-day counts derived from prevScan's plan_steps.
    const scheduledPerDayByCat: Record<AdherenceCategory, number> = {
      skin_am: 0, skin_pm: 0, beard: 0, hair: 0,
    };
    for (const p of planSteps) {
      const cat = categoryForStepKey(p.step_key);
      if (cat) scheduledPerDayByCat[cat] += 1;
    }
    const scheduledPerDayTotal =
      scheduledPerDayByCat.skin_am +
      scheduledPerDayByCat.skin_pm +
      scheduledPerDayByCat.beard +
      scheduledPerDayByCat.hair;

    const expectedTotal = scheduledPerDayTotal * daysBetween;
    const completedTotal = completions.length;
    const adherence_overall = expectedTotal > 0
      ? Math.round((completedTotal / expectedTotal) * 10_000) / 10_000
      : null;

    // By-category adherence: completions per category over (scheduledPerDay × daysBetween).
    const completedByCat: Record<AdherenceCategory, number> = {
      skin_am: 0, skin_pm: 0, beard: 0, hair: 0,
    };
    for (const c of completions) {
      const cat = categoryForStepKey(c.step_key);
      if (cat) completedByCat[cat] += 1;
    }
    const adherence_by_category: AdherenceByCategory = {};
    (Object.keys(scheduledPerDayByCat) as AdherenceCategory[]).forEach(cat => {
      const expected = scheduledPerDayByCat[cat] * daysBetween;
      if (expected > 0) {
        adherence_by_category[cat] = Math.round((completedByCat[cat] / expected) * 10_000) / 10_000;
      }
    });

    // ── Weekly adherence — Monday-anchored buckets. Numerator: completions
    // landing in that week. Denominator: scheduledPerDayTotal × number of
    // window days that fell into that bucket.
    const completionsByWeek = new Map<string, number>();
    const daysInWindowByWeek = new Map<string, number>();
    for (const c of completions) {
      const [y, m, d] = c.date.split('-').map(Number);
      const week = mondayStartISO(new Date(y, m - 1, d));
      completionsByWeek.set(week, (completionsByWeek.get(week) ?? 0) + 1);
    }
    // Walk every day in [fromISO, toISO) to count window-days per week bucket,
    // since completions alone leave gaps (zero-completion days).
    for (let i = 0; i < daysBetween; i += 1) {
      const day = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i);
      const week = mondayStartISO(day);
      daysInWindowByWeek.set(week, (daysInWindowByWeek.get(week) ?? 0) + 1);
    }
    const adherence_weekly: WeeklyAdherencePoint[] = [...daysInWindowByWeek.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([week_start_date, daysInWindow]) => {
        const expected = scheduledPerDayTotal * daysInWindow;
        const completed = completionsByWeek.get(week_start_date) ?? 0;
        return {
          week_start_date,
          pct: expected > 0 ? Math.round((completed / expected) * 10_000) / 10_000 : 0,
        };
      });

    // ── Streak metrics ────────────────────────────────────────────────────
    // Build per-day DayAdherence using the active plan's scheduledPerDayTotal
    // so streak math has a non-zero denominator on every day in the window.
    const completedByDate = new Map<string, Set<string>>();
    for (const c of completions) {
      let s = completedByDate.get(c.date);
      if (!s) {
        s = new Set();
        completedByDate.set(c.date, s);
      }
      s.add(c.step_key);
    }
    const dailyAdherence: DayAdherence[] = [];
    for (let i = 0; i < daysBetween; i += 1) {
      const day = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i);
      const dateISO = toISODate(day);
      dailyAdherence.push({
        date:            dateISO,
        scheduled_count: scheduledPerDayTotal,
        completed_count: completedByDate.get(dateISO)?.size ?? 0,
      });
    }

    const streakInfo      = computeStreak(dailyAdherence);
    const streak_longest  = streakInfo.longest_streak;
    const streak_at_rescan = streakInfo.current_streak;
    const freezes_used    = streakInfo.freezes_used;

    // ── Products used ─────────────────────────────────────────────────────
    // Active kit at the time of each completion. Strip skin slot suffix to
    // match user_kit.step_id (which is unsuffixed).
    const { data: kitRows } = await supabase
      .from('user_kit')
      .select('id, product_id, step_id, acquired_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .lt('acquired_at', newScan.created_at);

    const kit = (kitRows ?? []) as Array<{
      id: string; product_id: string; step_id: string | null; acquired_at: string;
    }>;

    // Count completions per kit item by joining stripSlotSuffix(step_key) ↔ kit.step_id.
    // Only credit completions on/after the kit row's acquired_at (compared as YMD).
    const completionsByKit = new Map<string, number>();
    for (const c of completions) {
      const baseKey = stripSlotSuffix(c.step_key);
      const matchingKit = kit.find(k => {
        if (k.step_id !== baseKey) return false;
        const acquiredYMD = k.acquired_at.slice(0, 10);   // 'YYYY-MM-DD' from ISO
        return acquiredYMD <= c.date;
      });
      if (!matchingKit) continue;
      completionsByKit.set(matchingKit.id, (completionsByKit.get(matchingKit.id) ?? 0) + 1);
    }

    const products_used: ProductUsageSummary[] = kit.map(k => {
      const catalogue = PRODUCTS.find(p => p.id === k.product_id);
      const acquiredAt = new Date(k.acquired_at);
      const daysActiveRaw = diffDays(acquiredAt, new Date());
      return {
        product_id:   k.product_id,
        product_name: catalogue?.name ?? k.product_id,
        brand:        catalogue?.brand ?? 'Unknown',
        days_active:  Math.min(28, daysActiveRaw),
        completions_tied_to_product: completionsByKit.get(k.id) ?? 0,
      };
    });

    // ── Insert scan_delta row ─────────────────────────────────────────────
    const { error: insertErr } = await supabase
      .from('scan_deltas')
      .insert({
        user_id:               userId,
        from_scan_id:          prevScan.id,
        to_scan_id:            newScan.id,
        days_between:          daysBetween,
        score_changes:         scoreChanges,
        concerns_improved,
        concerns_new,
        concerns_persistent,
        adherence_overall,
        adherence_by_category,
        adherence_weekly,
        streak_longest,
        streak_at_rescan,
        freezes_used,
        products_used,
        user_feedback:         userFeedback ?? {},
      });

    if (insertErr) {
      // UNIQUE (to_scan_id) collisions are expected if computation already ran.
      const msg = String(insertErr.message ?? '').toLowerCase();
      if (!msg.includes('duplicate') && !msg.includes('unique')) {
        console.error('[deltaService] insert failed', insertErr);
      }
    }

    // Trigger milestone checks — idempotent; safe to call even if earlier checks ran.
    try {
      await checkMilestonesForScan(userId, newScan.id);
    } catch (err) {
      console.warn('[deltaService] milestone check failed', err);
    }
  } catch (err) {
    console.error('[deltaService] computeAndStoreScanDelta failed', err);
  }
}

// ─── Public: fetch a delta by to_scan_id ────────────────────────────────────

export async function fetchScanDeltaByToScanId(toScanId: string): Promise<ScanDeltaRow | null> {
  const { data, error } = await supabase
    .from('scan_deltas')
    .select('*')
    .eq('to_scan_id', toScanId)
    .maybeSingle();
  if (error) {
    console.warn('[deltaService] fetch by to_scan_id failed', error);
    return null;
  }
  if (!data) return null;
  return data as ScanDeltaRow;
}

// ─── Public: check which scan_ids already have deltas (for scan-history UI) ─

export async function fetchDeltaToScanIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('scan_deltas')
    .select('to_scan_id')
    .eq('user_id', userId);
  if (error) {
    console.warn('[deltaService] fetchDeltaToScanIds failed', error);
    return new Set();
  }
  const rows = (data ?? []) as Array<{ to_scan_id: string }>;
  return new Set(rows.map(r => r.to_scan_id));
}
