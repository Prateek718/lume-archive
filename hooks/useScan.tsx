// useScan — React Context wrapping the scan flow state machine.
//
// State transitions:
//   idle → phase1 → (needs_beard_goal | needs_trait_confirm | phase2) → success | error
//
// needs_beard_goal and needs_trait_confirm can occur sequentially: if both are
// required, beard goal is asked first, then trait confirm, then phase 2.
//
// Mounted as <ScanProvider> at the app root so screens in the scan flow
// (scan.tsx, (scan)/beard-goal, (scan)/trait-confirm, (scan)/complete) all
// share the same state.

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  runScanPhase1,
  runScanPhase2,
  finalizeTraitsAndRunPhase2,
  refreshRecommendations,
  type Phase1Result,
} from '../services/scanService';
import type { BeardGoal, PartialScan, Scan, UserTrait } from '../types';

export type ScanState =
  | 'idle'
  | 'phase1'
  | 'needs_beard_goal'
  | 'needs_trait_confirm'
  | 'phase2'
  | 'phase2_failed'
  | 'success'
  | 'error';

// Cap user-driven retry attempts after Phase 2 has already exhausted its
// internal retry loop. After this many manual retries we surface a hard
// 'error' so the user is nudged to start over instead of looping forever.
const MAX_PHASE2_RETRIES = 2;

interface ScanContextValue {
  state:        ScanState;
  result:       Scan | null;
  error:        string | null;
  partialScan:  PartialScan | null;
  failedScanId: string | null;
  start:        (photoUri: string, gender: string) => Promise<void>;
  submitBeardGoal: (goal: BeardGoal) => Promise<void>;
  confirmTraits:   (
    confirmations: Record<string, { value: string; source: UserTrait['source'] }>,
  ) => Promise<void>;
  retryPhase2:  () => Promise<void>;
  reset:        () => void;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [state,  setState]  = useState<ScanState>('idle');
  const [result, setResult] = useState<Scan | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [partialScan, setPartialScan] = useState<PartialScan | null>(null);
  const [failedScanId, setFailedScanId] = useState<string | null>(null);

  const phase1Ref = useRef<Phase1Result | null>(null);
  const userIdRef = useRef<string | null>(null);
  const genderRef = useRef<string>('man');
  const phase2RetryCountRef = useRef(0);

  const reset = useCallback(() => {
    setState('idle');
    setResult(null);
    setError(null);
    setPartialScan(null);
    setFailedScanId(null);
    phase1Ref.current = null;
    userIdRef.current = null;
    phase2RetryCountRef.current = 0;
  }, []);

  const fail = useCallback((message: string) => {
    setError(message);
    setState('error');
  }, []);

  // Phase 2 has already exhausted its internal retry loop in lib/gemini.ts —
  // failing here means the network or model is genuinely unhappy. The scan row
  // already exists with Phase 1 analysis data, so we can recover by retrying
  // just the recs generation without redoing the photo.
  const failPhase2 = useCallback((scanId: string, message: string) => {
    setError(message);
    setFailedScanId(scanId);
    setState('phase2_failed');
  }, []);

  const continueToPhase2 = useCallback(async () => {
    const phase1 = phase1Ref.current;
    const userId = userIdRef.current;
    if (!phase1 || !userId) {
      fail('Internal error: missing phase 1 context');
      return;
    }
    setState('phase2');
    try {
      const scan = await runScanPhase2(
        phase1.scanId,
        phase1.analysis,
        phase1.userProfile,
        phase1.scanType,
        genderRef.current,
        userId,
        phase1.scanNumber,
        undefined,
        phase1.partialScan,
      );
      setResult(scan);
      setState('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[useScan] phase2 error:', msg);
      // Scan row already exists with Phase 1 data — degrade to recoverable
      // failure so the user can retry recs without redoing the photo.
      failPhase2(phase1.scanId, msg);
    }
  }, [fail, failPhase2]);

