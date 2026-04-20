// useScan — manages all state for the scan tab.
// The scan screen imports this hook and drives its UI from these values.

import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { runScanPhase1, runScanPhase2 } from '../services/scanService';
import type { Scan } from '../types';

export type ScanPhase = 'home' | 'camera' | 'processing' | 'result';

// Shared with app/confirm-traits.tsx — when the confirmation flow finalizes
// a scan, it drops the completed Scan here and routes back to the scan tab,
// where hydratePendingObservation() picks it up and jumps to 'result'.
export const PENDING_OBSERVATION_KEY = '@lume/pending_observation_scan';

export function useScan() {
  const router = useRouter();
  const [phase,          setPhase]          = useState<ScanPhase>('home');
  const [processingStep, setProcessingStep] = useState('');
  const [result,         setResult]         = useState<Scan | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [recsLoading,    setRecsLoading]    = useState(false);
  const [recsError,      setRecsError]      = useState(false);

  const openCamera = useCallback(() => {
    setError(null);
    setPhase('camera');
  }, []);

  const reset = useCallback(() => {
    setPhase('home');
    setResult(null);
    setError(null);
    setProcessingStep('');
    setRecsLoading(false);
    setRecsError(false);
  }, []);

  // Called by scan.tsx on focus. Picks up a scan finalized by the
  // confirm-traits flow and jumps straight to ObservationScreen.
  const hydratePendingObservation = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_OBSERVATION_KEY);
      if (!raw) return;
      await AsyncStorage.removeItem(PENDING_OBSERVATION_KEY);
      const scan = JSON.parse(raw) as Scan;
      setResult(scan);
      setPhase('result');
      setRecsLoading(false);
      setRecsError(false);
    } catch (e) {
      console.warn('[useScan] hydratePendingObservation failed:', e);
    }
  }, []);

  const processPhoto = useCallback(async (photoUri: string, genderParam: string, scanType: string = 'full_face') => {
    setError(null);
    setRecsError(false);
    setPhase('processing');

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/(auth)/splash');
        setPhase('home');
        return;
      }

      let resolvedGender: string = genderParam;
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('gender')
          .eq('id', user.id)
          .single();
        if (profile?.gender) resolvedGender = profile.gender as string;
      } catch (profileError: unknown) {
        console.error('[useScan] Failed to fetch gender:',
          profileError instanceof Error ? profileError.message : String(profileError));
      }

      // PHASE 1 — vision + trait resolution (~18s)
      setProcessingStep('Analysing your skin…');
      const phase1 = await runScanPhase1(photoUri, resolvedGender, user.id, undefined, scanType);
      const { partialScan } = phase1;

      // If any trait needs user input, hand off to confirm-traits. We skip
      // phase 2 until the user has resolved all decisions — recs must be
      // based on confirmed traits.
      const pending = partialScan._pendingTraitDecisions;
      if (pending && (pending.confirmations.length > 0 || pending.overrides.length > 0)) {
        setPhase('home');                    // release the processing screen
        setProcessingStep('');

        // compressedUri is unused in phase 2 (base64 isn't re-sent) so we
        // drop it here to keep the router params small.
        const phase1ContextJson = JSON.stringify({
          analysis:        phase1.analysis,
          userProfile:     phase1.userProfile,
          previousContext: phase1.previousContext,
          scanType:        phase1.scanType,
          existingTraits:  phase1.existingTraits,
          gender:          resolvedGender,
        });
        // Cast: router's generated route types may not yet include the new
        // /confirm-traits screen on first build — expo regenerates them.
        router.push({
          pathname: '/confirm-traits' as never,
          params:   {
            partialScanJson:   JSON.stringify(partialScan),
            phase1ContextJson,
          },
        });
        return;
      }

      // Happy path — show ObservationScreen immediately, run phase 2 in bg.
      setResult(partialScan as unknown as Scan);
      setPhase('result');
      setRecsLoading(true);

      // PHASE 2 — recommendations in background (~32s)
      try {
        const completeScan = await runScanPhase2(
          phase1.analysis,
          phase1.userProfile,
          phase1.previousContext,
          phase1.scanType,
          phase1.compressedUri,
          resolvedGender,
          user.id,
          undefined,
          partialScan,
        );
        setResult(completeScan);
      } catch (phase2Error: unknown) {
        const msg = phase2Error instanceof Error ? phase2Error.message : String(phase2Error);
        console.error('[useScan] phase2 error:', msg);
        setRecsError(true);
      } finally {
        setRecsLoading(false);
      }

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useScan] processPhoto crashed:', msg);
      setPhase('camera');
      setError('Something went wrong. Please try again.');
    }
  }, [router]);

  return {
    phase,
    processingStep,
    result,
    error,
    recsLoading,
    recsError,
    openCamera,
    reset,
    processPhoto,
    hydratePendingObservation,
  };
}
