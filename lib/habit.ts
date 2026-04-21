// Pure habit-engine logic. No Supabase calls — everything here is testable in isolation.
// The data layer (services/habitService.ts) handles persistence and calls into these helpers.

import type { Scan, HairProfile, RoutineStep, HairRoutineStep } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

export const ADHERENCE_WINDOW_DAYS = 30;      // rolling window for the adherence %
export const STREAK_THRESHOLD      = 0.60;    // a day counts toward the streak if >=60% of scheduled steps done
export const FREEZE_EARN_RATE      = 7;       // 1 freeze earned per 7 consecutive streak days
export const FREEZE_MAX_BANKED     = 2;       // never bank more than 2 freezes at once

// ─── Types ───────────────────────────────────────────────────────────────────

// Raw per-day data fed in by the caller (services layer aggregates routine_checkins).
export interface DayAdherence {
  date:              string;   // YYYY-MM-DD
  scheduled_count:   number;
  completed_count:   number;
}

export interface StreakInfo {
  current_streak:  number;     // consecutive adherent days ending today (or yesterday if today not yet adherent)
  longest_streak:  number;
  freezes_banked:  number;     // 0..FREEZE_MAX_BANKED
  freezes_used:    number;     // lifetime freezes auto-consumed in this history
}

export interface WeekDay {
  date:         string;                                                 // YYYY-MM-DD
  label:        string;                                                 // single letter: M T W T F S S
  is_today:     boolean;
  is_future:    boolean;
  status:       'adherent' | 'missed' | 'freeze_used' | 'pending' | 'no_data';
  adherence_pct: number;                                                 // 0..100
}

// Output row for generateScheduledRows — ready to insert into routine_checkins.
export interface ScheduledRow {
  user_id:     string;
  scan_id:     string;
  step_id:     string;
  time_of_day: 'am' | 'pm' | 'weekly' | 'monthly' | 'daily';
  date:        string;   // YYYY-MM-DD
}

// ─── Date helpers ────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string): Date {
  // Parse as local midnight to match toISODate's local interpretation.
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / MS_PER_DAY);
}

function dayOfWeekLabel(iso: string): string {
  // Monday=M, Tuesday=T, Wednesday=W, Thursday=T, Friday=F, Saturday=S, Sunday=S
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return letters[parseISODate(iso).getDay()];
}

// ─── Internal: per-day status with freeze bookkeeping ────────────────────────

interface DayStatus {
  date:           string;
  scheduled:      number;
  completed:      number;
  adherence_pct:  number;          // 0..100 (0 if no scheduled)
  had_schedule:   boolean;         // false → day doesn't break streak (e.g. before first scan)
  is_adherent:    boolean;         // scheduled & completion >= threshold
  used_freeze:    boolean;         // a banked freeze was consumed to save streak
  streak_after:   number;          // running streak at end of this day
  freezes_after:  number;          // banked freezes at end of this day
}

function computeDayStatuses(days: DayAdherence[]): DayStatus[] {
  // Sort ascending by date.
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let streak = 0;
  let freezes = 0;
  let totalEarned = 0;

  return sorted.map((d) => {
    const had_schedule = d.scheduled_count > 0;
    const pct = had_schedule ? (d.completed_count / d.scheduled_count) * 100 : 0;
    const is_adherent = had_schedule && pct >= STREAK_THRESHOLD * 100;

    let used_freeze = false;

    if (!had_schedule) {
      // No scheduled steps (e.g. user had no active scan that day) — don't touch the streak.
    } else if (is_adherent) {
      streak += 1;
      // Earn a freeze on every Nth consecutive streak day, capped at the bank max.
      if (streak > 0 && streak % FREEZE_EARN_RATE === 0 && freezes < FREEZE_MAX_BANKED) {
        freezes += 1;
        totalEarned += 1;
      }
    } else if (freezes > 0) {
      // Consume a freeze to preserve the streak. Don't increment streak — freeze holds it.
      freezes -= 1;
      used_freeze = true;
    } else {
      // Miss with no freezes — streak resets.
      streak = 0;
    }

    return {
      date:           d.date,
      scheduled:      d.scheduled_count,
      completed:      d.completed_count,
      adherence_pct:  Math.round(pct),
      had_schedule,
      is_adherent,
      used_freeze,
      streak_after:   streak,
      freezes_after:  freezes,
    };
  });
}

// ─── Public: streak ──────────────────────────────────────────────────────────

