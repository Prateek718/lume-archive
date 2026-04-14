// useScan — manages all state for the scan tab.
// The scan screen imports this hook and drives its UI from these values.

import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { runScan } from '../services/scanService';
import type { Scan } from '../types';

export type ScanPhase = 'home' | 'camera' | 'processing' | 'result';

export function useScan() {
  const router = useRouter();
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

  const processPhoto = useCallback(async (photoUri: string, genderParam: string) => {
    setError(null);
    setPhase('processing');

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/(auth)/splash');
        setPhase('home');
        return;
      }

      let gender: string = genderParam;
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('gender')
          .eq('id', user.id)
          .single();
        if (profile?.gender) gender = profile.gender as string;
      } catch (profileError: unknown) {
        console.error('[useScan] Failed to fetch gender:',
          profileError instanceof Error ? profileError.message : String(profileError));
      }

      const scan = await runScan(photoUri, gender, user.id, (step) => {
        setProcessingStep(step);
      });

      setResult(scan);
      setPhase('result');
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
    openCamera,
    reset,
    processPhoto,
  };
}
