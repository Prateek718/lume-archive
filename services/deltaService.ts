// Delta service — computes and stores the scan_deltas row for a rescan.
// Called from scanService.runScanPhase2 after a new scan is saved. The
// resulting row powers the /scan-delta view screen.

import { supabase } from '../lib/supabase';
import { computeStreak, type DayAdherence } from '../lib/habit';
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
  overall: ScoreChange;
  skin?:   ScoreChange;
  beard?:  ScoreChange | null;
  makeup?: ScoreChange | null;
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

// ─── Category classification for routine_checkins ───────────────────────────

type AdherenceCategory = 'skin_am' | 'skin_pm' | 'beard' | 'hair';

function stepCategory(stepId: string, timeOfDay: string): AdherenceCategory | null {
  if (stepId.startsWith('skin_')) {
    if (timeOfDay === 'am') return 'skin_am';
    if (timeOfDay === 'pm') return 'skin_pm';
    return null;
  }
  if (stepId.startsWith('beard_')) return 'beard';
  if (stepId.startsWith('hair_'))  return 'hair';
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
      .select('id, created_at, skin_concerns, score_overall, score_skin, score_beard, score_makeup')
      .eq('id', newScanId)
      .single();
    if (newErr || !newScanData) {
      console.warn('[deltaService] new scan not found', newErr);
      return;
    }
    const newScan = newScanData as Pick<Scan,
      'id' | 'created_at' | 'skin_concerns' | 'score_overall' | 'score_skin' | 'score_beard' | 'score_makeup'>;

    // Fetch the previous scan (most recent before the new one).
    const { data: prevScans } = await supabase
      .from('scans')
      .select('id, created_at, skin_concerns, score_overall, score_skin, score_beard, score_makeup')
      .eq('user_id', userId)
      .lt('created_at', newScan.created_at)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!prevScans || prevScans.length === 0) {
      // First scan — nothing to delta against.
      return;
    }
    const prevScan = prevScans[0] as Pick<Scan,
      'id' | 'created_at' | 'skin_concerns' | 'score_overall' | 'score_skin' | 'score_beard' | 'score_makeup'>;

    const fromDate     = new Date(prevScan.created_at);
    const toDate       = new Date(newScan.created_at);
    const daysBetween  = diffDays(fromDate, toDate);

    // ── Score changes ──────────────────────────────────────────────────────
    const mkChange = (from: number | null | undefined, to: number | null | undefined): ScoreChange | null => {
      if (from == null || to == null) return null;
      return { from, to, delta: to - from };
    };

    const scoreChanges: ScoreChanges = {
      overall: mkChange(prevScan.score_overall, newScan.score_overall) ?? { from: 0, to: 0, delta: 0 },
      skin:    mkChange(prevScan.score_skin,    newScan.score_skin)    ?? undefined,
      beard:   mkChange(prevScan.score_beard,   newScan.score_beard),
      makeup:  mkChange(prevScan.score_makeup,  newScan.score_makeup),
    };

    // ── Concerns delta ─────────────────────────────────────────────────────
    const fromConcerns = new Set(prevScan.skin_concerns ?? []);
    const toConcerns   = new Set(newScan.skin_concerns ?? []);
    const concerns_improved   = [...fromConcerns].filter(c => !toConcerns.has(c));
    const concerns_new        = [...toConcerns].filter(c => !fromConcerns.has(c));
    const concerns_persistent = [...fromConcerns].filter(c => toConcerns.has(c));

    // ── Adherence metrics ─────────────────────────────────────────────────
    const fromISO = toISODate(fromDate);
    const toISO   = toISODate(toDate);
    const { data: checkinRows } = await supabase
      .from('routine_checkins')
      .select('date, step_id, time_of_day, completed_at, superseded')
      .eq('user_id', userId)
      .eq('superseded', false)
      .gte('date', fromISO)
      .lt('date', toISO);

    const rows = (checkinRows ?? []) as Array<{
      date: string; step_id: string; time_of_day: string; completed_at: string | null;
    }>;

    // Overall adherence
    const totalScheduled = rows.length;
    const totalCompleted = rows.filter(r => r.completed_at !== null).length;
    const adherence_overall = totalScheduled > 0
      ? Math.round((totalCompleted / totalScheduled) * 10_000) / 10_000
      : null;

    // By-category adherence
    const byCat: Record<AdherenceCategory, { scheduled: number; completed: number }> = {
      skin_am: { scheduled: 0, completed: 0 },
      skin_pm: { scheduled: 0, completed: 0 },
      beard:   { scheduled: 0, completed: 0 },
      hair:    { scheduled: 0, completed: 0 },
    };
    for (const r of rows) {
      const cat = stepCategory(r.step_id, r.time_of_day);
      if (!cat) continue;
      byCat[cat].scheduled += 1;
      if (r.completed_at) byCat[cat].completed += 1;
    }
    const adherence_by_category: AdherenceByCategory = {};
    (Object.keys(byCat) as AdherenceCategory[]).forEach(cat => {
      if (byCat[cat].scheduled > 0) {
        adherence_by_category[cat] = Math.round((byCat[cat].completed / byCat[cat].scheduled) * 10_000) / 10_000;
      }
    });

    // Weekly adherence — group rows by Monday start of their date.
    const byWeek = new Map<string, { scheduled: number; completed: number }>();
    for (const r of rows) {
      const [y, m, d] = r.date.split('-').map(Number);
      const week = mondayStartISO(new Date(y, m - 1, d));
      const rec = byWeek.get(week) ?? { scheduled: 0, completed: 0 };
      rec.scheduled += 1;
      if (r.completed_at) rec.completed += 1;
      byWeek.set(week, rec);
    }
    const adherence_weekly: WeeklyAdherencePoint[] = [...byWeek.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([week_start_date, rec]) => ({
        week_start_date,
        pct: rec.scheduled > 0 ? Math.round((rec.completed / rec.scheduled) * 10_000) / 10_000 : 0,
      }));

    // ── Streak metrics ────────────────────────────────────────────────────
    const dailyAdherence: DayAdherence[] = Array.from(
      rows.reduce((map, r) => {
        const rec = map.get(r.date) ?? { scheduled: 0, completed: 0 };
        rec.scheduled += 1;
        if (r.completed_at) rec.completed += 1;
        map.set(r.date, rec);
        return map;
      }, new Map<string, { scheduled: number; completed: number }>()).entries(),
    ).map(([date, rec]) => ({
      date,
      scheduled_count: rec.scheduled,
      completed_count: rec.completed,
    }));

    const streakInfo      = computeStreak(dailyAdherence);
    const streak_longest  = streakInfo.longest_streak;
    const streak_at_rescan = streakInfo.current_streak;
    const freezes_used    = streakInfo.freezes_used;

    // ── Products used ─────────────────────────────────────────────────────
    const { data: kitRows } = await supabase
      .from('user_kit')
      .select('id, product_id, acquired_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .lt('acquired_at', newScan.created_at);

    const kit = (kitRows ?? []) as Array<{ id: string; product_id: string; acquired_at: string }>;

    // Count completions per kit item in the window.
    const completionsByKit = new Map<string, number>();
    const { data: completionRows } = await supabase
      .from('routine_checkins')
      .select('kit_item_id')
      .eq('user_id', userId)
      .eq('superseded', false)
      .not('completed_at', 'is', null)
      .gte('date', fromISO)
      .lt('date', toISO);

    for (const r of (completionRows ?? []) as Array<{ kit_item_id: string | null }>) {
      if (!r.kit_item_id) continue;
      completionsByKit.set(r.kit_item_id, (completionsByKit.get(r.kit_item_id) ?? 0) + 1);
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