export function computeStreak(dailyAdherence: DayAdherence[]): StreakInfo {
  if (dailyAdherence.length === 0) {
    return { current_streak: 0, longest_streak: 0, freezes_banked: 0, freezes_used: 0 };
  }

  const statuses = computeDayStatuses(dailyAdherence);
  const last = statuses[statuses.length - 1];

  let longest = 0;
  let freezes_used = 0;
  for (const s of statuses) {
    if (s.streak_after > longest) longest = s.streak_after;
    if (s.used_freeze) freezes_used += 1;
  }

  return {
    current_streak: last.streak_after,
    longest_streak: longest,
    freezes_banked: last.freezes_after,
    freezes_used,
  };
}

// ─── Public: week strip ──────────────────────────────────────────────────────

export function buildWeekStrip(dailyAdherence: DayAdherence[], today: string): WeekDay[] {
  const statuses = computeDayStatuses(dailyAdherence);
  const byDate = new Map<string, DayStatus>();
  for (const s of statuses) byDate.set(s.date, s);

  const out: WeekDay[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const date = addDays(today, offset);
    const st = byDate.get(date);
    const is_today = offset === 0;

    let status: WeekDay['status'];
    let pct = 0;

    if (!st || !st.had_schedule) {
      status = 'no_data';
    } else if (st.used_freeze) {
      status = 'freeze_used';
      pct = st.adherence_pct;
    } else if (st.is_adherent) {
      status = 'adherent';
      pct = st.adherence_pct;
    } else if (is_today) {
      status = 'pending';    // today's misses aren't final yet
      pct = st.adherence_pct;
    } else {
      status = 'missed';
      pct = st.adherence_pct;
    }

    out.push({
      date,
      label:         dayOfWeekLabel(date),
      is_today,
      is_future:     false,
      status,
      adherence_pct: pct,
    });
  }
  return out;
}

// ─── Public: rolling adherence % ─────────────────────────────────────────────

export function computeRollingAdherence(dailyAdherence: DayAdherence[]): number {
  if (dailyAdherence.length === 0) return 0;

  // Consider only the most recent ADHERENCE_WINDOW_DAYS days that had a schedule.
  const sorted = [...dailyAdherence].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const windowed: DayAdherence[] = [];
  for (const d of sorted) {
    if (d.scheduled_count > 0) {
      windowed.push(d);
      if (windowed.length >= ADHERENCE_WINDOW_DAYS) break;
    }
  }

  if (windowed.length === 0) return 0;

  let scheduled = 0;
  let completed = 0;
  for (const d of windowed) {
    scheduled += d.scheduled_count;
    completed += d.completed_count;
  }
  if (scheduled === 0) return 0;
  return Math.round((completed / scheduled) * 100);
}

// ─── Scheduling: wash-frequency parsing ──────────────────────────────────────

// Map enum / free text to an integer number of days between washes.
// Defaults to 2 if unknown.
function washFrequencyDays(freq: string | undefined | null): number {
  if (!freq) return 2;

  // Known enum values first.
  switch (freq) {
    case 'daily':             return 1;
    case 'every_2_3_days':    return 2;
    case 'once_a_week':       return 7;
    case 'less_than_weekly':  return 10;
  }

  // Liberal string fallback for legacy / free-text values.
  const f = freq.toLowerCase();
  if (f.includes('daily') || f.includes('every day') || f.includes('1 day')) return 1;
  if (f.includes('alternate') || f.includes('every other')) return 2;
  if (f.includes('2-3') || f.includes('2 to 3')) return 2;
  if (f.includes('3-4') || f.includes('3 to 4')) return 3;
  if (f.includes('twice a week') || f.includes('2x') || f.includes('2 times')) return 3;
  if (f.includes('once a week') || f.includes('weekly') || f.includes('1x')) return 7;
  if (f.includes('fortnight') || f.includes('two weeks')) return 14;
  if (f.includes('less than')) return 10;
  return 2;
}

// ─── Scheduling: beard defaults ──────────────────────────────────────────────
// BeardRecommendation has no structured routine. We use fixed defaults when a
// user has non-zero beard density.
const BEARD_DEFAULT_STEPS = [
  { step_id: 'beard_wash', time_of_day: 'daily' as const, cadence: 'every_wash' as const },  // follows hair wash rhythm
  { step_id: 'beard_oil',  time_of_day: 'pm'    as const, cadence: 'daily'      as const },
  { step_id: 'beard_balm', time_of_day: 'am'    as const, cadence: 'daily'      as const },
];

// ─── Public: generate scheduled rows for a scan ──────────────────────────────

export interface GenerateScheduleInput {
  scanId:          string;
  userId:          string;
  scan:            Scan;
  userHairProfile?: HairProfile | null;
  userHairRoutine?: HairRoutineStep[] | null;   // typically user.hair_recommendations.routine
  startDate:       string;    // YYYY-MM-DD — first day to schedule (usually today)
  days?:           number;    // how many days to pre-generate; defaults to 28
}

