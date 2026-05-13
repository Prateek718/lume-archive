// Profile dashboard data helpers — read-only aggregations over the user's
// scans, kit, milestones and routine_checkins. Each helper does its own DB
// query so screen mount effects stay thin.

import { supabase } from './supabase';
import { MILESTONES, type MilestoneKey } from './milestones';
import { cardinal } from './utils/numbers';
import { computeStreak } from './habit';
import { fetchDailyAdherence } from '../services/habitService';
import PRODUCTS from '../constants/products.json';

// ─── Catalogue lookup ───────────────────────────────────────────────────────

interface CatalogueProduct {
  id:        string;
  name:      string;
  brand:     string;
  category:  string;
  price_inr: number;
}

const PRODUCT_BY_ID: Map<string, CatalogueProduct> = new Map(
  (PRODUCTS as CatalogueProduct[]).map(p => [p.id, p]),
);

// ─── Date helpers ──────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysFloor(fromISO: string, toMs: number = Date.now()): number {
  return Math.max(0, Math.floor((toMs - new Date(fromISO).getTime()) / MS_PER_DAY));
}

// Signed calendar-day diff (local midnight to local midnight). Negative when
// `toMs` is earlier than `fromIso`. Mirrors the helper on the routine tab so
// "days since scan" is consistent across both screens.
function calendarDaysSince(fromIso: string, toMs: number = Date.now()): number {
  const from = new Date(fromIso);
  const fromYMD = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const to = new Date(toMs);
  const toYMD = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.floor((toYMD - fromYMD) / MS_PER_DAY);
}

export function monthLong(iso: string): string {
  return MONTH_LONG[new Date(iso).getMonth()];
}

