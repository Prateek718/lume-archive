// Trait persistence logic (Phase A.5).
// Stable traits (face_shape, hair_texture, skin_undertone) are locked after the
// first confident scan and carried forward. Only the user can override a locked
// trait — and only on a scan where the model disagrees at high confidence.

import { supabase } from './supabase';
import type {
  PartialScan,
  UserTraits,
  UserTrait,
  PendingTraitDecision,
} from '../types';

// ─── Thresholds ──────────────────────────────────────────────────────────────
// Below this, we surface the trait to the user for confirmation on first lock.
export const LOW_CONFIDENCE_THRESHOLD      = 0.75;
// Above this, a scan that disagrees with a locked trait may prompt an override.
export const OVERRIDE_CONFIDENCE_THRESHOLD = 0.85;

// Traits we actually resolve today. Keep narrow — extending this is cheap.
const TRACKED_TRAITS = ['face_shape', 'skin_undertone'] as const;
type  TrackedTrait   = typeof TRACKED_TRAITS[number];

// Pull the scan's value for a given trait field.
function readScanValue(scan: PartialScan, trait: TrackedTrait): string | null {
  switch (trait) {
    case 'face_shape':     return scan.face_shape     ?? null;
    case 'skin_undertone': return scan.skin_undertone ?? null;
  }
}

// Pull the scan's model confidence for a trait. Default 0.5 when missing —
// treating absent confidence as "uncertain" is safer than "confident".
function readScanConfidence(scan: PartialScan, trait: TrackedTrait): number {
  return scan.confidence?.[trait] ?? 0.5;
}

// Pull the scan's named alternative for a trait. Used to build confirmation
// choices when the model is borderline.
function readScanAlternative(scan: PartialScan, trait: TrackedTrait): string | null {
  return scan.alternatives?.[trait] ?? null;
}

// ─── resolveTraits ───────────────────────────────────────────────────────────
// Given a fresh scan + the user's existing traits, decide which values to use
// for this scan and whether any traits need user input.
//
// Rules:
//   1. If a trait is already locked:
//        - scan agrees → use locked value, no decision needed.
//        - scan disagrees at ≥ OVERRIDE_CONFIDENCE_THRESHOLD → queue an override
//          decision, but STILL use the locked value for this scan until the
//          user confirms the override.
//        - scan disagrees at lower confidence → silently trust the locked value.
//   2. If a trait is NOT locked (first scan for this trait):
//        - confidence ≥ LOW_CONFIDENCE_THRESHOLD → use the scan value, caller
//          will auto-lock it via `first_scan_auto`.
//        - confidence below threshold → still use the scan value TENTATIVELY
//          but queue a confirmation decision so the user can ratify it.
export function resolveTraits(
  scan:           PartialScan,
  existingTraits: UserTraits | undefined,
): {
  resolvedTraits:       { face_shape?: string; skin_undertone?: string };
  pendingConfirmations: PendingTraitDecision[];
  pendingOverrides:     PendingTraitDecision[];
} {
  const resolvedTraits:       { face_shape?: string; skin_undertone?: string } = {};
  const pendingConfirmations: PendingTraitDecision[] = [];
  const pendingOverrides:     PendingTraitDecision[] = [];

  for (const trait of TRACKED_TRAITS) {
    const scanValue       = readScanValue(scan, trait);
    const scanConfidence  = readScanConfidence(scan, trait);
    const scanAlternative = readScanAlternative(scan, trait);
    const locked          = existingTraits?.[trait];

    if (scanValue == null) continue;       // nothing to resolve

    if (locked) {
      // ── Locked trait path ──
      if (
        scanConfidence >= OVERRIDE_CONFIDENCE_THRESHOLD &&
        scanValue     !== locked.value
      ) {
        pendingOverrides.push({
          trait,
          kind:        'override',
          primary:     locked.value,       // keep locked as the safe default
          alternative: scanValue,          // the model's challenge
          confidence:  scanConfidence,
        });
      }
      resolvedTraits[trait] = locked.value;
    } else {
      // ── Unlocked (first-scan) path ──
      resolvedTraits[trait] = scanValue;
      if (scanConfidence < LOW_CONFIDENCE_THRESHOLD) {
        pendingConfirmations.push({
          trait,
          kind:        'confirm',
          primary:     scanValue,
          alternative: scanAlternative ?? scanValue,  // fallback if model didn't name one
          confidence:  scanConfidence,
        });
      }
    }
  }

  return { resolvedTraits, pendingConfirmations, pendingOverrides };
}

