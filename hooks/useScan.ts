// useScan — manages all state for the scan tab.
// The scan screen imports this hook and drives its UI from these values.

import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { runScanPhase1, runScanPhase2 } from '../services/scanService';
import type { Scan, PartialScan } from '../types';

export type ScanPhase = 'home' | 'camera' | 'processing' | 'result';

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

      // PHASE 1 — vision only (~18s)
      setProcessingStep('Analysing your skin…');
      const phase1 = await runScanPhase1(photoUri, resolvedGender, user.id, undefined, scanType);

      // Build partial scan to show ObservationScreen immediately
      const partialScan: PartialScan = {
        id:                `local_${Date.now()}`,
        user_id:           user.id,
        face_shape:        phase1.analysis.face_shape,
        skin_type:         phase1.analysis.skin_type,
        skin_concerns:     phase1.analysis.skin_concerns,
        beard_density:     phase1.analysis.beard_density,
        beard_condition:   phase1.analysis.beard_condition,
        brow_condition:    phase1.analysis.brow_condition,
        undereye:          phase1.analysis.undereye,
        fitzpatrick_scale: phase1.analysis.fitzpatrick_scale ?? null,
        skin_tone:         phase1.analysis.skin_tone ?? null,
        skin_undertone:    phase1.analysis.skin_undertone ?? null,
        score_skin:        phase1.analysis.score_skin ?? null,
        score_beard:       phase1.analysis.score_beard ?? null,
        score_makeup:      phase1.analysis.score_makeup ?? null,
        score_overall:     null,
        recommendations:   null,
        created_at:        new Date().toISOString(),
      };

      // Show ObservationScreen immediately
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
  };
}
