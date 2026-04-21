// Supabase data layer for the habit engine. Pure data access — delegates
// all scheduling/computation logic to lib/habit.ts.

import { supabase } from '../lib/supabase';
import {
  ADHERENCE_WINDOW_DAYS,
  generateScheduledRows,
  type DayAdherence,
  type ScheduledRow,
} from '../lib/habit';
import { checkMilestonesForCheckin } from '../lib/milestones';
import type {
  Scan, HairProfile, HairRoutineStep, HairRecommendations,
  Recommendations, RoutineStep,
} from '../types';

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
  step_id:      string;       // routine_checkins.step_id — slot-suffixed for skin steps
  base_step_id: string;       // step_id with `_am`/`_pm` suffix stripped — used for grouping cards + picker/kit linking
  time_of_day:  'am' | 'pm' | 'weekly' | 'monthly' | 'daily';
  completed:    boolean;
  completed_at: string | null;
  kit_item_id:  string | null;
  row_id:       string;       // routine_checkins.id — used for direct updates
  scan_id:      string;
  // Joined from the scan's recommendations (or hair_recommendations for hair_*).
  // Beard steps fall back to hardcoded defaults — BeardRecommendation has no
  // structured routine. Always present after fetchRoutineForDate.
  label:        string;
  product:      string;
  order:        number;       // sort key within a category bucket; 999 if unknown
  // Phase D fields (new prescription schema). Optional for back-compat with legacy scans.
  category?:           string;            // canonical category id (face_cleanser, serum_niacinamide, …)
  target_concern?:     string;            // populated only for Treat steps (e.g. 'acne')
  clinical_reasoning?: string;            // 1–2 sentences tying step to user's scan
  time_of_day_array?:  ('am' | 'pm')[];   // original slots from scan recommendations (skin only); used by UI to render AM/PM checkboxes per card
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

  // Fire-and-forget milestone check — must not block the user's check-in.
  void checkMilestonesForCheckin(userId);
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

  void checkMilestonesForCheckin(userId);
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

// Stable sort buckets so the list never re-shuffles between fetches.
// Buckets: skin → beard → hair. Within skin we no longer split AM/PM at the
// data layer (combined cards group both slots into one row).
function categoryBucket(stepId: string): number {
  if (stepId.startsWith('skin_'))  return 1;
  if (stepId.startsWith('beard_')) return 2;
  if (stepId.startsWith('hair_'))  return 3;
  return 4;
}

// Strip the `_am` / `_pm` slot suffix added by lib/habit.ts to skin step rows.
// Returns the input unchanged for any step_id that doesn't end with one of
// these suffixes (beard, hair, legacy skin_am_*/skin_pm_* prefixes).
function baseSkinStepId(stepId: string): string {
  if (!stepId.startsWith('skin_')) return stepId;
  if (stepId.endsWith('_am') || stepId.endsWith('_pm')) {
    return stepId.slice(0, -3);
  }
  return stepId;
}

// Beard steps aren't in scan.recommendations.beard (BeardRecommendation has no
// routine field) — they're scheduled from hardcoded defaults, so we mirror those
// defaults here for label/product display.
function beardFallbackMeta(stepId: string): { label: string; product: string; order: number } | null {
  switch (stepId) {
    // Order: cleanse → nourish (oil absorbs) → shape (balm seals).
    case 'beard_wash': return { label: 'Cleanse', product: 'Beard wash', order: 1 };
    case 'beard_oil':  return { label: 'Nourish', product: 'Beard oil',  order: 2 };
    case 'beard_balm': return { label: 'Shape',   product: 'Beard balm', order: 3 };
    default: return null;
  }
}

function humanizeStepId(stepId: string): string {
  const short = stepId.replace(/^(skin_am_|skin_pm_|beard_|hair_)/, '').replace(/_/g, ' ');
  return short.charAt(0).toUpperCase() + short.slice(1);
}