export function formatLongDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTH_LONG[d.getMonth()]} ${d.getDate()}`;
}

// "Issue sixteen · cover" → "Issue sixteen". Falls back to "Issue one".
export function stripIssueSuffix(label: string | null | undefined): string {
  if (typeof label !== 'string') return 'Issue one';
  if (label.includes('·')) return label.split('·')[0].trim();
  return label.trim() || 'Issue one';
}

// "Five" / "One" / "Zero" with capitalised first letter.
// Wraps cardinal() from lib/gemini/shared so issue numbers spell out 1–99.
export function cardinalTitle(n: number): string {
  const w = cardinal(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// ─── Stat grid ─────────────────────────────────────────────────────────────

export interface StatGrid {
  days_in:         number;
  adherence_pct:   number;
  streak_days:     number;
  milestone_count: number;
}

export async function computeStatGrid(userId: string): Promise<StatGrid> {
  const [scansRes, milestoneRes, dailyAdherence] = await Promise.all([
    supabase.from('scans')
      .select('id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase.from('user_milestones')
      .select('milestone_key', { count: 'exact', head: true })
      .eq('user_id', userId),
    fetchDailyAdherence(userId).catch(() => []),
  ]);

  const scans = (scansRes.data ?? []) as Array<{ id: string; created_at: string }>;
  const scan_count = scans.length;
  const days_in = scan_count > 0 ? daysFloor(scans[0].created_at) : 0;

  // Adherence over the current issue window (since most-recent-scan). Active
  // scan is the latest by created_at; plan_steps for that scan define
  // scheduledPerDay; expected = scheduledPerDay × windowDays. Completed = the
  // count of routine_completions in the window.
  let adherence_pct = 0;
  if (scan_count > 0) {
    const latestScan = scans[scans.length - 1];
    const windowStartISO = latestScan.created_at.slice(0, 10);
    const todayISOStr = toISODate(new Date());
    const windowDays = Math.max(
      1,
      Math.floor(
        (new Date(todayISOStr + 'T00:00:00').getTime()
          - new Date(windowStartISO + 'T00:00:00').getTime()) / MS_PER_DAY,
      ) + 1,
    );

    const [planRes, complRes] = await Promise.all([
      supabase
        .from('routine_plan_steps')
        .select('step_key')
        .eq('scan_id', latestScan.id),
      supabase
        .from('routine_completions')
        .select('step_key, date')
        .eq('user_id', userId)
        .gte('date', windowStartISO)
        .lte('date', todayISOStr),
    ]);

    const scheduledPerDay = (planRes.data ?? []).length;
    const completed = (complRes.data ?? []).length;
    const expected = scheduledPerDay * windowDays;
    adherence_pct = expected === 0 ? 0 : Math.round((completed / expected) * 100);
  }

  const streak_days = computeStreak(dailyAdherence).current_streak;
  const milestone_count = milestoneRes.count ?? 0;

  return { days_in, adherence_pct, streak_days, milestone_count };
}

// ─── Profile header context ────────────────────────────────────────────────

export interface ProfileHeader {
  name:                  string;
  reading_since_month:   string;   // long month name, e.g. "April"
  current_issue_word:    string;   // cardinal word for current issue (= scan_count, min 1)
  scan_count:            number;
  next_issue_word:       string;   // cardinal word for next issue (= scan_count + 1)
  days_until_next_scan:  number;   // signed; negative when overdue. 0 when no scan yet.
  city:                  string | null;
}

export async function fetchProfileHeader(userId: string): Promise<ProfileHeader> {
  const [userRes, firstScanRes, latestScanRes, accountRes] = await Promise.all([
    supabase.from('users').select('display_name, city').eq('id', userId).single(),
    supabase.from('scans')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1),
    supabase.from('scans')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.from('users').select('created_at').eq('id', userId).single(),
  ]);

  const { data: authData } = await supabase.auth.getUser();
  const email = authData.user?.email ?? '';
  const userRow = userRes.data as { display_name?: string | null; city?: string | null } | null;
  const display = userRow?.display_name?.trim();
  const fallbackName = email.includes('@') ? email.split('@')[0] : 'Friend';
  const name = display && display.length > 0 ? display : fallbackName;
  const cityRaw = userRow?.city?.trim() ?? null;
  const city = cityRaw && cityRaw.length > 0 ? cityRaw : null;

  const firstScans = (firstScanRes.data ?? []) as Array<{ created_at: string }>;
  const latestScans = (latestScanRes.data ?? []) as Array<{ created_at: string }>;
  const accountCreated = (accountRes.data as { created_at?: string } | null)?.created_at ?? null;

  const reading_since_iso = firstScans[0]?.created_at ?? accountCreated;
  const reading_since_month = reading_since_iso ? monthLong(reading_since_iso) : 'today';

  // Scan count for issue numbering.
  const { count: scanCount } = await supabase.from('scans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const scan_count = scanCount ?? 0;
  const current_issue_word = cardinal(Math.max(1, scan_count));
  const next_issue_word    = cardinal(scan_count + 1);

  // 28-day issue window. Negative when the user is past the cycle (overdue).
  // Falls back to 0 when no scan has been taken yet.
  const days_until_next_scan = latestScans[0]
    ? 28 - calendarDaysSince(latestScans[0].created_at)
    : 0;

  return {
    name,
    reading_since_month,
    current_issue_word,
    scan_count,
    next_issue_word,
    days_until_next_scan,
    city,
  };
}

// ─── Kit ───────────────────────────────────────────────────────────────────

export interface KitItem {
  id:         string;
  brand:      string;
  name:       string;
  price:      number | null;     // INR
  size:       string | null;     // pulled from products.json category fallback (no size col)
  image_url:  string | null;     // not in catalogue today — always null
  category:   string | null;
}

export async function fetchKitItems(userId: string): Promise<KitItem[]> {
  const { data, error } = await supabase
    .from('user_kit')
    .select('id, product_id, acquired_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('acquired_at', { ascending: false });
  if (error) {
    console.error('[profileData] fetchKitItems failed', error);
    return [];
  }

  const rows = (data ?? []) as Array<{ id: string; product_id: string }>;
  return rows.map(r => {
    const meta = PRODUCT_BY_ID.get(r.product_id);
    return {
      id:        r.id,
      brand:     meta?.brand ?? '—',
      name:      meta?.name ?? r.product_id,
      price:     meta?.price_inr ?? null,
      size:      null,
      image_url: null,
      category:  meta?.category ?? null,
    };
  });
}

// ─── Adherence per current issue ───────────────────────────────────────────

export interface WeeklyBucket { label: string; pct: number }

export interface AdherenceBreakdown {
  has_scan:        boolean;
  overall_pct:     number;
  weekly:          WeeklyBucket[];
  descriptor:      string;
  note:            string | null;
  current_issue_word: string;
}

function descriptorFor(pct: number): string {
  if (pct >= 85) return 'consistent';
  if (pct >= 70) return 'building';
  if (pct >= 50) return 'picking up';
  return 'fresh start';
}

export async function computeAdherenceForCurrentIssue(userId: string): Promise<AdherenceBreakdown> {
  const { data: scansData } = await supabase.from('scans')
    .select('id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  const scans = (scansData ?? []) as Array<{ id: string; created_at: string }>;

  if (scans.length === 0) {
    return {
      has_scan: false,
      overall_pct: 0,
      weekly: [],
      descriptor: 'fresh start',
      note: null,
      current_issue_word: 'one',
    };
  }

  const latestScan = scans[scans.length - 1];
  const issueStartISO = latestScan.created_at.slice(0, 10);
  const todayISO = toISODate(new Date());

  const [planRes, complRes] = await Promise.all([
    supabase
      .from('routine_plan_steps')
      .select('step_key')
      .eq('scan_id', latestScan.id),
    supabase
      .from('routine_completions')
      .select('step_key, date')
      .eq('user_id', userId)
      .gte('date', issueStartISO)
      .lte('date', todayISO),
  ]);
  if (planRes.error) console.error('[profileData] plan_steps query failed', planRes.error);
  if (complRes.error) console.error('[profileData] completions query failed', complRes.error);

  const scheduledPerDay = (planRes.data ?? []).length;
  const completions = (complRes.data ?? []) as Array<{ step_key: string; date: string }>;

  // Days in the issue window so far (inclusive of today).
  const issueStartMs = new Date(issueStartISO + 'T00:00:00').getTime();
  const todayMs = new Date(todayISO + 'T00:00:00').getTime();
  const issueAgeDays = Math.floor((todayMs - issueStartMs) / MS_PER_DAY);
  const windowDays = Math.max(1, issueAgeDays + 1);

  const expectedTotal = scheduledPerDay * windowDays;
  const completedTotal = completions.length;
  const overall_pct = expectedTotal === 0 ? 0 : Math.round((completedTotal / expectedTotal) * 100);

  // Weekly buckets — 7-day windows ending today.
  // Week 1 = oldest (21–27 days ago), This week = 0–6 days ago.
  // Buckets earlier than the issue start are hidden.
  const weekly: WeeklyBucket[] = [];
  // Build from oldest to newest. Indices: 3 = oldest (week 1), 0 = this week.
  for (let i = 3; i >= 0; i -= 1) {
    const endOffset = i * 7;                       // days ago for end of bucket
    const startOffset = endOffset + 6;             // days ago for start of bucket
    if (startOffset > issueAgeDays && endOffset > issueAgeDays) continue;
    const startMs = todayMs - startOffset * MS_PER_DAY;
    const endMs = todayMs - endOffset * MS_PER_DAY;
    const startISO = toISODate(new Date(startMs));
    const endISO = toISODate(new Date(endMs));
    // Number of days in this bucket that fell within the issue window.
    const bucketStartMs = Math.max(startMs, issueStartMs);
    const bucketDays = Math.max(0, Math.floor((endMs - bucketStartMs) / MS_PER_DAY) + 1);
    let c = 0;
    for (const r of completions) {
      if (r.date >= startISO && r.date <= endISO) {
        c += 1;
      }
    }
    const expected = scheduledPerDay * bucketDays;
    const pct = expected === 0 ? 0 : Math.round((c / expected) * 100);
    const label = i === 0 ? 'This week' : `Week ${4 - i}`;
    weekly.push({ label, pct });
  }

  // Note — surfaced only when there's something contextual to say.
  let note: string | null = null;
  if (overall_pct >= 85) {
    note = 'Consistent. The work is showing.';
  } else if (weekly.length >= 2) {
    const thisWeek = weekly[weekly.length - 1];
    const prev = weekly[weekly.length - 2];
    if (thisWeek.pct > prev.pct + 8) {
      note = `Picking up after ${prev.label.toLowerCase()}'s dip — back on track.`;
    }
  }

  const scan_count = scans.length;
  return {
    has_scan: true,
    overall_pct,
    weekly,
    descriptor: descriptorFor(overall_pct),
    note,
    current_issue_word: cardinal(Math.max(1, scan_count)),
  };
}

