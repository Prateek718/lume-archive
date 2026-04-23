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
  type Phase1Result,
} from '../services/scanService';
import type { BeardGoal, PartialScan, Scan, UserTrait } from '../types';

export type ScanState =
  | 'idle'
  | 'phase1'
  | 'needs_beard_goal'
  | 'needs_trait_confirm'
  | 'phase2'
  | 'success'
  | 'error';

interface ScanContextValue {
  state:        ScanState;
  result:       Scan | null;
  error:        string | null;
  partialScan:  PartialScan | null;
  start:        (photoUri: string, gender: string) => Promise<void>;
  submitBeardGoal: (goal: BeardGoal) => Promise<void>;
  confirmTraits:   (
    confirmations: Record<string, { value: string; source: UserTrait['source'] }>,
  ) => Promise<void>;
  reset:        () => void;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [state,  setState]  = useState<ScanState>('idle');
  const [result, setResult] = useState<Scan | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [partialScan, setPartialScan] = useState<PartialScan | null>(null);

  const phase1Ref = useRef<Phase1Result | null>(null);
  const userIdRef = useRef<string | null>(null);
  const genderRef = useRef<string>('man');

  const reset = useCallback(() => {
    setState('idle');
    setResult(null);
    setError(null);
    setPartialScan(null);
    phase1Ref.current = null;
    userIdRef.current = null;
  }, []);

  const fail = useCallback((message: string) => {
    setError(message);
    setState('error');
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
        undefined,
        phase1.partialScan,
      );
      setResult(scan);
      setState('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[useScan] phase2 error:', msg);
      fail(msg);
    }
  }, [fail]);

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
      let resolvedGender = gender;
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('gender')
          .eq('id', user.id)
          .single();
        if (profile?.gender) resolvedGender = profile.gender as string;
      } catch (profileErr) {
        console.warn('[useScan] failed to fetch gender:',
          profileErr instanceof Error ? profileErr.message : String(profileErr));
      }
      genderRef.current = resolvedGender;

      const phase1 = await runScanPhase1(photoUri, resolvedGender, user.id);
      phase1Ref.current = phase1;
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
          existingTraits: phase1.existingTraits,
          gender:         genderRef.current,
        },
      );
      setResult(scan);
      setState('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[useScan] confirmTraits error:', msg);
      fail(msg);
    }
  }, [fail]);

  const value: ScanContextValue = {
    state,
    result,
    error,
    partialScan,
    start,
    submitBeardGoal,
    confirmTraits,
    reset,
  };

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScan must be used inside <ScanProvider>');
  return ctx;
}
