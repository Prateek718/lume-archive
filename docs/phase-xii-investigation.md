# Phase XII — Routine redesign: pre-redesign investigation

Read-only report. No code, schema, or data was changed. All findings re-verified against current code and migrations.

> **Note on the handoff doc** — the brief instructed me to read `docs/phase-xii-routine-redesign-handoff.md` end-to-end before starting. **That file does not exist** in `docs/` (the only doc present is `codebase-db-map.md`). I proceeded without it; flagged in §10 as the first open question. Where the brief refers to "section 3.3", "Migration 9 lessons", "section 6.2 discipline expectations", I have nothing to cross-check against, so contradictions vs. the handoff cannot be flagged.

> **Note on live DB queries** — the local `.env` only carries the Supabase **anon** key. Anon respects RLS on `routine_checkins`, `scans`, `routine_logs`, etc. (each table's RLS is `auth.uid() = user_id`), so any unauthenticated `SELECT` returns zero rows or zero count. I verified this with a `count=exact` HEAD against `/rest/v1/routine_checkins` — the response is `Content-Range: */0` and body `[{"count":0}]`, which is the RLS-blocked behaviour, not a true row count. **Section 8 therefore could not be executed; the queries are listed but unanswered, and §10 records this as an explicit ask.**

---

## 1. `services/habitService.ts` — full inventory

File length: 482 lines. All exports below were confirmed by grepping every `app/`, `components/`, `hooks/`, `lib/`, `services/` file.

### 1.1 `scheduleRoutineForScan(input: ScheduleRoutineInput): Promise<number>` — `services/habitService.ts:107`

```ts
export async function scheduleRoutineForScan(input: ScheduleRoutineInput): Promise<number> {
  ...
  const { error, count } = await supabase
    .from('routine_checkins')
    .upsert(rows, { onConflict: 'user_id,step_id,date', ignoreDuplicates: true });
```

Reads — none from DB; pulls scheduled rows out of `lib/habit.ts:generateScheduledRows` (pure, in-memory).
Writes — `routine_checkins` UPSERT with `onConflict: 'user_id,step_id,date'` and `ignoreDuplicates: true`. Columns set per row: `user_id, scan_id, step_id, time_of_day, date` (see `lib/habit.ts:39-45`). `completed_at`, `kit_item_id`, and `superseded` rely on column defaults (`NULL`, `NULL`, `false`).

Call sites:
- `services/scanService.ts:911` — inside the post-Phase-2 finalize block. Trigger: completing a full scan from `app/(scan)/scanning.tsx` → `useScan.tsx` → `runScanPhase2`.
- `services/scanService.ts:1366` — inside `rescheduleAfterRegen`. Trigger: section retry button on `app/recommendations.tsx` → `useScan.tsx:498` → `rescheduleAfterRegen`.

Both trace to live UI triggers. Reachable.

### 1.2 `supersedePreviousScanRows(userId, previousScanId, fromDate?): Promise<number>` — `services/habitService.ts:139`

```ts
const { data, error } = await supabase
  .from('routine_checkins')
  .update({ superseded: true })
  .eq('user_id', userId)
  .eq('scan_id', previousScanId)
  .eq('superseded', false)
  .is('completed_at', null)
  .gte('date', cutoff)
  .select('id');
```

Reads — none.
Writes — `routine_checkins` UPDATE setting `superseded = true` for rows matching: `user_id`, `scan_id = previousScanId`, currently `superseded = false`, `completed_at IS NULL`, `date >= cutoff` (cutoff = `fromDate ?? todayISO()`).

Call sites:
- `services/scanService.ts:901` — only call site. Trigger: same scan-finalize path as 1.1, fires before `scheduleRoutineForScan`. Reachable.

> Note on prior audit: `docs/codebase-db-map.md:237,495` claims this function writes `superseded_at`. **It does not.** Current code writes the boolean `superseded`, which exists in `phase_c_habit_engine.sql:24`. No drift. The audit doc is stale on this point.

### 1.3 `recordCheckin(userId, stepId, date, kitItemId?): Promise<void>` — `services/habitService.ts:162`

```ts
const updates: Record<string, unknown> = { completed_at: new Date().toISOString() };
if (kitItemId !== undefined) updates.kit_item_id = kitItemId;

const { error } = await supabase
  .from('routine_checkins')
  .update(updates)
  .eq('user_id', userId)
  .eq('step_id', stepId)
  .eq('date', date)
  .eq('superseded', false);
```

Reads — none direct. Fire-and-forget calls into `lib/milestones.checkMilestonesForCheckin(userId)` after the write (line 184).
Writes — `routine_checkins` UPDATE: `completed_at = now()` (and `kit_item_id` when provided). Filters on `user_id, step_id, date, superseded=false`. Guarded by `assertEditableDate(date)` — throws if the date is anything other than today or yesterday (lines 87-93).

Call sites:
- `app/(tabs)/routine.tsx:221` — `handleToggle` when the user taps an unchecked routine card. Reachable.

### 1.4 `unrecordCheckin(userId, stepId, date): Promise<void>` — `services/habitService.ts:187`

```ts
const { error } = await supabase
  .from('routine_checkins')
  .update({ completed_at: null })
  .eq('user_id', userId)
  .eq('step_id', stepId)
  .eq('date', date)
  .eq('superseded', false);
```

Reads — none.
Writes — UPDATE clearing `completed_at`. Same `assertEditableDate` guard.

Call sites:
- `app/(tabs)/routine.tsx:219` — same `handleToggle`, "uncheck" branch. Reachable.

### 1.5 `recordBulkCheckin(userId, stepIds, date): Promise<number>` — `services/habitService.ts:203`

```ts
const { data, error } = await supabase
  .from('routine_checkins')
  .update({ completed_at: new Date().toISOString() })
  .eq('user_id', userId)
  .eq('date', date)
  .eq('superseded', false)
  .is('completed_at', null)
  .in('step_id', stepIds)
  .select('id');
```

Reads — none. Calls `checkMilestonesForCheckin` after write.
Writes — UPDATE, `completed_at = now()` for all rows in `step_id IN (…)` for that date that are not already complete and not superseded.

Call sites: **NONE outside the file.** `grep -rE '\brecordBulkCheckin\b' {app,components,hooks,lib,services}` returns only the export line itself. **DEAD EXPORT** — same Migration-5 pattern as Phase XI (per `docs/codebase-db-map.md:432`). No "mark all" UI in `app/(tabs)/routine.tsx`.

### 1.6 `fetchDailyAdherence(userId, windowDays?): Promise<DayAdherence[]>` — `services/habitService.ts:229`

```ts
const { data, error } = await supabase
  .from('routine_checkins')
  .select('date, completed_at')
  .eq('user_id', userId)
  .eq('superseded', false)
  .gte('date', from)
  .lte('date', to);
```

`from` = `daysAgoISO(windowDays - 1)`, `to` = `todayISO()`. Default window = `ADHERENCE_WINDOW_DAYS = 30` (`lib/habit.ts:8`).

Reads — `routine_checkins(date, completed_at)` filtered by `user_id`, `superseded=false`, date range.
Writes — none.

Call sites:
- `lib/profileData.ts:99` — inside `computeStatGrid`. Reachable from `app/(tabs)/profile.tsx`.
- `app/(tabs)/routine.tsx:128, 237` — initial load + after every check-in toggle, to refresh the week strip + streak. Reachable.

### 1.7 `fetchTodayRoutine(userId): Promise<RoutineDayStep[]>` — `services/habitService.ts:442`

Thin wrapper around the file-private `fetchRoutineForDate(userId, todayISO())` (line 303).

`fetchRoutineForDate` reads:
- `routine_checkins(id, scan_id, step_id, time_of_day, completed_at, kit_item_id)` filtered by `user_id, date, superseded=false` (line 305-309).
- `scans(id, recommendations)` for every distinct `scan_id` in the result (line 321) — to enrich with label/product/category/clinical_reasoning.
- `users(hair_recommendations)` for the user (line 323-324) — hair steps live on the user, not the scan.

Writes — none.

Call sites:
- `app/(tabs)/routine.tsx:127` — initial routine-screen load. Reachable.

### 1.8 `fetchPastDayRoutine(userId, date): Promise<RoutineDayStep[]>` — `services/habitService.ts:446`

Same wrapper; passes a caller-supplied date.

Call sites: **NONE outside the file.** `grep -rE '\bfetchPastDayRoutine\b' {app,components,hooks,lib,services}` returns only the definition. **DEAD EXPORT.** No screen renders past-day routines (the UI in `app/(tabs)/routine.tsx` only renders today and a 7-day week strip; the strip uses `fetchDailyAdherence` aggregates, not per-day step lists).

### 1.9 `backfillKitItemIdForStep(userId, stepId, kitItemId): Promise<number>` — `services/habitService.ts:457`

```ts
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
```

Reads — none.
Writes — UPDATE `kit_item_id` for today + future non-superseded rows whose `step_id` matches the base id or its `_am`/`_pm` slot variants.

Call sites:
- `services/kitService.ts:77` — inside `addProductToKitFromBuy`. Triggered from:
  - `components/detail/ProductDetailSheet.tsx:142` — Buy CTA in product sheets.
  - `app/(profile)/add-from-routine.tsx:209` — "add from routine" profile screen.

Reachable.

### 1.10 Re-exports: `todayISO`, `yesterdayISO` — `services/habitService.ts:481`

```ts
export { todayISO, yesterdayISO };
```

Call sites: **NONE outside the file.** `app/(tabs)/routine.tsx:63` defines its own local `todayISO`; `lib/profileData.ts:277` defines its own local. Nobody imports these re-exports. **DEAD EXPORT** (low-impact — they're trivial helpers).

### 1.11 Type exports

`RoutineCheckinRow` (line 19), `RoutineDayStep` (line 32), `ScheduleRoutineInput` (line 97). `RoutineCheckinRow` is **not imported anywhere** (`grep -r 'RoutineCheckinRow'` returns only the definition). `RoutineDayStep` is imported by `app/(tabs)/routine.tsx:37`. `ScheduleRoutineInput` not imported externally.

### 1.12 Summary of dead exports in `habitService.ts`

| Export | Last verified call site |
|---|---|
| `recordBulkCheckin` | none |
| `fetchPastDayRoutine` | none |
| `todayISO`, `yesterdayISO` (re-exports) | none |
| `RoutineCheckinRow` (type) | none |
| `ScheduleRoutineInput` (type) | none |

---

## 2. Read paths against `routine_checkins`

Found by `grep "from('routine_checkins')"` plus tracing `services/habitService.ts` (which several callers wrap).

### 2.1 `services/habitService.ts:237` — inside `fetchDailyAdherence`

```ts
.from('routine_checkins')
.select('date, completed_at')
.eq('user_id', userId)
.eq('superseded', false)
.gte('date', from)
.lte('date', to);
```
Caller: aggregates per-date into `DayAdherence[]` for `lib/habit.ts:computeStreak` / `buildWeekStrip` / `computeRollingAdherence`. Renders the streak callout and week strip in `app/(tabs)/routine.tsx:164-182` and feeds `computeStatGrid` for the profile-tab "stats" panel.

### 2.2 `services/habitService.ts:305` — inside `fetchRoutineForDate` (used by `fetchTodayRoutine` + `fetchPastDayRoutine`)

```ts
.from('routine_checkins')
.select('id, scan_id, step_id, time_of_day, completed_at, kit_item_id')
.eq('user_id', userId)
.eq('date', date)
.eq('superseded', false);
```
Caller: enriches with scan recommendations + hair recommendations, then sorts by `categoryBucket → order → step_id`. Returned to `app/(tabs)/routine.tsx` which renders one card per row in AM/PM tabs.

### 2.3 `lib/profileData.ts:92` — inside `computeStatGrid`

```ts
supabase.from('routine_checkins')
  .select('date, completed_at')
  .eq('user_id', userId)
  .eq('superseded', false),
```
Caller: computes `adherence_pct` over the current issue window (`scans[scans.length-1].created_at` … now). Used by the profile-tab stat grid (`days_in`, `adherence_pct`, `streak_days`, `milestone_count`).

### 2.4 `lib/profileData.ts:280` — inside `fetchAdherencePanel`

```ts
.from('routine_checkins')
.select('date, completed_at')
.eq('user_id', userId)
.eq('superseded', false)
.gte('date', issueStartISO)
.lte('date', todayISO);
```
Caller: builds `overall_pct` plus 4 weekly buckets (`weekly: WeeklyBucket[]`) for the profile screen's adherence panel.

### 2.5 `lib/milestones.ts:92` — inside `fetchDailyAdherenceWindow`

```ts
.from('routine_checkins')
.select('date, completed_at')
.eq('user_id', userId)
.eq('superseded', false)
.gte('date', fromISO);
```
Caller: 45-day window pulled when `checkMilestonesForCheckin` runs (every check-in fires this). Aggregates per-day, then evaluates `first_routine`, `week_one`, `consistency_30` milestones via `longestConsecutiveAdherent` and `has30DayWindowAbove70`.

### 2.6 `services/deltaService.ts:168` — inside `computeAndStoreScanDelta`, scheduled-rows query

```ts
.from('routine_checkins')
.select('date, step_id, time_of_day, completed_at, superseded')
.eq('user_id', userId)
.eq('superseded', false)
.gte('date', fromISO)
.lt('date', toISO);
```
Caller: `(prevScan.created_at ≤ date < newScan.created_at)` window. Computes:
- `adherence_overall` (line 180-184).
- `adherence_by_category` keyed by `stepCategory(step_id, time_of_day)` — buckets `skin_am | skin_pm | beard | hair` (line 91-100).
- `adherence_weekly` per Monday-start (line 207-221).
- `streak_longest`, `streak_at_rescan`, `freezes_used` via `computeStreak`.

### 2.7 `services/deltaService.ts:256` — inside `computeAndStoreScanDelta`, kit-completions query

```ts
.from('routine_checkins')
.select('kit_item_id')
.eq('user_id', userId)
.eq('superseded', false)
.not('completed_at', 'is', null)
.gte('date', fromISO)
.lt('date', toISO);
```
Caller: counts completions per `kit_item_id` to populate `products_used.completions_tied_to_product` on the `scan_deltas` row.

### 2.8 No reads in `app/(tabs)/routine.tsx` directly

`app/(tabs)/routine.tsx:127-128` calls `fetchTodayRoutine` and `fetchDailyAdherence`; the only direct `routine_checkins` queries are inside `services/habitService.ts`. The screen does no first-party `routine_checkins` SELECTs.

---

## 3. Write paths against `routine_checkins`

### 3.1 `services/habitService.ts:124` — UPSERT (in `scheduleRoutineForScan`)

```ts
await supabase
  .from('routine_checkins')
  .upsert(rows, { onConflict: 'user_id,step_id,date', ignoreDuplicates: true });
```
Columns set per row (from `lib/habit.ts:39-45`): `user_id, scan_id, step_id, time_of_day, date`. `completed_at`, `kit_item_id` rely on default `NULL`; `superseded` defaults `false`. Trigger: scan finalize (`runScanPhase2`) and section regen (`rescheduleAfterRegen`).

### 3.2 `services/habitService.ts:147` — UPDATE (in `supersedePreviousScanRows`)

```ts
.update({ superseded: true })
.eq('user_id', userId)
.eq('scan_id', previousScanId)
.eq('superseded', false)
.is('completed_at', null)
.gte('date', cutoff)
```
Trigger: scan finalize, just before `scheduleRoutineForScan`.

### 3.3 `services/habitService.ts:173` — UPDATE (in `recordCheckin`)

```ts
.update({ completed_at: <now ISO>, [kit_item_id]: <id> })
.eq('user_id', userId).eq('step_id', stepId).eq('date', date).eq('superseded', false);
```
Trigger: user taps an unchecked card on `app/(tabs)/routine.tsx:221`.

### 3.4 `services/habitService.ts:191` — UPDATE (in `unrecordCheckin`)

```ts
.update({ completed_at: null })
.eq('user_id', userId).eq('step_id', stepId).eq('date', date).eq('superseded', false);
```
Trigger: user taps a checked card on `app/(tabs)/routine.tsx:219`.

### 3.5 `services/habitService.ts:212` — UPDATE (in `recordBulkCheckin`) — **no live trigger**

```ts
.update({ completed_at: <now ISO> })
.eq('user_id', userId).eq('date', date).eq('superseded', false)
.is('completed_at', null).in('step_id', stepIds);
```
Trigger: none. Dead.

### 3.6 `services/habitService.ts:467` — UPDATE (in `backfillKitItemIdForStep`)

```ts
.update({ kit_item_id: kitItemId })
.eq('user_id', userId).in('step_id', candidates).eq('superseded', false).gte('date', todayISO())
```
Trigger: Buy CTA in `ProductDetailSheet` or "add from routine" → `kitService.addProductToKitFromBuy:77`.

### 3.7 No DELETEs

No `.delete()` against `routine_checkins` exists anywhere in the codebase. Cascade deletion only happens via the `ON DELETE CASCADE` on `user_id` and `scan_id` FKs (`phase_c_habit_engine.sql:17-18`).

---

## 4. `step_id` stability — CRITICAL

### 4.1 Where `step_id` enters the system

`step_id` is **model-generated text** from Gemini's recommendations response, then stored verbatim (with optional `_am`/`_pm` suffixing for skin) onto each `routine_checkins` row.

Generation paths:

**Skin** — `lib/gemini/skin.ts:85`. Prompt declares the allowed values inline:
```
"step_id": "skin_cleanse" | "skin_treat_1" | "skin_treat_2" | "skin_moisturize" | "skin_protect"
```
And `lib/gemini/skin.ts:146`:
```
step_id values are stable keys for adherence tracking — they must match the documented format EXACTLY.
```
There is **no schema-side enum or post-validation** — Gemini is asked nicely to use the canonical set, and whatever it returns is stored.

**Hair** — `lib/gemini/hair.ts:111-112` and `:161-162` (two places):
```
step_id — required on every routine step. Canonical IDs only:
  hair_shampoo, hair_conditioner, hair_oil, hair_serum, hair_mask
```
Same pattern: documented in the prompt, no post-validation.

**Beard** — `lib/gemini/beard.ts:31`:
```
Pick steps from these stable step_ids ONLY: beard_wash, beard_oil, beard_balm.
```

### 4.2 From Gemini output to `routine_checkins.step_id`

Path: `services/scanService.ts:runScanPhase2` writes `scans.recommendations` (jsonb). On finalize, `scheduleRoutineForScan` calls `lib/habit.ts:generateScheduledRows`, which reads `scan.recommendations.skin.steps[].step_id` (line 319) etc. and passes it to the row. The skin path adds a slot suffix at `lib/habit.ts:391`:

```ts
for (const slot of s.time_of_day) {
  const slottedStepId = `${s.step_id}_${slot}`;
  rows.push({ user_id: userId, scan_id: scanId, step_id: slottedStepId, time_of_day: slot, date });
}
```

So a Gemini-emitted skin step `skin_cleanse` becomes two rows per day: `skin_cleanse_am` and `skin_cleanse_pm`. Hair and beard step_ids are written **as-is**, without suffixing (`lib/habit.ts:410`, `:447`).

### 4.3 Canonical vs. free-form: **FREE-FORM in practice**

There is no canonicalization, normalization, mapping table, or validation step that constrains `step_id` to the prompt-documented set. The closest is `lib/habit.ts:329`:
```ts
.filter(s => {
  if (!s.step_id) {
    console.log('[habit-gen] skipping skin step without step_id', { step: s });
    return false;
  }
  return !s.step_id.startsWith('makeup_');
})
```
— it only drops rows missing a `step_id` or beginning with `makeup_`. Anything else passes through.

A migration confirms this is a known issue: `phase_d_prescription_routine.sql:15-21` had to mass-supersede legacy `skin_am_*`/`skin_pm_*` rows because the **schema itself was once different** — older Gemini outputs used a different step_id namespace. This is exactly the failure mode the brief is worried about.

The prompt's stability guarantee is convention only; the database has no schema-level guard. The closest enforcement is the `UNIQUE (user_id, step_id, date)` constraint (`phase_c_habit_engine.sql:28`), which only protects against duplicates within one user-day, not against cross-scan drift.

### 4.4 Cross-scan drift query (could not run)

I could not execute the suggested query
```sql
select user_id, step_id, count(distinct scan_id) as scan_count
from routine_checkins
group by user_id, step_id
having count(distinct scan_id) > 1
order by scan_count desc
limit 50;
```
because anon-key RLS returns zero rows. **Pinned in §10 for Prateek.**

What I can say from code alone: **a renamed step on a rescan would create new check-in rows under a new `step_id`, leaving the old step's history orphaned but un-superseded for completed past dates.** `supersedePreviousScanRows` (§3.2) only flips `superseded` on rows where `completed_at IS NULL` and `date >= cutoff` — completed past rows under an old step_id stay live. They no longer schedule (the new scan owns scheduling), but they continue to be aggregated by `fetchDailyAdherence` (§2.1) and `deltaService` (§2.6) because both queries match purely on date range and `superseded=false`. So the historical adherence math is preserved across renames; what's at risk is **streak continuity for the renamed step** (no current code joins by step_id across scans, but any new design that does will need a step-identity map).

### 4.5 Verdict

- `step_id` is **model-generated text**, not a canonical enum.
- **No normalization or canonicalization layer exists** — neither at write time (`scheduleRoutineForScan`) nor at the prompt-output validation layer.
- The prompt asks Gemini to use a fixed set; the schema does not enforce it.
- A historical rename event (skin_am_* → skin_cleanse_am) was handled by mass-superseding the old rows in `phase_d_prescription_routine.sql`, not by a step-id migration. That precedent is the only real-world data we have.

---

## 5. Timezone handling for completion dates

### 5.1 Where `completed_at` is set

`completed_at` is a `timestamptz` (`phase_c_habit_engine.sql:22`). Two writers, both client-side:

`services/habitService.ts:170` (recordCheckin):
```ts
const updates: Record<string, unknown> = { completed_at: new Date().toISOString() };
```

`services/habitService.ts:213` (recordBulkCheckin):
```ts
.update({ completed_at: new Date().toISOString() })
```

Both use the device's clock at tap time and serialize to UTC ISO via `toISOString()`. The DB stores it as `timestamptz` so any later read will return UTC. There is no server-side default for `completed_at` (the column is nullable; only `created_at` and `updated_at` get `DEFAULT now()`).

`unrecordCheckin` (`services/habitService.ts:191`) writes `completed_at: null`.

### 5.2 Where `date` is set

`date` is a plain `date` (no time, no zone — `phase_c_habit_engine.sql:20`). It is **always** computed client-side in **device-local time**. The two relevant helpers:

`lib/habit.ts:51-56` (used by `generateScheduledRows`):
```ts
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

`services/habitService.ts:58-63` (used at runtime by `todayISO`, `yesterdayISO`, `daysAgoISO`):
```ts
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

Both read `getFullYear/getMonth/getDate` — these are **local-time** accessors (Date.prototype.getDate, not getUTCDate). So:
- **Scheduled rows** are dated in the user's device tz at scan time.
- **Today's check-in** is recorded against the user's local "today".
- Read filters in `fetchDailyAdherence`/`fetchRoutineForDate` use the same local-tz `todayISO()`.

### 5.3 Other places `toISODate` / `todayISO` is defined (consistency check)

| Location | Behavior |
|---|---|
| `lib/habit.ts:51` | local-tz YMD |
| `services/habitService.ts:58` | local-tz YMD |
| `services/deltaService.ts:69` | local-tz YMD |
| `lib/profileData.ts:280-285` | uses local `toISODate` (line 277) |
| `app/(tabs)/routine.tsx:63` | **`new Date().toISOString().split('T')[0]`** — UTC YMD |

**Inconsistency flag:** `app/(tabs)/routine.tsx:63` does it in UTC, while every services-/lib-side helper uses local time. The screen passes its UTC `todayISO()` only to `buildWeekStrip(dailyAdherence, todayISO())` (line 165) for week-strip rendering, and into the toggle handler (line 207) which it forwards to `recordCheckin/unrecordCheckin`. For users east of UTC (India is UTC+5:30 — Lumé's market), late-night taps will:
- Record `completed_at` as a UTC timestamp in the previous UTC day (because `toISOString()`).
- Submit `date` as the UTC YMD, which after 5:30am IST has rolled over and matches local — but between **midnight–05:30 IST**, UTC is still "yesterday" while local is "today."

So between 00:00 and 05:30 IST, a tap would write `date = <yesterday-IST>` from `routine.tsx`. But `recordCheckin` expects an editable date and runs `assertEditableDate(date)` against `todayISO()`/`yesterdayISO()` from `services/habitService.ts:70-78`, which compute in **local** tz. At 02:00 IST: `routine.tsx` says today=2026-05-07 (UTC), `habitService` says today=2026-05-08 (IST), yesterday=2026-05-07 — so 2026-05-07 is `yesterdayISO()` in services-land, the assert passes, and the row gets written under the wrong logical day.

Worse, the row that habitService is updating was scheduled by `generateScheduledRows` against local-tz `date`. So at 02:00 IST 2026-05-08, the user's "today" routine card (date=2026-05-08 IST) is matched in DB by an UPDATE filter `.eq('date', '2026-05-07')` — which **doesn't match the row at all** (the row's `date = 2026-05-08`), so **the UPDATE silently affects 0 rows**.

This is a real correctness hole, not a hypothetical. Documenting in §9.

### 5.4 Summary

- `completed_at`: device clock → UTC ISO → `timestamptz`.
- `date`: device-local YMD via `getFullYear/getMonth/getDate` everywhere **except** `app/(tabs)/routine.tsx:63`, which uses UTC YMD via `toISOString().split('T')[0]`.

---

## 6. Frequency / `time_of_day` semantics

### 6.1 Live distribution

Could not run
```sql
select time_of_day, count(*) from routine_checkins group by time_of_day order by count(*) desc;
```
— anon RLS returns nothing. Pinned in §10.

### 6.2 What values `time_of_day` can take

The schema enum (`phase_c_habit_engine.sql:21`):
```
CHECK (time_of_day IN ('am', 'pm', 'weekly', 'monthly', 'daily'))
```

All five are produced by `lib/habit.ts:generateScheduledRows`:
- `am`, `pm` — skin steps, one row per slot per day (`lib/habit.ts:392`).
- `daily` — beard fallback steps when `cadence='every_wash'` (line 410), and beard steps from new-schema scans whose `time_of_day` array is missing (line 408 default).
- `weekly` — hair steps with `cadence='weekly'` (line 437).
- `monthly` — hair steps with `cadence='monthly'` (line 440).

Beard new-schema steps copy `time_of_day` straight from Gemini output (line 404):
```ts
if (Array.isArray(b.time_of_day) && b.time_of_day.length > 0) {
  return b.time_of_day as ScheduledRow['time_of_day'][];
}
return ['daily'];
```
So a Gemini-emitted `time_of_day: ['am']` for beard would persist as `am`, even though the prompt doesn't document AM/PM for beard.

### 6.3 Is there a `frequency` column? No.

`grep "\bfrequency\b"` across `**/*.{ts,tsx,sql}` finds:
- `wash_frequency` on `users.hair_profile` (jsonb) — feeds `washFrequencyDays` (`lib/habit.ts:241`) which converts `daily | every_2_3_days | once_a_week | less_than_weekly` to a number of days. Not a per-step concept.
- `types/index.ts:141-145` deprecated fields `wash_frequency`/`weekly_treatment` on legacy `HairRecommendations` — content moved into `routine[].cadence`.

**"Weekly"/"monthly" is represented today via two layers:**
1. **At schedule time:** `lib/habit.ts:435-441` only inserts a `routine_checkins` row on day-offsets where `dayOffset % 7 === 0` (weekly) or `dayOffset % 30 === 0` (monthly). So a weekly-cadence step produces only 4 rows in the 28-day window, on the 1st, 8th, 15th, 22nd day from start.
2. **At query time:** `time_of_day` carries the cadence label (`'weekly'`, `'monthly'`) so the UI can label cards. There is **no separate cadence column** — the only persisted signal is the row's existence on a given date plus the `time_of_day` enum.

### 6.4 How the routine generator emits timing

**Skin** (`lib/gemini/skin.ts:87`): `"time_of_day": ["am"] | ["pm"] | ["am","pm"]` — array of slots. Parsed by `lib/habit.ts:295-303`:
```ts
function resolveSkinTimeOfDay(step: RoutineStep): ('am' | 'pm')[] {
  if (Array.isArray(step.time_of_day) && step.time_of_day.length > 0) {
    return step.time_of_day;
  }
  if (step.step_id.startsWith('skin_am_')) return ['am'];
  if (step.step_id.startsWith('skin_pm_')) return ['pm'];
  return ['am', 'pm'];
}
```
Legacy fallback to step_id-prefix sniffing.

**Hair** (`lib/gemini/hair.ts:114`): `cadence — required on every routine step, one of: "every_wash" | "weekly" | "monthly"`. Parsed by `lib/habit.ts:431-441`:
```ts
if (h.cadence === 'every_wash') {
  schedule = isWashDay; time_of_day = 'daily';
} else if (h.cadence === 'weekly') {
  schedule = dayOffset % 7 === 0; time_of_day = 'weekly';
} else if (h.cadence === 'monthly') {
  schedule = dayOffset % 30 === 0; time_of_day = 'monthly';
}
```
The wash anchor is the `washFreqDays` derived from `users.hair_profile.wash_frequency`, not per-step.

**Beard** (`lib/gemini/beard.ts:81`): no explicit `time_of_day` or `cadence` documented in the schema block — but `lib/habit.ts:404-408` will read `b.time_of_day` array if Gemini supplies it, defaulting to `['daily']`. The fallback `BEARD_DEFAULT_STEPS` (`lib/habit.ts:269-273`) hard-codes `am`, `pm`, `daily`. `beard_wash` is gated on `isWashDay` — same hair-wash cadence — at line 401 / 415.

So the **one cross-cutting concept** is `washFrequencyDays(userHairProfile?.wash_frequency)` (`lib/habit.ts:370`) which is anchored to `startDate`, then `dayOffset % washFreqDays === 0` decides whether wash-cadence steps schedule that day. Anything `weekly` is offset-0/7/14/21; anything `monthly` is offset-0 only within the 28-day window.

---

## 7. `routine_logs` vs `routine_checkins`

### 7.1 `logRoutineStep` and call sites

Definition (`services/scanService.ts:93-112`):
```ts
export async function logRoutineStep(params: {
  userId:      string;
  scanId:      string | null;
  stepLabel:   string;
  stepProduct?: string;
  category:    'skin_am' | 'skin_pm' | 'hair' | 'beard' | 'makeup';
}): Promise<void> {
  try {
    await supabase.from('routine_logs').insert({
      user_id:      params.userId,
      scan_id:      params.scanId,
      step_label:   params.stepLabel,
      step_product: params.stepProduct ?? null,
      category:     params.category,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[scanService] logRoutineStep failed:', err);
  }
}
```

Call sites:
- `app/(tabs)/routine.tsx:228` — fired only inside `handleToggle`'s **else branch** (i.e. when `wasChecked === false` and we're checking the step on). Skipped on uncheck. Skipped if `deriveStepCategory(step.step_id)` returns null.

That's the only site.

### 7.2 Is it written every tap?

**No.** Three filters:
1. Only on **transition to completed** (uncheck doesn't log).
2. Only when `deriveStepCategory(step_id)` returns a non-null category. Per `services/scanService.ts:80-89`, that requires `skin_*` (and `time_of_day` to be `am` or `pm`), `hair_*`, `beard_*`, or `makeup_*`. A `skin_*` row with `time_of_day === 'daily'` returns null (no current writer produces this, but hypothetically). Anything else returns null.
3. Wrapped in a `void` fire-and-forget — caller doesn't await. If the insert fails (e.g., RLS error), the user's check-in still succeeds; only a `console.warn` is emitted.

### 7.3 Schema (`phase_xi_create_missing_tables.sql:52-61`)

```sql
create table if not exists public.routine_logs (
  id            uuid         primary key default gen_random_uuid(),
  user_id       uuid         references public.users(id) on delete cascade,
  scan_id       uuid         references public.scans(id) on delete set null,
  step_label    text         not null,
  step_product  text,
  category      text,
  completed_at  timestamptz  not null default now(),
  created_at    timestamptz  not null default now()
);
```

RLS: insert-only by `auth.uid() = user_id`, no SELECT policy → only `service_role` can read (admin/analytics). No `step_id` column. No `date` column. No supersede flag. No uniqueness constraint.

### 7.4 Field-level overlap

| Concept | `routine_checkins` | `routine_logs` |
|---|---|---|
| user_id | yes | yes |
| scan_id | yes (NOT NULL, ON DELETE CASCADE) | yes (nullable, ON DELETE SET NULL) |
| step_id | yes (canonical-ish; slot-suffixed for skin) | **no** — only `step_label` (human "Cleanse"/"Treat") and `step_product` (display string) |
| date | yes (local YMD, unique with user/step) | **no** — only `completed_at` UTC timestamptz |
| time_of_day | yes (am/pm/weekly/monthly/daily) | **no** — only `category` (`skin_am | skin_pm | hair | beard | makeup`) |
| superseded | yes | no |
| kit_item_id | yes | no |
| pre-scheduled empty rows | yes (one per step-slot-date upfront) | no — write-on-event |

`routine_logs` carries `step_label` + `step_product` (display strings frozen at the time of completion) that `routine_checkins` does not. These let analytics ask "what label did the user actually see when they checked off Vitamin C in March?" without re-reading `scans.recommendations`. `routine_checkins` has the structured key (`step_id`) but loses the display copy if the scan's recommendations are later regenerated.

`routine_logs` does **not** carry the structured `step_id`, so it cannot be cross-referenced back to a scheduled check-in row. They are loosely linked by `(user_id, scan_id, completed_at)`.

### 7.5 Could `routine_logs` be derived from a future `routine_completions` table?

If a future schema has a "completions" table with `(user_id, step_id, date, completed_at, scan_id)`:
- `category` could be derived via `stepCategory(step_id, time_of_day)` if `time_of_day` is preserved alongside.
- `step_label` and `step_product` **cannot** be derived without joining back to the version of `scans.recommendations` that existed at completion time. If recommendations are mutable (regen flow exists at `services/scanService.ts:1348` and beyond), the original copy is gone. So either the completions table needs to denormalize label/product, or `routine_logs` keeps independent value as a frozen display log.

Verdict: **`routine_logs` carries independent information (frozen label/product display strings)** that a normalised completions table would lose unless explicitly denormalised. If the redesign denormalises, `routine_logs` can be retired.

---

## 8. Live DB state snapshot

**Skipped.** Per the constraint clarification, running these queries requires Prateek to execute them with elevated credentials. The local app uses only the Supabase **anon** key, which respects RLS and returns 0 rows for every relevant table (each has `auth.uid() = user_id` policies). Re-listing the queries here for a one-shot run by Prateek:

```sql
-- Row counts
select 'routine_checkins' as table_name, count(*) from routine_checkins
union all select 'scans', count(*) from scans
union all select 'routine_logs', count(*) from routine_logs;

-- Per-user scan + checkin distribution (top 10)
select user_id, count(distinct scan_id) as scans, count(*) as checkins
from routine_checkins group by user_id order by scans desc limit 10;

-- Supersede distribution
select superseded, count(*) from routine_checkins group by superseded;

-- Completion rate
select
  count(*) filter (where completed_at is not null) as completed,
  count(*) filter (where completed_at is null) as uncompleted
from routine_checkins;

-- Distinct step_ids
select count(distinct step_id) as distinct_steps from routine_checkins;

-- step_id stability across scans (from §4.4)
select user_id, step_id, count(distinct scan_id) as scan_count
from routine_checkins
group by user_id, step_id
having count(distinct scan_id) > 1
order by scan_count desc
limit 50;

-- time_of_day distribution (from §6.1)
select time_of_day, count(*) from routine_checkins group by time_of_day order by count(*) desc;
```

---

## 9. Surprises, risks, things noticed

### 9.1 Three dead exports in `habitService.ts`

- `recordBulkCheckin` (`services/habitService.ts:203`) — not imported anywhere. No "mark all" UI.
- `fetchPastDayRoutine` (`services/habitService.ts:446`) — not imported anywhere. No past-day routine view.
- `todayISO` / `yesterdayISO` re-exports (`services/habitService.ts:481`) — not imported anywhere; both `app/(tabs)/routine.tsx:63` and `lib/profileData.ts:277` define their own.
- Type `RoutineCheckinRow` (`services/habitService.ts:19`) — defined, never used.

### 9.2 Local-vs-UTC date mismatch in `app/(tabs)/routine.tsx:63`

The screen's local helper:
```ts
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
```
…is UTC-anchored, while every other date helper in the codebase (`lib/habit.ts:51`, `services/habitService.ts:58`, `services/deltaService.ts:69`, `lib/profileData.ts:277`) uses local-tz `getFullYear/getMonth/getDate`.

Concrete failure: between 00:00 and 05:30 IST, a check-in tap on `routine.tsx:207` builds `date` from this UTC helper. The screen's `step.step_id` is for the row scheduled under local-tz `date` (next day), so `recordCheckin`'s UPDATE filter `.eq('step_id', stepId).eq('date', <UTC-yesterday>)` **misses the actual row**. Silent 0-row UPDATE. The optimistic UI flip stays visible until refresh, when the un-updated row reasserts as un-completed. The Phase XI cleanup did not catch this because it pre-dates the toggle path's introduction (the screen was rebuilt in Phase 5 — see `app/(tabs)/routine.tsx:1` comment).

Not asked to fix; flagged for the redesign discussion since any new completion-recording path needs a single canonical local-tz "today."

### 9.3 No step-id canonicalization layer

§4 already covered this. To restate as a risk surface: every Gemini call is one prompt-tweak away from emitting `skin_cleanser` instead of `skin_cleanse`. Today, the only check is `s.step_id.startsWith('makeup_')` filtering and a null check (`lib/habit.ts:329-335, 339-340`). A typo would land in the DB, schedule rows, and never link back to past completions.

### 9.4 `phase_d_prescription_routine.sql:11-13` declares a stale `beard_goal` enum

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS beard_goal TEXT
    CHECK (beard_goal IN ('clean_simple', 'healthy_groomed', 'growing_thickening', 'styled'));
```
But `phase_3a_beard_goal_taxonomy.sql` (which sorts before phase_d in filename order) replaces the values with `('fuller','sharper','shorter','longer','none')`. The two migrations conflict on the same column. Already noted in `codebase-db-map.md:509`. Phase XII redesign should not touch `beard_goal`, but if any new check rides on the column, this conflict is still latent.

### 9.5 `routine_checkins` UPSERT idempotence vs. step_id renames within a scan

`scheduleRoutineForScan` uses `onConflict: 'user_id,step_id,date'` with `ignoreDuplicates: true`. If a regen (`rescheduleAfterRegen`) produces a **different** `step_id` for the same logical step, the new id is inserted alongside (not replacing) the old. The old row continues to schedule until manually superseded. There is no "supersede after regen" call in `services/scanService.ts:1348-1378`. The user would see both old and new cards for the same logical step until the next full scan finalize triggers `supersedePreviousScanRows`. The brief flagged that the proposed schema must survive rescans; this exposes a regen-path gap orthogonal to the rescan path.

### 9.6 `routine_logs` write is in `app/(tabs)/routine.tsx`, not in `recordCheckin`

The check-in write itself (`recordCheckin`) and the analytics write (`logRoutineStep`) are sequenced in the screen handler:
```ts
await recordCheckin(userId, step.step_id, date, step.kit_item_id);
const category = deriveStepCategory(step.step_id);
if (category) {
  void logRoutineStep({ userId, scanId: step.scan_id, ... });
}
```
If a future call site records a check-in via a different path (cron, server-side, "mark all" button, push-notification action), it must remember to also emit `routine_logs` or analytics will go silent on those flows. The coupling is incidental, not enforced. No comment in either function notes the dependency.

### 9.7 `recordBulkCheckin` would not emit `routine_logs`

If the dead `recordBulkCheckin` (§1.5) is ever wired up, it satisfies milestone evaluation (`checkMilestonesForCheckin` is called) but never calls `logRoutineStep`. A future "mark all" feature would silently skip analytics. Worth knowing if §9.1 leads to keeping rather than removing it.

### 9.8 `scan_deltas` adherence categories enumerate `skin_am | skin_pm | beard | hair`

`services/deltaService.ts:91-100`:
```ts
function stepCategory(stepId: string, timeOfDay: string): AdherenceCategory | null {
  if (stepId.startsWith('skin_')) {
    if (timeOfDay === 'am') return 'skin_am';
    if (timeOfDay === 'pm') return 'skin_pm';
    return null;
  }
  ...
}
```
Skin steps with `time_of_day` outside `am`/`pm` (none today, but the schema CHECK allows `daily`/`weekly`/`monthly` for skin) silently drop out of the delta. If the redesign permits other skin slots, deltas will under-report.

### 9.9 Unused `superseded` index

`phase_c_habit_engine.sql:36`:
```sql
CREATE INDEX idx_routine_checkins_adherence ON routine_checkins (user_id, date, superseded) WHERE superseded = false;
```
Most queries already filter `superseded=false`, so this index is appropriate. Mentioned only to confirm it's pulling its weight.

### 9.10 `kit_item_id` becomes stale on rescan

`backfillKitItemIdForStep` (§1.9, `services/habitService.ts:457`) only links rows where `date >= todayISO()`. After a rescan replaces routines, the new scan's rows are inserted **without** `kit_item_id` populated (only `user_id, scan_id, step_id, time_of_day, date` are written by `generateScheduledRows`). So the user must re-add or re-buy products to re-link them — or more realistically, `scanService.ts:911` reschedules without preserving the prior scan's kit linkage. `services/deltaService.ts:269` relies on `kit_item_id` being present to attribute completions to products. Post-rescan deltas will under-attribute until the next product purchase triggers a backfill.

### 9.11 `phase_c_habit_engine.sql:31` comment vs. current writer

Comment says "superseded=true when user rescans before a scheduled day — those rows stop counting against adherence." Code (`services/habitService.ts:153`) only supersedes rows where `completed_at IS NULL` and `date >= cutoff`. That matches "uncompleted future rows" but not "any prior-scan rows." The comment is slightly broader than the implementation, which is intentional but worth knowing if the redesign assumes prior-scan rows are uniformly superseded.

---

## 10. Open questions that need a human

1. **Where is `docs/phase-xii-routine-redesign-handoff.md`?** The brief points to it; the file is not in `docs/`. Was it staged in a different branch, or is the brief's reference stale? Without it I cannot validate the proposed schema (§3.3), Migration 9 lessons (§2.3, §4.1), or the discipline expectations (§6.2) referenced in the brief. **Request:** point me at the actual handoff path or paste section 3.3 inline.

2. **Live DB queries in §8 and §4.4** — please run with elevated credentials and share the outputs. Specifically, the `step_id × scan_count` aggregation will tell us whether step-id drift across scans is actively happening or only theoretical. `time_of_day` distribution will confirm whether `daily`/`weekly`/`monthly` are alive in production or vestigial.

3. **`recordBulkCheckin` and `fetchPastDayRoutine` (§1.5, §1.8)** — were these placeholders for a "mark all" / "history" feature that was deferred, or are they leftover from a refactor? Want to delete them in a follow-up?

4. **`app/(tabs)/routine.tsx:63` UTC-vs-local mismatch (§9.2)** — is this a known bug deferred for the redesign, or new news? If the redesign reframes around `completed_at` and drops local `date`, the bug becomes moot; if `date` survives as a key, this needs fixing.

5. **`step_id` canonicalization (§4.3)** — does the redesign want a server-side enum (CHECK constraint or trigger), a TypeScript validator that rejects non-canonical Gemini output before insert, or to keep the prompt-only convention? The current path has no defense.

6. **Regen-path supersede gap (§9.5)** — is `rescheduleAfterRegen` (services/scanService.ts:1348) supposed to call `supersedePreviousScanRows` against the **same** scan id (to clear stale future rows from the prior generation), or does the design accept stale duplicates persisting until the next full scan?

7. **`routine_logs` retention vs. denormalization (§7.5)** — does the redesign want to keep `routine_logs` as a frozen display-string log, or fold step_label/step_product into a single completions table? The answer determines whether `routine_logs` is part of the redesign or out of scope.

8. **Adherence categorization for non-am/pm skin (§9.8)** — if the redesign keeps `time_of_day = 'weekly'`/`'monthly'` for skin (e.g., a weekly mask), how should `deltaService.stepCategory` route those? Today they vanish from `adherence_by_category`.

9. **Kit linkage across rescans (§9.10)** — should new-scan rows inherit `kit_item_id` from the prior scan when the same logical step continues, or is it intentional that the user re-purchases / re-links each cycle?

10. **Beard `time_of_day` ambiguity (§6.4)** — `lib/gemini/beard.ts` doesn't document `time_of_day` for beard steps, but `lib/habit.ts:404` happily reads it if Gemini supplies it. Should beard be normalized to `daily` for non-wash steps, or is per-slot beard (e.g., `beard_balm` AM only) a deliberate option being kept open?

---

End of investigation report.