// ─── Milestones ────────────────────────────────────────────────────────────

export interface MilestoneRow {
  key:    MilestoneKey;
  label:  string;
  date:   string | null;     // formatted long date for earned, hint for next
}

export interface MilestoneSplit {
  earned: MilestoneRow[];
  next:   MilestoneRow[];
}

const MILESTONE_HINT: Record<MilestoneKey, string> = {
  first_routine:     'Complete a full day',
  week_one:          'Seven days straight',
  consistency_30:    'Thirty-day window',
  first_rescan:      'After your next scan',
  first_improvement: 'When the score moves',
  year_one:          'A year in',
};

export async function fetchMilestones(userId: string): Promise<MilestoneSplit> {
  const { data, error } = await supabase
    .from('user_milestones')
    .select('milestone_key, earned_at')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  if (error) {
    console.error('[profileData] fetchMilestones failed', error);
    return { earned: [], next: [] };
  }

  const earnedRows = (data ?? []) as Array<{ milestone_key: MilestoneKey; earned_at: string }>;
  const earnedKeys = new Set(earnedRows.map(r => r.milestone_key));

  const earned: MilestoneRow[] = earnedRows.map(r => ({
    key:   r.milestone_key,
    label: MILESTONES[r.milestone_key]?.title ?? r.milestone_key,
    date:  formatLongDate(r.earned_at),
  }));

  const next: MilestoneRow[] = (Object.keys(MILESTONES) as MilestoneKey[])
    .filter(k => !earnedKeys.has(k))
    .map(k => ({
      key:   k,
      label: MILESTONES[k].title,
      date:  MILESTONE_HINT[k] ?? '—',
    }));

  return { earned, next };
}

