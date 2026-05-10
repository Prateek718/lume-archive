// Milestones engine — quiet celebrations of real behavioural/outcome progress.
// Six definitions in v1, no gamification loops. Earn once, celebrate once.

import { supabase } from './supabase';

// ─── Definitions ────────────────────────────────────────────────────────────

export const MILESTONES = {
  first_routine: {
    key:   'first_routine',
    title: 'First routine complete',
    copy:  "Done! First routine complete. That's how it starts.",
  },
  week_one: {
    key:   'week_one',
    title: 'Seven days straight',
    copy:  "Seven days straight. You've got this.",
  },
  consistency_30: {
    key:   'consistency_30',
    title: 'Thirty days of consistency',
    copy:  "Thirty days. You're not 'trying' to have a routine — you have one.",
  },
  first_rescan: {
    key:   'first_rescan',
    title: 'Second scan complete',
    copy:  "Second scan done. Now we can actually see what's changing.",
  },
  first_improvement: {
    key:   'first_improvement',
    title: 'Score improved',
    copy:  "Look at that — your skin score is up {delta} points.",
  },
  year_one: {
    key:   'year_one',
    title: 'A year with Lumé',
    copy:  "A year with Lumé. Not bad at all.",
  },
} as const;

export type MilestoneKey = keyof typeof MILESTONES;