async function fetchRoutineForDate(userId: string, date: string): Promise<RoutineDayStep[]> {
  const { data, error } = await supabase
    .from('routine_checkins')
    .select('id, scan_id, step_id, time_of_day, completed_at, kit_item_id')
    .eq('user_id', userId)
    .eq('date', date)
    .eq('superseded', false);
  if (error) throw error;

  const rawRows = (data ?? []) as Array<{
    id: string; scan_id: string; step_id: string;
    time_of_day: string; completed_at: string | null; kit_item_id: string | null;
  }>;
  if (rawRows.length === 0) return [];

  // Pull the relevant scan recommendations + the user's hair routine in parallel.
  const scanIds = Array.from(new Set(rawRows.map(r => r.scan_id).filter(Boolean)));
  const scansPromise = scanIds.length > 0
    ? supabase.from('scans').select('id, recommendations').in('id', scanIds)
    : Promise.resolve({ data: [] as Array<{ id: string; recommendations: Recommendations | null }>, error: null });
  const userPromise = supabase
    .from('users').select('hair_recommendations').eq('id', userId).single();

  const [scansRes, userRes] = await Promise.all([scansPromise, userPromise]);
  if (scansRes.error) throw scansRes.error;

  // (scan_id|step_id) -> meta, for skin/beard rows. Beard step_ids are absent
  // from scan recommendations; we'll fall back per-row below.
  type StepMeta = {
    label:               string;
    product:             string;
    order:               number;
    category?:           string;
    target_concern?:     string;
    clinical_reasoning?: string;
    time_of_day_array?:  ('am' | 'pm')[];
  };
  const byScanStep = new Map<string, StepMeta>();
  for (const s of (scansRes.data ?? []) as Array<{ id: string; recommendations: Recommendations | null }>) {
    const rec = s.recommendations;
    // Phase D — new schema: skin.steps[] (one entry per base step, with time_of_day array).
    for (const step of rec?.skin?.steps ?? []) {
      if (!step.step_id) continue;
      byScanStep.set(`${s.id}|${step.step_id}`, {
        label:               step.label,
        product:             step.product,
        order:               step.order ?? 999,
        category:            step.category,
        target_concern:      step.target_concern,
        clinical_reasoning:  step.clinical_reasoning,
        time_of_day_array:   step.time_of_day,
      });
    }
    // Legacy schema: skin.routine.morning + skin.routine.evening. These rows
    // are keyed by their original (slot-prefixed) step_id, so we register them
    // under that same key.
    const legacyMorning = rec?.skin?.routine?.morning ?? [];
    const legacyEvening = rec?.skin?.routine?.evening ?? [];
    for (const step of [...legacyMorning, ...legacyEvening]) {
      if (!step.step_id) continue;
      byScanStep.set(`${s.id}|${step.step_id}`, {
        label:   step.label,
        product: step.product,
        order:   step.order ?? 999,
      });
    }
    // Beard steps may now be embedded in scan.recommendations.beard.steps.
    const beardRecs = rec?.beard as { steps?: RoutineStep[] } | null | undefined;
    for (const step of beardRecs?.steps ?? []) {
      if (!step.step_id) continue;
      byScanStep.set(`${s.id}|${step.step_id}`, {
        label:               step.label,
        product:             step.product,
        order:               step.order ?? 999,
        category:            step.category,
        clinical_reasoning:  step.clinical_reasoning,
      });
    }
  }

  // Hair steps live on the user, not on individual scans.
  const hairRecs = (userRes.data as { hair_recommendations?: HairRecommendations | null } | null)?.hair_recommendations ?? null;
  const hairByStep = new Map<string, StepMeta>();
  for (const h of hairRecs?.routine ?? []) {
    if (!h.step_id) continue;
    hairByStep.set(h.step_id, {
      label:               h.label,
      product:             h.product,
      order:               h.order ?? 999,
      category:            h.category,
      clinical_reasoning:  h.clinical_reasoning,
    });
  }

  const enriched: RoutineDayStep[] = rawRows.map((r) => {
    const baseId = baseSkinStepId(r.step_id);
    let meta: StepMeta | undefined;
    if (r.step_id.startsWith('hair_')) {
      meta = hairByStep.get(r.step_id);
    } else if (r.step_id.startsWith('beard_')) {
      meta = byScanStep.get(`${r.scan_id}|${r.step_id}`)
          ?? beardFallbackMeta(r.step_id)
          ?? undefined;
    } else {
      // Skin: try the base id first (new schema), fall back to the raw stored
      // id (legacy skin_am_*/skin_pm_* schema).
      meta = byScanStep.get(`${r.scan_id}|${baseId}`)
          ?? byScanStep.get(`${r.scan_id}|${r.step_id}`);
    }
    return {
      row_id:              r.id,
      scan_id:             r.scan_id,
      step_id:             r.step_id,
      base_step_id:        baseId,
      time_of_day:         r.time_of_day as RoutineDayStep['time_of_day'],
      completed:           r.completed_at !== null,
      completed_at:        r.completed_at,
      kit_item_id:         r.kit_item_id,
      label:               meta?.label   ?? humanizeStepId(baseId),
      product:             meta?.product ?? '',
      order:               meta?.order   ?? 999,
      category:            meta?.category,
      target_concern:      meta?.target_concern,
      clinical_reasoning:  meta?.clinical_reasoning,
      time_of_day_array:   meta?.time_of_day_array,
    };
  });

  enriched.sort((a, b) => {
    const ba = categoryBucket(a.step_id);
    const bb = categoryBucket(b.step_id);
    if (ba !== bb) return ba - bb;
    if (a.order !== b.order) return a.order - b.order;
    return a.step_id.localeCompare(b.step_id);
  });

  return enriched;
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
//
// Phase D: skin step_ids in routine_checkins are slot-suffixed (skin_cleanse_am,
// skin_cleanse_pm) while user_kit / picker uses the base id (skin_cleanse). We
// match all variants here so a single picker selection links both AM + PM rows.
export async function backfillKitItemIdForStep(
  userId: string,
  stepId: string,
  kitItemId: string,
): Promise<number> {
  const candidates = stepId.startsWith('skin_')
    ? [stepId, `${stepId}_am`, `${stepId}_pm`]
    : [stepId];

  const { data, error } = await supabase
    .from('routine_checkins')
    .update({ kit_item_id: kitItemId })
    .eq('user_id', userId)
    .in('step_id', candidates)
    .eq('superseded', false)
    .gte('date', todayISO())
    .select('id');

  if (error) throw error;
  return data?.length ?? 0;
}

// ─── Exports for testing / callers that need the helpers ─────────────────────

export { todayISO, yesterdayISO };
