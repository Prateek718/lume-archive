// Supabase data layer for the habit engine. Pure data access — delegates
// all scheduling/computation logic to lib/habit.ts.

import { supabase } from '../lib/supabase';
import {
  ADHERENCE_WINDOW_DAYS,
  expectedDailyAdherence,
  generatePlanSteps,
  stripSlotSuffix,
  type DayAdherence,
  type PlanStepRow,
} from '../lib/habit';
import { checkMilestonesForCheckin } from '../lib/milestones';
import type {
  Scan, HairProfile, HairRoutineStep,
} from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

// What the routine UI needs for a single day.
export interface RoutineDayStep {
  step_key:      string;       // routine_plan_steps.step_key — slot-suffixed for skin
  base_step_key: string;       // step_key with `_am`/`_pm` suffix stripped — picker/kit linking
  time_of_day:   'am' | 'pm' | 'daily';
  step_type:     'maintenance' | 'treatment';
  completed:     boolean;
  completed_at:  string | null;
  scan_id:       string;
  // Frozen at scan finalize on routine_plan_steps.
  label:         string;
  product:       string;
  order:         number;
  category?:           string;
  target_concern?:     string;
  clinical_reasoning?: string;
}

// ─── Date helper ─────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

// Reject writes against dates earlier than yesterday — past days are read-only.
function assertEditableDate(date: string): void {
  const today = todayISO();
  const yesterday = yesterdayISO();
  if (date !== today && date !== yesterday) {
    throw new Error(`Cannot modify check-ins for ${date}. Only today and yesterday are editable.`);
  }
}

// ─── Plan-step persistence ───────────────────────────────────────────────────

export interface WritePlanStepsInput {
  scanId:           string;
  scan:             Scan;
  userHairProfile?: HairProfile | null;
  userHairRoutine?: HairRoutineStep[] | null;
}

export async function writePlanStepsForScan(input: WritePlanStepsInput): Promise<number> {
  const rows: PlanStepRow[] = generatePlanSteps({
    scanId:           input.scanId,
    scan:             input.scan,
    userHairProfile:  input.userHairProfile,
    userHairRoutine:  input.userHairRoutine,
  });
  console.log('[habit-service] generated', rows.length, 'plan_step rows for scan', input.scanId);

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from('routine_plan_steps')
    .upsert(rows, { onConflict: 'scan_id,step_key' });

  if (error) {
    console.error('[habit-service] writePlanStepsForScan upsert error', error);
    throw error;
  }
  return rows.length;
}

// ─── Single completion write ─────────────────────────────────────────────────

export async function recordCompletion(
  userId: string,
  scanId: string,
  stepKey: string,
  date: string,
): Promise<void> {
  assertEditableDate(date);

  const { error } = await supabase
    .from('routine_completions')
    .upsert(
      { user_id: userId, scan_id: scanId, step_key: stepKey, date },
      { onConflict: 'user_id,step_key,date', ignoreDuplicates: true },
    );

  if (error) throw error;

  // Fire-and-forget milestone check — must not block the user's tap.
  void checkMilestonesForCheckin(userId);
}

export async function unrecordCompletion(
  userId: string,
  stepKey: string,
  date: string,
): Promise<void> {
  assertEditableDate(date);

  const { error } = await supabase
    .from('routine_completions')
    .delete()
    .eq('user_id', userId)
    .eq('step_key', stepKey)
    .eq('date', date);

  if (error) throw error;
}

// ─── Active-scan lookup ──────────────────────────────────────────────────────

async function fetchActiveScanId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('scans')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

// ─── Fetch daily adherence (for streak + rolling adherence %) ────────────────

export async function fetchDailyAdherence(
  userId: string,
  windowDays: number = ADHERENCE_WINDOW_DAYS,
): Promise<DayAdherence[]> {
  const from = daysAgoISO(windowDays - 1);
  const to = todayISO();

  const activeScanId = await fetchActiveScanId(userId);
  if (!activeScanId) return [];

  const [planRes, complRes] = await Promise.all([
    supabase
      .from('routine_plan_steps')
      .select('step_key, time_of_day')
      .eq('scan_id', activeScanId),
    supabase
      .from('routine_completions')
      .select('step_key, date')
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', to),
  ]);

  if (planRes.error) throw planRes.error;
  if (complRes.error) throw complRes.error;

  const planSteps = (planRes.data ?? []) as Array<{ step_key: string; time_of_day: 'am' | 'pm' | 'daily' }>;
  const completions = (complRes.data ?? []) as Array<{ step_key: string; date: string }>;

  return expectedDailyAdherence(planSteps, completions, from, to);
}

// ─── Fetch today's routine ───────────────────────────────────────────────────
// Joins the active scan's plan_steps to today's completions in memory.

function categoryBucket(stepKey: string): number {
  if (stepKey.startsWith('skin_'))  return 1;
  if (stepKey.startsWith('beard_')) return 2;
  if (stepKey.startsWith('hair_'))  return 3;
  return 4;
}

export async function fetchTodayRoutine(userId: string): Promise<RoutineDayStep[]> {
  const today = todayISO();

  const activeScanId = await fetchActiveScanId(userId);
  if (!activeScanId) return [];

  const [planRes, doneRes] = await Promise.all([
    supabase
      .from('routine_plan_steps')
      .select('step_key, label, product, category, clinical_reasoning, time_of_day, step_type, target_concern, display_order')
      .eq('scan_id', activeScanId)
      .order('display_order', { ascending: true }),
    supabase
      .from('routine_completions')
      .select('step_key, completed_at')
      .eq('user_id', userId)
      .eq('date', today),
  ]);

  if (planRes.error) throw planRes.error;
  if (doneRes.error) throw doneRes.error;

  const completedByKey = new Map<string, string>();
  for (const row of (doneRes.data ?? []) as Array<{ step_key: string; completed_at: string }>) {
    completedByKey.set(row.step_key, row.completed_at);
  }

  type PlanRow = {
    step_key:           string;
    label:              string;
    product:            string | null;
    category:           string | null;
    clinical_reasoning: string | null;
    time_of_day:        'am' | 'pm' | 'daily';
    step_type:          'maintenance' | 'treatment';
    target_concern:     string | null;
    display_order:      number;
  };

  const rows: RoutineDayStep[] = ((planRes.data ?? []) as PlanRow[]).map((p) => {
    const completedAt = completedByKey.get(p.step_key) ?? null;
    return {
      step_key:           p.step_key,
      base_step_key:      stripSlotSuffix(p.step_key),
      time_of_day:        p.time_of_day,
      step_type:          p.step_type,
      completed:          completedAt !== null,
      completed_at:       completedAt,
      scan_id:            activeScanId,
      label:              p.label,
      product:            p.product ?? '',
      order:              p.display_order,
      category:           p.category ?? undefined,
      target_concern:     p.target_concern ?? undefined,
      clinical_reasoning: p.clinical_reasoning ?? undefined,
    };
  });

  rows.sort((a, b) => {
    const ba = categoryBucket(a.step_key);
    const bb = categoryBucket(b.step_key);
    if (ba !== bb) return ba - bb;
    if (a.order !== b.order) return a.order - b.order;
    return a.step_key.localeCompare(b.step_key);
  });

  return rows;
}

