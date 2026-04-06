// useScan — manages all state for the scan tab.
// The scan screen imports this hook and drives its UI from these values.

import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GUEST_PROFILE_KEY } from '../app/_layout';
import { runScan } from '../services/scanService';
import type { Scan } from '../types';

export type ScanPhase = 'home' | 'camera' | 'processing' | 'result';

export function useScan() {
  const [phase,          setPhase]          = useState<ScanPhase>('home');
  const [processingStep, setProcessingStep] = useState('');
  const [result,         setResult]         = useState<Scan | null>(null);
  const [error,          setError]          = useState<string | null>(null);

  const openCamera = useCallback(() => {
    setError(null);
    setPhase('camera');
  }, []);

  const reset = useCallback(() => {
    setPhase('home');
    setResult(null);
    setError(null);
    setProcessingStep('');
  }, []);

  const processPhoto = useCallback(async (photoUri: string, gender: string) => {
    setError(null);
    setPhase('processing');

    try {
      console.log('[useScan] Starting processPhoto');

      const profileStr = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
      const profile = profileStr ? JSON.parse(profileStr) as { id: string; gender: string } : { id: 'guest', gender: 'man' };
      const userId = profile.id;
      console.log('[useScan] Got user:', userId);

      console.log('[useScan] Calling Gemini API');
      const scan = await runScan(photoUri, gender, userId, (step) => {
        if (step.toLowerCase().includes('gemini') || step.toLowerCase().includes('analysing')) {
          console.log('[useScan] Gemini response received');
        }
        if (step.toLowerCase().includes('saving') || step.toLowerCase().includes('supabase')) {
          console.log('[useScan] Saving to Supabase');
        }
        setProcessingStep(step);
      });

      console.log('[useScan] Scan saved successfully');
      setResult(scan);
      setPhase('result');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[useScan] processPhoto crashed:', msg);
      setPhase('camera');
      setError('Something went wrong. Please try again.');
    }
  }, []);

  return {
    phase,
    processingStep,
    result,
    error,
    openCamera,
    reset,
    processPhoto,
  };
}