export function generateScheduledRows(input: GenerateScheduleInput): ScheduledRow[] {
  const {
    scanId,
    userId,
    scan,
    userHairProfile,
    userHairRoutine,
    startDate,
    days = 28,
  } = input;

  const rows: ScheduledRow[] = [];

  const skinMorning: RoutineStep[] = scan.recommendations?.skin?.routine?.morning ?? [];
  const skinEvening: RoutineStep[] = scan.recommendations?.skin?.routine?.evening ?? [];
  console.log('[habit-gen] inputs:', {
    hasRecommendations: !!scan.recommendations,
    skinMorningCount:   skinMorning.length,
    skinEveningCount:   skinEvening.length,
    beard_density:      scan.beard_density,
    userHairProfilePresent: !!userHairProfile,
    userHairRoutineCount:   (userHairRoutine ?? []).length,
  });

  // Skip makeup_* entirely — makeup is not tracked.
  // Also skip items with a missing step_id (data-quality guard — legacy scans
  // or partial Gemini output may lack this field even though the type says it's required).
  const isTrackedSkin = (s: RoutineStep, src: string) => {
    if (!s.step_id) {
      console.log('[habit-gen] skipping skin step without step_id', { src, step: s });
      return false;
    }
    return !s.step_id.startsWith('makeup_');
  };

  const trackedMorning = skinMorning.filter((s) => isTrackedSkin(s, 'morning'));
  const trackedEvening = skinEvening.filter((s) => isTrackedSkin(s, 'evening'));

  const hasBeard = scan.beard_density && scan.beard_density !== 'none';
  const washFreqDays = washFrequencyDays(userHairProfile?.wash_frequency);

  const hairSteps: HairRoutineStep[] = (userHairRoutine ?? []).filter((s) => {
    if (!s.step_id) {
      console.log('[habit-gen] skipping hair step without step_id', { step: s });
      return false;
    }
    return !s.step_id.startsWith('makeup_');
  });

  for (let i = 0; i < days; i += 1) {
    const date = addDays(startDate, i);
    const dayOffset = i;                                    // 0-based offset from startDate
    const isWashDay = dayOffset % washFreqDays === 0;       // wash days anchored to startDate

    // Skin AM — every day
    for (const s of trackedMorning) {
      rows.push({ user_id: userId, scan_id: scanId, step_id: s.step_id, time_of_day: 'am', date });
    }
    // Skin PM — every day
    for (const s of trackedEvening) {
      rows.push({ user_id: userId, scan_id: scanId, step_id: s.step_id, time_of_day: 'pm', date });
    }

    // Beard — daily steps always, beard_wash only on wash days
    if (hasBeard) {
      for (const b of BEARD_DEFAULT_STEPS) {
        if (b.step_id === 'beard_wash' && !isWashDay) continue;
        rows.push({
          user_id:     userId,
          scan_id:     scanId,
          step_id:     b.step_id,
          time_of_day: b.time_of_day,
          date,
        });
      }
    }

    // Hair — cadence-aware
    for (const h of hairSteps) {
      let schedule = false;
      let time_of_day: ScheduledRow['time_of_day'] = 'daily';

      if (h.cadence === 'every_wash') {
        schedule = isWashDay;
        time_of_day = 'daily';
      } else if (h.cadence === 'weekly') {
        schedule = dayOffset % 7 === 0;
        time_of_day = 'weekly';
      } else if (h.cadence === 'monthly') {
        schedule = dayOffset % 30 === 0;
        time_of_day = 'monthly';
      }

      if (schedule) {
        rows.push({
          user_id:     userId,
          scan_id:     scanId,
          step_id:     h.step_id,
          time_of_day,
          date,
        });
      }
    }
  }

  if (rows.length === 0) {
    console.warn('[habit-gen] returning 0 rows — reasons:', {
      noRecommendations:   !scan.recommendations,
      noSkinMorning:       skinMorning.length === 0,
      noSkinEvening:       skinEvening.length === 0,
      noBeard:             !hasBeard,
      noHairRoutine:       hairSteps.length === 0,
    });
    // Sanity check: if we were given skin routine items but produced nothing,
    // something upstream (step_id missing, all filtered as makeup, etc.) ate them.
    if (skinMorning.length > 0 || skinEvening.length > 0) {
      console.warn(
        '[habit-gen] skin routine was present but produced 0 rows — ' +
        'check for missing step_id or all steps filtered as makeup',
        { skinMorningRaw: skinMorning, skinEveningRaw: skinEvening },
      );
    }
  }

  return rows;
}