// ─── buildTraitsToSave ───────────────────────────────────────────────────────
// Compose the UserTraits object to write back to users.traits after a scan
// (with or without user confirmations). Preserves existing locked entries
// unchanged unless they were explicitly overridden.
//
// `confirmations` is keyed by trait name. A value present here means the user
// picked it on the confirmation screen. A value NOT present means the trait
// wasn't surfaced to the user — we auto-lock the scan value if its confidence
// cleared the threshold.
export function buildTraitsToSave(
  scan:           PartialScan,
  confirmations:  Record<string, { value: string; source: UserTrait['source'] }>,
  existingTraits: UserTraits | undefined,
): UserTraits {
  const now  = new Date().toISOString();
  const next: UserTraits = { ...(existingTraits ?? {}) };

  for (const trait of TRACKED_TRAITS) {
    const confirmation = confirmations[trait];
    if (confirmation) {
      next[trait] = {
        value:      confirmation.value,
        confidence: readScanConfidence(scan, trait),
        locked_at:  now,
        source:     confirmation.source,
      };
      continue;
    }

    // No user confirmation → auto-lock only if the trait isn't already locked
    // AND the scan cleared the threshold.
    if (!existingTraits?.[trait]) {
      const scanValue      = readScanValue(scan, trait);
      const scanConfidence = readScanConfidence(scan, trait);
      if (scanValue != null && scanConfidence >= LOW_CONFIDENCE_THRESHOLD) {
        next[trait] = {
          value:      scanValue,
          confidence: scanConfidence,
          locked_at:  now,
          source:     'first_scan_auto',
        };
      }
    }
  }

  return next;
}

// ─── Supabase helpers ────────────────────────────────────────────────────────

export async function fetchUserTraits(userId: string): Promise<UserTraits | undefined> {
  const { data, error } = await supabase
    .from('users')
    .select('traits')
    .eq('id', userId)
    .single();
  if (error) {
    console.warn('[traits] fetchUserTraits failed:', error.message);
    return undefined;
  }
  return (data as { traits?: UserTraits } | null)?.traits;
}

export async function saveUserTraits(userId: string, traits: UserTraits): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ traits })
    .eq('id', userId);
  if (error) {
    console.warn('[traits] saveUserTraits failed:', error.message);
  }
}

// Stamp users.face_shape_confirmed_at the moment the user explicitly
// confirms (or overrides) face_shape via TraitConfirmScreen. The presence of
// this timestamp is what gates whether future scans surface the face_shape
// row again — see useScan.start().
//
// TODO (Phase 7): when Profile editing lets the user change face_shape
// outside the scan flow, that handler must call this same helper so the
// timestamp moves forward and reflects the latest user-asserted value.
export async function markFaceShapeConfirmed(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ face_shape_confirmed_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    console.warn('[traits] markFaceShapeConfirmed failed:', error.message);
  }
}

export async function fetchFaceShapeConfirmedAt(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('face_shape_confirmed_at')
    .eq('id', userId)
    .single();
  if (error) {
    console.warn('[traits] fetchFaceShapeConfirmedAt failed:', error.message);
    return null;
  }
  return (data as { face_shape_confirmed_at?: string | null } | null)?.face_shape_confirmed_at ?? null;
}