// ─── Scan history ──────────────────────────────────────────────────────────

export interface ScanHistoryRow {
  id:           string;
  issue_label:  string;     // e.g. "Issue sixteen"
  date_long:    string;     // "April 8"
  score:        number | null;
  note:         string;     // "first reading" | "+6 · good progress" | …
  created_at:   string;
}

interface RawScanRow {
  id:              string;
  score_skin:      number | null;
  score_overall:   number | null;
  created_at:      string;
  recommendations: { observation?: { issue_label?: string } } | null;
}

function changeNote(prev: number | null, curr: number | null): string {
  if (prev == null || curr == null) return 'steady';
  const diff = curr - prev;
  const abs = Math.abs(diff);
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  if (abs <= 2) return 'steady';
  if (diff >= 3)  return `${sign}${abs} · good progress`;
  if (diff >= 1)  return `${sign}${abs} · slight improvement`;
  if (diff <= -3) return `${sign}${abs} · careful watch`;
  return `${sign}${abs} · slight dip`;
}

export async function fetchScanHistory(userId: string): Promise<ScanHistoryRow[]> {
  const { data, error } = await supabase
    .from('scans')
    .select('id, score_skin, score_overall, created_at, recommendations')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[profileData] fetchScanHistory failed', error);
    return [];
  }

  const rows = (data ?? []) as RawScanRow[];
  // Walk newest-first. To compute change vs prior we need the immediately
  // older scan — that's the next item in our newest-first list.
  return rows.map((row, i) => {
    const score = row.score_skin ?? row.score_overall;
    const prev = rows[i + 1] ?? null;
    const note = prev
      ? changeNote(prev.score_skin ?? prev.score_overall, score)
      : 'first reading';
    const obsLabel = row.recommendations?.observation?.issue_label ?? null;
    return {
      id:          row.id,
      issue_label: stripIssueSuffix(obsLabel),
      date_long:   formatLongDate(row.created_at),
      score,
      note,
      created_at:  row.created_at,
    };
  });
}

// ─── Latest scan id (used by recommendations historical detection) ──────────

export async function fetchLatestScanId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('scans')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[profileData] fetchLatestScanId failed', error);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}
