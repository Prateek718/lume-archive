// Supabase data layer for the habit engine. Pure data access — delegates
// all scheduling/computation logic to lib/habit.ts.

import { supabase } from '../lib/supabase';
import {
  ADHERENCE_WINDOW_DAYS,
  generateScheduledRows,
  type DayAdherence,
  type ScheduledRow,
} from '../lib/habit';
import type { Scan, HairProfile, HairRoutineStep } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RoutineCheckinRow {
  id:           string;
  user_id:      string;
  scan_id:      string;
  step_id:      string;
  date:         string;               // YYYY-MM-DD
  time_of_day:  'am' | 'pm' | 'weekly' | 'monthly' | 'daily';
  completed_at: string | null;        // ISO timestamp
  kit_item_id:  string | null;
  superseded:   boolean;
}

// What the routine UI needs for a single day.
export interface RoutineDayStep {
  step_id:      string;
  time_of_day:  'am' | 'pm' | 'weekly' | 'monthly' | 'daily';
  completed:    boolean;
  completed_at: string | null;
  kit_item_id:  string | null;
  row_id:       string;       // routine_checkins.id — used for direct updates
}

// ─── Date helper ─────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayISO(): string {
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

// ─── Scheduling ──────────────────────────────────────────────────────────────

export interface ScheduleRoutineInput {
  scanId:           string;
  userId:           string;
  scan:             Scan;
  userHairProfile?: HairProfile | null;
  userHairRoutine?: HairRoutineStep[] | null;
  startDate?:       string;    // defaults to today
  days?:            number;    // defaults to 28
}

export async function scheduleRoutineForScan(input: ScheduleRoutineInput): Promise<number> {
  console.log('[habit-service] scheduleRoutineForScan called with scanId', input.scanId);
  const rows: ScheduledRow[] = generateScheduledRows({
    scanId:           input.scanId,
    userId:           input.userId,
    scan:             input.scan,
    userHairProfile:  input.userHairProfile,
    userHairRoutine:  input.userHairRoutine,
    startDate:        input.startDate ?? todayISO(),
    days:             input.days ?? 28,
  });
  console.log('[habit-service] generated', rows.length, 'rows to insert');

  if (rows.length === 0) return 0;

  // Insert with conflict-ignore on (user_id, step_id, date) — this way a re-run
  // for the same scan is idempotent.
  const { error, count } = await supabase
    .from('routine_checkins')
    .upsert(rows, { onConflict: 'user_id,step_id,date', ignoreDuplicates: true });

  console.log('[habit-service] upsert result:', { error, count });
  if (error) {
    console.error('[habit-service] upsert error', error);
    throw error;
  }
  return rows.length;
}

// ─── Supersede previous-scan rows ────────────────────────────────────────────
// Mark all incomplete future rows from a prior scan as superseded so they no
// longer count toward adherence or appear in today's routine.
export async function supersedePreviousScanRows(
  userId: string,
  previousScanId: string,
  fromDate?: string,
): Promise<number> {
  const cutoff = fromDate ?? todayISO();

  const { data, error } = await supabase
    .from('routine_checkins')
    .update({ superseded: true })
    .eq('user_id', userId)
    .eq('scan_id', previousScanId)
    .eq('superseded', false)
    .is('completed_at', null)
    .gte('date', cutoff)
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

// ─── Single check-in write ───────────────────────────────────────────────────

export async function recordCheckin(
  userId: string,
  stepId: string,
  date: string,
  kitItemId?: string | null,
): Promise<void> {
  assertEditableDate(date);

  const updates: Record<string, unknown> = { completed_at: new Date().toISOString() };
  if (kitItemId !== undefined) updates.kit_item_id = kitItemId;

  const { error } = await supabase
    .from('routine_checkins')
    .update(updates)
    .eq('user_id', userId)
    .eq('step_id', stepId)
    .eq('date', date)
    .eq('superseded', false);

  if (error) throw error;
}

export async function unrecordCheckin(userId: string, stepId: string, date: string): Promise<void> {
  assertEditableDate(date);

  const { error } = await supabase
    .from('routine_checkins')
    .update({ completed_at: null })
    .eq('user_id', userId)
    .eq('step_id', stepId)
    .eq('date', date)
    .eq('superseded', false);

  if (error) throw error;
}

// ─── Bulk "mark all" ─────────────────────────────────────────────────────────

export async function recordBulkCheckin(
  userId: string,
  stepIds: string[],
  date: string,
): Promise<number> {
  assertEditableDate(date);
  if (stepIds.length === 0) return 0;

  const { data, error } = await supabase
    .from('routine_checkins')
    .update({ completed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('date', date)
    .eq('superseded', false)
    .is('completed_at', null)
    .in('step_id', stepIds)
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

// ─── Fetch daily adherence (for streak + rolling adherence %) ────────────────

export async function fetchDailyAdherence(
  userId: string,
  windowDays: number = ADHERENCE_WINDOW_DAYS,
): Promise<DayAdherence[]> {
  const from = daysAgoISO(windowDays - 1);
  const to = todayISO();

  const { data, error } = await supabase
    .from('routine_checkins')
    .select('date, completed_at')
    .eq('user_id', userId)
    .eq('superseded', false)
    .gte('date', from)
    .lte('date', to);

  if (error) throw error;

  // Aggregate per date.
  const byDate = new Map<string, { scheduled: number; completed: number }>();
  for (const row of data ?? []) {
    const rec = byDate.get(row.date) ?? { scheduled: 0, completed: 0 };
    rec.scheduled += 1;
    if (row.completed_at) rec.completed += 1;
    byDate.set(row.date, rec);
  }

  const out: DayAdherence[] = [];
  for (const [date, rec] of byDate) {
    out.push({ date, scheduled_count: rec.scheduled, completed_count: rec.completed });
  }
  return out;
}

// ─── Fetch today's (or a past day's) routine ─────────────────────────────────

async function fetchRoutineForDate(userId: string, date: string): Promise<RoutineDayStep[]> {
  const { data, error } = await supabase
    .from('routine_checkins')
    .select('id, step_id, time_of_day, completed_at, kit_item_id')
    .eq('user_id', userId)
    .eq('date', date)
    .eq('superseded', false)
    .order('time_of_day', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((r) => ({
    step_id:      r.step_id,
    time_of_day:  r.time_of_day as RoutineDayStep['time_of_day'],
    completed:    r.completed_at !== null,
    completed_at: r.completed_at,
    kit_item_id:  r.kit_item_id,
    row_id:       r.id,
  }));
}

export async function fetchTodayRoutine(userId: string): Promise<RoutineDayStep[]> {
  return fetchRoutineForDate(userId, todayISO());
}

export async function fetchPastDayRoutine(userId: string, date: string): Promise<RoutineDayStep[]> {
  return fetchRoutineForDate(userId, date);
}

// ─── Backfill kit_item_id for a step ─────────────────────────────────────────
// When a user adds a product to their kit, link all future + today's rows for
// that step to the kit item. We never rewrite history — only forward-looking rows.
export async function backfillKitItemIdForStep(
  userId: string,
  stepId: string,
  kitItemId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('routine_checkins')
    .update({ kit_item_id: kitItemId })
    .eq('user_id', userId)
    .eq('step_id', stepId)
    .eq('superseded', false)
    .gte('date', todayISO())
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

// ─── Exports for testing / callers that need the helpers ─────────────────────

export { todayISO, yesterdayISO };