  const retryPhase2 = useCallback(async () => {
    const userId = userIdRef.current;
    const scanId = failedScanId;
    if (!userId || !scanId) {
      fail('No active scan to retry');
      return;
    }
    if (phase2RetryCountRef.current >= MAX_PHASE2_RETRIES) {
      fail('We tried a few times and the network is still unhappy. Start over when you have a stronger connection.');
      return;
    }
    phase2RetryCountRef.current += 1;
    setError(null);
    setState('phase2');
    try {
      // refreshRecommendations re-runs Gemini against the most recent scan row
      // for this user. The failed Phase 2 scan IS the latest, so this targets it.
      await refreshRecommendations(userId);
      // Pull the now-completed scan row so downstream screens have the result.
      const { data: row } = await supabase
        .from('scans')
        .select('*')
        .eq('id', scanId)
        .single();
      if (row) {
        setResult(row as Scan);
        setFailedScanId(null);
        setState('success');
      } else {
        fail('Scan saved but could not be loaded');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[useScan] retryPhase2 error:', msg);
      failPhase2(scanId, msg);
    }
  }, [fail, failPhase2, failedScanId]);

  const start = useCallback(async (photoUri: string, gender: string) => {
    setError(null);
    setResult(null);
    setPartialScan(null);
    setState('phase1');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        fail('Not signed in');
        return;
      }
      userIdRef.current = user.id;

      // Prefer the gender on the users row over the value the screen passed in.
      // Also pull face_shape_confirmed_at so we can skip that row in trait
      // confirm if the user has already locked it in a prior scan.
      let resolvedGender              = gender;
      let faceShapeConfirmedAt: string | null = null;
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('gender, face_shape_confirmed_at')
          .eq('id', user.id)
          .single();
        if (profile?.gender) resolvedGender = profile.gender as string;
        faceShapeConfirmedAt = (profile as { face_shape_confirmed_at?: string | null } | null)
          ?.face_shape_confirmed_at ?? null;
      } catch (profileErr) {
        console.warn('[useScan] failed to fetch user profile:',
          profileErr instanceof Error ? profileErr.message : String(profileErr));
      }
      genderRef.current = resolvedGender;

      const phase1 = await runScanPhase1(photoUri, resolvedGender, user.id);
      phase1Ref.current = phase1;

      // If face_shape was confirmed in a prior scan, drop any pending
      // face_shape decision so the user is never re-asked. skin_undertone
      // continues to follow the Gemini-confidence flow (Phase 7 will revisit).
      if (faceShapeConfirmedAt) {
        const pd = phase1.partialScan._pendingTraitDecisions;
        if (pd) {
          pd.confirmations = pd.confirmations.filter(d => d.trait !== 'face_shape');
          pd.overrides     = pd.overrides.filter(d => d.trait !== 'face_shape');
        }
      }

      setPartialScan(phase1.partialScan);

      // Branching:
      // 1. Beard goal — men/other with detected beard, only if not already set.
      const beardApplicable =
        (resolvedGender === 'man' || resolvedGender === 'other') &&
        !!phase1.analysis.beard_density &&
        phase1.analysis.beard_density !== 'none';
      let needsBeardGoal = false;
      if (beardApplicable) {
        const { data: userRow } = await supabase
          .from('users')
          .select('beard_goal')
          .eq('id', user.id)
          .single();
        const existing = (userRow as { beard_goal?: BeardGoal | null } | null)?.beard_goal;
        if (!existing) needsBeardGoal = true;
      }
      if (needsBeardGoal) {
        setState('needs_beard_goal');
        return;
      }

      // 2. Trait confirm — driven by Gemini confidence on face_shape / undertone.
      const pending = phase1.partialScan._pendingTraitDecisions;
      if (pending && (pending.confirmations.length > 0 || pending.overrides.length > 0)) {
        setState('needs_trait_confirm');
        return;
      }

      await continueToPhase2();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[useScan] start error:', msg);
      fail(msg);
    }
  }, [continueToPhase2, fail]);

  const submitBeardGoal = useCallback(async (goal: BeardGoal) => {
    const userId = userIdRef.current;
    if (!userId) {
      fail('No active scan');
      return;
    }
    try {
      await supabase
        .from('users')
        .update({ beard_goal: goal })
        .eq('id', userId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[useScan] submitBeardGoal save failed:', msg);
      fail(msg);
      return;
    }

    // After capturing the beard goal, the trait confirm step may still be due.
    const phase1 = phase1Ref.current;
    if (phase1) {
      const pending = phase1.partialScan._pendingTraitDecisions;
      if (pending && (pending.confirmations.length > 0 || pending.overrides.length > 0)) {
        setState('needs_trait_confirm');
        return;
      }
    }
    await continueToPhase2();
  }, [continueToPhase2, fail]);

  const confirmTraits = useCallback(async (
    confirmations: Record<string, { value: string; source: UserTrait['source'] }>,
  ) => {
    const phase1 = phase1Ref.current;
    const userId = userIdRef.current;
    if (!phase1 || !userId) {
      fail('No active scan');
      return;
    }
    setState('phase2');
    try {
      const scan = await finalizeTraitsAndRunPhase2(
        userId,
        phase1.partialScan,
        confirmations,
        {
          scanId:         phase1.scanId,
          analysis:       phase1.analysis,
          userProfile:    phase1.userProfile,
          scanType:       phase1.scanType,
          scanNumber:     phase1.scanNumber,
          existingTraits: phase1.existingTraits,
          gender:         genderRef.current,
        },
      );
      setResult(scan);
      setState('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[useScan] confirmTraits error:', msg);
      // Scan row exists once trait finalize has run — same recoverable path.
      failPhase2(phase1.scanId, msg);
    }
  }, [fail, failPhase2]);

  const value: ScanContextValue = {
    state,
    result,
    error,
    partialScan,
    failedScanId,
    start,
    submitBeardGoal,
    confirmTraits,
    retryPhase2,
    reset,
  };

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScan must be used inside <ScanProvider>');
  return ctx;
}