// Row shape in user_milestones (plus a convenience `definition` for UI).
export interface EarnedMilestone {
  id:            string;
  milestone_key: MilestoneKey;
  earned_at:     string;
  context:       Record<string, unknown>;
  celebrated:    boolean;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

async function fetchEarnedKeys(userId: string): Promise<Set<MilestoneKey>> {
  const { data, error } = await supabase
    .from('user_milestones')
    .select('milestone_key')
    .eq('user_id', userId);
  if (error) {
    console.error('[milestones] fetchEarnedKeys failed', error);
    return new Set();
  }
  return new Set(((data ?? []) as Array<{ milestone_key: string }>).map(r => r.milestone_key as MilestoneKey));
}

async function insertMilestone(
  userId: string,
  key: MilestoneKey,
  context: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase
    .from('user_milestones')
    .insert({ user_id: userId, milestone_key: key, context, celebrated: false });
  if (error) {
    // Duplicate key is safe to ignore — the UNIQUE (user_id, milestone_key)
    // constraint makes repeated calls idempotent.
    if (!String(error.message ?? '').toLowerCase().includes('duplicate')) {
      console.error('[milestones] insertMilestone failed', { key, error });
    }
  }
}

// ─── Adherence aggregation over routine_completions + plan_steps ────────────

interface DayRow { date: string; scheduled: number; completed: number }

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function fetchDailyAdherenceWindow(
  userId: string,
  fromISO: string,
): Promise<DayRow[]> {
  // Active scan = (user_id, max(created_at)). Plan_steps for that scan define
  // scheduledPerDay; every plan_step is in scope every day under the new model.
  const { data: scanRow, error: scanErr } = await supabase
    .from('scans')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (scanErr) {
    console.error('[milestones] active scan fetch failed', scanErr);
    return [];
  }
  const activeScanId = (scanRow?.id as string | undefined) ?? null;
  if (!activeScanId) return [];

  const [planRes, complRes] = await Promise.all([
    supabase
      .from('routine_plan_steps')
      .select('step_key')
      .eq('scan_id', activeScanId),
    supabase
      .from('routine_completions')
      .select('step_key, date')
      .eq('user_id', userId)
      .gte('date', fromISO),
  ]);

  if (planRes.error) {
    console.error('[milestones] plan_steps fetch failed', planRes.error);
    return [];
  }
  if (complRes.error) {
    console.error('[milestones] completions fetch failed', complRes.error);
    return [];
  }

  const scheduledPerDay = (planRes.data ?? []).length;
  if (scheduledPerDay === 0) return [];

  const completionsByDate = new Map<string, Set<string>>();
  for (const c of (complRes.data ?? []) as Array<{ step_key: string; date: string }>) {
    let s = completionsByDate.get(c.date);
    if (!s) {
      s = new Set();
      completionsByDate.set(c.date, s);
    }
    s.add(c.step_key);
  }

  // Walk every day in [fromISO, todayISO] so empty days appear with completed=0.
  const out: DayRow[] = [];
  const today = todayISO();
  let cur = fromISO;
  while (cur <= today) {
    out.push({
      date:      cur,
      scheduled: scheduledPerDay,
      completed: completionsByDate.get(cur)?.size ?? 0,
    });
    cur = addDaysISO(cur, 1);
  }
  return out;
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// A day is "adherent" if >=60% of its scheduled steps were completed.
function isAdherentDay(d: DayRow): boolean {
  if (d.scheduled === 0) return false;
  return d.completed / d.scheduled >= 0.6;
}

// Longest consecutive run of adherent days ending in the window.
function longestConsecutiveAdherent(days: DayRow[]): number {
  if (days.length === 0) return 0;
  // Fill in missing dates as non-adherent so gaps break streaks.
  const byDate = new Map(days.map(d => [d.date, d]));
  const start = days[0].date;
  const end   = days[days.length - 1].date;
  let cur = start;
  let run = 0;
  let best = 0;
  while (cur <= end) {
    const row = byDate.get(cur);
    if (row && isAdherentDay(row)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
    cur = addDaysISO(cur, 1);
  }
  return best;
}

// Check whether any sliding 30-day window in the given days has >=70% avg
// adherence across that window (scheduled-weighted).
function has30DayWindowAbove70(days: DayRow[]): boolean {
  if (days.length < 30) return false;
  // Build contiguous-day array by filling gaps.
  const byDate = new Map(days.map(d => [d.date, d]));
  const start = days[0].date;
  const end   = days[days.length - 1].date;
  const contiguous: DayRow[] = [];
  let cur = start;
  while (cur <= end) {
    contiguous.push(byDate.get(cur) ?? { date: cur, scheduled: 0, completed: 0 });
    cur = addDaysISO(cur, 1);
  }
  if (contiguous.length < 30) return false;
  for (let i = 0; i + 30 <= contiguous.length; i += 1) {
    let scheduled = 0, completed = 0;
    for (let j = i; j < i + 30; j += 1) {
      scheduled += contiguous[j].scheduled;
      completed += contiguous[j].completed;
    }
    if (scheduled > 0 && completed / scheduled >= 0.7) return true;
  }
  return false;
}

// ─── Public: check-in-triggered milestones ──────────────────────────────────

export async function checkMilestonesForCheckin(userId: string): Promise<void> {
  try {
    const earned = await fetchEarnedKeys(userId);
    const needFirst  = !earned.has('first_routine');
    const needWeek   = !earned.has('week_one');
    const needThirty = !earned.has('consistency_30');
    if (!needFirst && !needWeek && !needThirty) return;

    // Pull 45 days of history — enough to evaluate the 30-day window.
    const days = await fetchDailyAdherenceWindow(userId, daysAgoISO(45));

    // first_routine: any day where all scheduled steps completed.
    if (needFirst) {
      const hit = days.some(d => d.scheduled > 0 && d.completed >= d.scheduled);
      if (hit) await insertMilestone(userId, 'first_routine');
    }

    // week_one: 7 consecutive adherent days.
    if (needWeek) {
      if (longestConsecutiveAdherent(days) >= 7) {
        await insertMilestone(userId, 'week_one');
      }
    }

    // consistency_30: a 30-day window with >=70% aggregate adherence.
    if (needThirty) {
      if (has30DayWindowAbove70(days)) {
        await insertMilestone(userId, 'consistency_30');
      }
    }
  } catch (err) {
    console.error('[milestones] checkMilestonesForCheckin failed', err);
  }
}

// ─── Public: scan-triggered milestones ──────────────────────────────────────

export async function checkMilestonesForScan(userId: string, newScanId: string): Promise<void> {
  try {
    const earned = await fetchEarnedKeys(userId);
    const needRescan      = !earned.has('first_rescan');
    const needImprovement = !earned.has('first_improvement');
    const needYear        = !earned.has('year_one');
    if (!needRescan && !needImprovement && !needYear) return;

    const { data: scans, error } = await supabase
      .from('scans')
      .select('id, score_skin, score_overall, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[milestones] checkMilestonesForScan fetch scans failed', error);
      return;
    }
    const rows = (scans ?? []) as Array<{
      id: string; score_skin: number | null; score_overall: number | null; created_at: string;
    }>;

    // first_rescan: this is the user's 2nd scan or later.
    if (needRescan && rows.length >= 2) {
      await insertMilestone(userId, 'first_rescan');
    }

    // first_improvement: new scan's skin score higher than the previous scan's.
    if (needImprovement && rows.length >= 2) {
      const newRow  = rows.find(r => r.id === newScanId);
      const prevRow = rows[rows.length - 2]; // second-to-last after sort asc
      if (newRow && prevRow && newRow.id !== prevRow.id) {
        const newSkin  = newRow.score_skin ?? newRow.score_overall;
        const prevSkin = prevRow.score_skin ?? prevRow.score_overall;
        if (newSkin != null && prevSkin != null && newSkin > prevSkin) {
          await insertMilestone(userId, 'first_improvement', { delta: newSkin - prevSkin });
        }
      }
    }

    // year_one: 365+ days since first scan.
    if (needYear && rows.length >= 1) {
      const first = rows[0];
      const ageMs = Date.now() - new Date(first.created_at).getTime();
      if (ageMs >= 365 * 24 * 60 * 60 * 1000) {
        await insertMilestone(userId, 'year_one');
      }
    }
  } catch (err) {
    console.error('[milestones] checkMilestonesForScan failed', err);
  }
}

// ─── Public: app-open milestones (time-only) ────────────────────────────────

export async function checkMilestonesOnAppOpen(userId: string): Promise<void> {
  try {
    const earned = await fetchEarnedKeys(userId);
    if (earned.has('year_one')) return;

    const { data, error } = await supabase
      .from('scans')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) {
      console.error('[milestones] checkMilestonesOnAppOpen fetch scan failed', error);
      return;
    }
    const first = (data ?? [])[0] as { created_at: string } | undefined;
    if (!first) return;
    const ageMs = Date.now() - new Date(first.created_at).getTime();
    if (ageMs >= 365 * 24 * 60 * 60 * 1000) {
      await insertMilestone(userId, 'year_one');
    }
  } catch (err) {
    console.error('[milestones] checkMilestonesOnAppOpen failed', err);
  }
}

// ─── Public: fetch + mark celebrated ───────────────────────────────────────

export async function fetchUncelebratedMilestones(userId: string): Promise<EarnedMilestone[]> {
  try {
    const { data, error } = await supabase
      .from('user_milestones')
      .select('id, milestone_key, earned_at, context, celebrated')
      .eq('user_id', userId)
      .eq('celebrated', false)
      .order('earned_at', { ascending: true });
    if (error) {
      console.error('[milestones] fetchUncelebratedMilestones failed', error);
      return [];
    }
    return (data ?? []) as EarnedMilestone[];
  } catch (err) {
    console.error('[milestones] fetchUncelebratedMilestones failed', err);
    return [];
  }
}

export async function fetchAllMilestones(userId: string): Promise<EarnedMilestone[]> {
  try {
    const { data, error } = await supabase
      .from('user_milestones')
      .select('id, milestone_key, earned_at, context, celebrated')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false });
    if (error) {
      console.error('[milestones] fetchAllMilestones failed', error);
      return [];
    }
    return (data ?? []) as EarnedMilestone[];
  } catch (err) {
    console.error('[milestones] fetchAllMilestones failed', err);
    return [];
  }
}

export async function markMilestoneCelebrated(
  userId: string,
  milestoneKey: MilestoneKey,
): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_milestones')
      .update({ celebrated: true })
      .eq('user_id', userId)
      .eq('milestone_key', milestoneKey);
    if (error) console.error('[milestones] markMilestoneCelebrated failed', error);
  } catch (err) {
    console.error('[milestones] markMilestoneCelebrated failed', err);
  }
}

// ─── Public: copy interpolation ─────────────────────────────────────────────

// Replaces {delta} (and similar placeholders) in a milestone's copy with
// values from its stored context. Unknown tokens are left alone.
export function interpolateCopy(copy: string, context: Record<string, unknown>): string {
  return copy.replace(/\{(\w+)\}/g, (match, key) => {
    const v = context[key];
    return v == null ? match : String(v);
  });
}
