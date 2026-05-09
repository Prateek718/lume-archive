// Pure habit-engine logic. No Supabase calls — everything here is testable in isolation.
// The data layer (services/habitService.ts) handles persistence and calls into these helpers.

import type { Scan, HairProfile, RoutineStep, HairRoutineStep } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

export const ADHERENCE_WINDOW_DAYS = 30;      // rolling window for the adherence %
export const STREAK_THRESHOLD      = 0.60;    // a day counts toward the streak if >=60% of scheduled steps done
export const FREEZE_EARN_RATE      = 7;       // 1 freeze earned per 7 consecutive streak days
export const FREEZE_MAX_BANKED     = 2;       // never bank more than 2 freezes at once

// ─── Types ───────────────────────────────────────────────────────────────────

// Raw per-day data fed in by the caller (services layer aggregates routine_completions).
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

// One row of the new prescription table — written once at scan finalize.
export interface PlanStepRow {
  user_id:            string;             // denormalised from scans.user_id
  scan_id:            string;
  step_key:           string;             // canonical, slot-suffixed for skin
  label:              string;
  product:            string | null;
  category:           string | null;
  clinical_reasoning: string | null;
  time_of_day:        'am' | 'pm' | 'daily';
  step_type:          'maintenance' | 'treatment';
  target_concern:     string | null;
  display_order:      number;
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

// ─── step_key canonicalisation ───────────────────────────────────────────────
// Drives plan-step generation. The Set lookup pattern matches lib/gemini/skin.ts
// `normalizeConcern` — taxonomy lives in the JS bundle, not a CHECK constraint.

const CANONICAL_SKIN_STEPS = new Set<string>([
  'skin_cleanse',
  'skin_treat_1',
  'skin_treat_2',
  'skin_moisturize',
  'skin_protect',
]);

const CANONICAL_HAIR_STEPS = new Set<string>([
  'hair_shampoo',
  'hair_conditioner',
  'hair_oil',
  'hair_serum',
  'hair_mask',
]);

const CANONICAL_BEARD_STEPS = new Set<string>([
  'beard_wash',
  'beard_oil',
  'beard_balm',
]);

export function isCanonicalStepId(stepId: string): boolean {
  return (
    CANONICAL_SKIN_STEPS.has(stepId) ||
    CANONICAL_HAIR_STEPS.has(stepId) ||
    CANONICAL_BEARD_STEPS.has(stepId)
  );
}

// Build the slot-suffixed step_key for a skin step. Returns null on a
// non-canonical id or invalid slot. Beard/hair steps don't get suffixed and
// callers should use the bare step_id as the step_key.
export function canonicalSlottedStepKey(stepId: string, slot: 'am' | 'pm'): string | null {
  if (!CANONICAL_SKIN_STEPS.has(stepId)) return null;
  if (slot !== 'am' && slot !== 'pm') return null;
  return `${stepId}_${slot}`;
}

// Strip the `_am` / `_pm` slot suffix added at plan-gen time for skin keys.
// Returns input unchanged for hair/beard keys (which are unsuffixed).
export function stripSlotSuffix(stepKey: string): string {
  if (!stepKey.startsWith('skin_')) return stepKey;
  if (stepKey.endsWith('_am') || stepKey.endsWith('_pm')) {
    return stepKey.slice(0, -3);
  }
  return stepKey;
}

// ─── step_type mapping ───────────────────────────────────────────────────────
// A step is a treatment iff it carries a target_concern. Future-proof against
// `skin_treat_3+` and lets hair/beard become treatments if Gemini emits one.

export function mapStepType(step: { target_concern?: string | null }): 'maintenance' | 'treatment' {
  return step.target_concern ? 'treatment' : 'maintenance';
}

// ─── Plan-step generation ────────────────────────────────────────────────────

export interface GeneratePlanStepsInput {
  scanId:           string;
  scan:             Scan;
  userHairProfile?: HairProfile | null;
  userHairRoutine?: HairRoutineStep[] | null;   // user.hair_recommendations.routine
}

// Resolve the time_of_day slots for a skin step. New-schema steps carry an
// explicit array. If missing, default to both slots.
function resolveSkinTimeOfDay(step: RoutineStep): ('am' | 'pm')[] {
  if (Array.isArray(step.time_of_day) && step.time_of_day.length > 0) {
    return step.time_of_day;
  }
  return ['am', 'pm'];
}

export function generatePlanSteps(input: GeneratePlanStepsInput): PlanStepRow[] {
  const { scanId, scan, userHairRoutine } = input;
  const userId = scan.user_id;
  const rows: PlanStepRow[] = [];

  // ── Skin ──────────────────────────────────────────────────────────────────
  const skinSteps: RoutineStep[] = scan.recommendations?.skin?.steps ?? [];
  for (const step of skinSteps) {
    if (!step.step_id || !CANONICAL_SKIN_STEPS.has(step.step_id)) {
      console.warn('[habit-gen] dropping skin step with non-canonical step_id', {
        step_id: step.step_id,
        scan_id: scanId,
      });
      continue;
    }
    const slots = resolveSkinTimeOfDay(step);
    for (const slot of slots) {
      const stepKey = canonicalSlottedStepKey(step.step_id, slot);
      if (!stepKey) continue;
      rows.push({
        user_id:            userId,
        scan_id:            scanId,
        step_key:           stepKey,
        label:              step.label,
        product:            step.product ?? null,
        category:           step.category ?? null,
        clinical_reasoning: step.clinical_reasoning ?? null,
        time_of_day:        slot,
        step_type:          mapStepType(step),
        target_concern:     step.target_concern ?? null,
        display_order:      step.order ?? 999,
      });
    }
  }

  // ── Beard ─────────────────────────────────────────────────────────────────
  // Per plan §2.1: read recommendations.beard.steps; if absent, write nothing.
  // No hardcoded BEARD_DEFAULT_STEPS. All beard steps land as time_of_day='daily'.
  const beardRecs = scan.recommendations?.beard as { steps?: RoutineStep[] } | null | undefined;
  for (const step of beardRecs?.steps ?? []) {
    if (!step.step_id || !CANONICAL_BEARD_STEPS.has(step.step_id)) {
      console.warn('[habit-gen] dropping beard step with non-canonical step_id', {
        step_id: step.step_id,
        scan_id: scanId,
      });
      continue;
    }
    rows.push({
      user_id:            userId,
      scan_id:            scanId,
      step_key:           step.step_id,
      label:              step.label,
      product:            step.product ?? null,
      category:           step.category ?? null,
      clinical_reasoning: step.clinical_reasoning ?? null,
      time_of_day:        'daily',
      step_type:          mapStepType(step),
      target_concern:     step.target_concern ?? null,
      display_order:      step.order ?? 999,
    });
  }

  // ── Hair ──────────────────────────────────────────────────────────────────
  // Per plan §2.1: every hair step is time_of_day='daily' regardless of cadence.
  // Cadence translation (every_wash / weekly / monthly) deferred to Phase XIII.
  for (const step of userHairRoutine ?? []) {
    if (!step.step_id || !CANONICAL_HAIR_STEPS.has(step.step_id)) {
      console.warn('[habit-gen] dropping hair step with non-canonical step_id', {
        step_id: step.step_id,
        scan_id: scanId,
      });
      continue;
    }
    rows.push({
      user_id:            userId,
      scan_id:            scanId,
      step_key:           step.step_id,
      label:              step.label,
      product:            step.product ?? null,
      category:           step.category ?? null,
      clinical_reasoning: step.clinical_reasoning ?? null,
      time_of_day:        'daily',
      step_type:          'maintenance',  // hair never carries target_concern today
      target_concern:     null,
      display_order:      step.order ?? 999,
    });
  }

  if (rows.length === 0) {
    console.warn('[habit-gen] generatePlanSteps returning 0 rows', {
      scan_id:        scanId,
      hasSkin:        skinSteps.length > 0,
      hasBeardSteps:  Array.isArray(beardRecs?.steps) && (beardRecs?.steps?.length ?? 0) > 0,
      hasHairRoutine: (userHairRoutine ?? []).length > 0,
    });
  }

  return rows;
}

// ─── Daily adherence synthesiser ─────────────────────────────────────────────
// Computes the per-day DayAdherence struct that the streak/week-strip math
// expects, from the new (planSteps, completions) shape. Daily-only — no
// weekly handling, no replay, no buckets.

export function expectedDailyAdherence(
  planSteps: Pick<PlanStepRow, 'step_key' | 'time_of_day'>[],
  completions: { step_key: string; date: string }[],
  windowStart: string,                    // local-tz YMD, inclusive
  windowEnd:   string,                    // local-tz YMD, inclusive
): DayAdherence[] {
  const scheduledPerDay = planSteps.length;

  const byDate = new Map<string, Set<string>>();
  for (const c of completions) {
    let s = byDate.get(c.date);
    if (!s) {
      s = new Set();
      byDate.set(c.date, s);
    }
    s.add(c.step_key);
  }

  const out: DayAdherence[] = [];
  const span = daysBetween(windowStart, windowEnd);
  for (let i = 0; i <= span; i += 1) {
    const date = addDays(windowStart, i);
    out.push({
      date,
      scheduled_count: scheduledPerDay,
      completed_count: byDate.get(date)?.size ?? 0,
    });
  }
  return out;
}
