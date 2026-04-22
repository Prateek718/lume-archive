// useScan — manages all state for the scan tab.
// The scan screen imports this hook and drives its UI from these values.

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import {
  runScanPhase1, runScanPhase2, generateAndSaveHairProfile,
} from '../services/scanService';
import type { Scan, HairProfile } from '../types';
import type { RescanFeedback } from '../components/RescanFeedbackFlow';

export type ScanPhase = 'home' | 'camera' | 'processing' | 'result';

// Max total time to wait between starting phase 1 and proceeding to phase 2,
// when the user is filling in their hair profile alongside the vision call.
// Phase 1 is ~18s, so this leaves ~12s of extra space for the user to finish.
const HAIR_PROFILE_TOTAL_TIMEOUT_MS = 30_000;

// Shared with app/confirm-traits.tsx — when the confirmation flow finalizes
// a scan, it drops the completed Scan here and routes back to the scan tab,
// where hydratePendingObservation() picks it up and jumps to 'result'.
export const PENDING_OBSERVATION_KEY = '@lume/pending_observation_scan';

export function useScan() {
  const router = useRouter();
  const [phase,            setPhase]            = useState<ScanPhase>('home');
  const [processingStep,   setProcessingStep]   = useState('');
  const [result,           setResult]           = useState<Scan | null>(null);
  const [error,            setError]            = useState<string | null>(null);
  const [recsLoading,      setRecsLoading]      = useState(false);
  const [recsError,        setRecsError]        = useState(false);
  // True while phase 1 is running AND the user has no saved hair profile yet —
  // scan.tsx uses this to swap the spinner for the inline HairProfileDuringVision.
  const [showHairProfile,  setShowHairProfile]  = useState(false);

  // Set by processPhoto when it enters the hair-profile-waiting phase.
  // Called by scan.tsx from HairProfileDuringVision.onComplete. Pass null to
  // skip (e.g. user dismissed before completing).
  const hairProfileResolverRef = useRef<((p: HairProfile | null) => void) | null>(null);
  const submitHairProfile = useCallback((profile: HairProfile | null) => {
    const resolver = hairProfileResolverRef.current;
    hairProfileResolverRef.current = null;
    resolver?.(profile);
  }, []);

  // Rescan feedback — collected during phase 2 while the delta row is being
  // computed. Stored as a ref so the latest answers are picked up when delta
  // computation runs, no matter when the user finishes the flow.
  const rescanFeedbackRef = useRef<RescanFeedback | undefined>(undefined);
  const submitRescanFeedback = useCallback((feedback: RescanFeedback) => {
    rescanFeedbackRef.current = feedback;
  }, []);
  // True once runScanPhase2 completes for a 2nd+ scan — scan.tsx uses this
  // to route to /scan-delta instead of /recommendations-view.
  const [isRescanResult, setIsRescanResult] = useState(false);

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
    setShowHairProfile(false);
    setIsRescanResult(false);
    rescanFeedbackRef.current = undefined;
    // If a hair profile wait is in flight, release it so processPhoto can
    // finish its cleanup path.
    if (hairProfileResolverRef.current) {
      const resolver = hairProfileResolverRef.current;
      hairProfileResolverRef.current = null;
      resolver(null);
    }
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

  const processPhoto = useCallback(async (
    photoUri: string,
    genderParam: string,
    scanType: string = 'full_face',
    needsHairProfile: boolean = false,
  ) => {
    console.log('[scan-diag] useScan.processPhoto entered — needsHairProfile:', needsHairProfile,
      '· gender:', genderParam, '· scanType:', scanType);
    setError(null);
    setRecsError(false);
    setPhase('processing');
    console.log('[scan-diag] useScan setShowHairProfile →', needsHairProfile);
    setShowHairProfile(needsHairProfile);

    const processingStart = Date.now();

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/(auth)/splash');
        setPhase('home');
        setShowHairProfile(false);
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

      // PHASE 1 — vision + trait resolution (~18s). Runs in parallel with the
      // user filling out their hair profile (if needsHairProfile is true).
      setProcessingStep('Analysing your skin…');
      const phase1 = await runScanPhase1(photoUri, resolvedGender, user.id, undefined, scanType);
      const { partialScan } = phase1;

      // If a hair profile is being collected in parallel, wait for the user to
      // finish — but cap the total processing time so we never stall the flow.
      if (needsHairProfile) {
        setProcessingStep('Almost there…');
        const elapsed         = Date.now() - processingStart;
        const remainingTimeout = Math.max(0, HAIR_PROFILE_TOTAL_TIMEOUT_MS - elapsed);

        const collectedProfile = await new Promise<HairProfile | null>((resolve) => {
          hairProfileResolverRef.current = resolve;
          if (remainingTimeout <= 0) {
            hairProfileResolverRef.current = null;
            resolve(null);
            return;
          }
          setTimeout(() => {
            if (hairProfileResolverRef.current === resolve) {
              hairProfileResolverRef.current = null;
              resolve(null);
            }
          }, remainingTimeout);
        });

        setShowHairProfile(false);

        if (collectedProfile) {
          // Save the raw profile synchronously so phase 2 can pick it up.
          try {
            await supabase
              .from('users')
              .update({ hair_profile: collectedProfile })
              .eq('id', user.id);
          } catch (saveErr: unknown) {
            console.error('[useScan] hair profile save failed:',
              saveErr instanceof Error ? saveErr.message : String(saveErr));
          }

          // Generate hair recommendations in the background so the hair tab
          // is ready when the user next opens it. Don't block phase 2 on this.
          const faceShape = (partialScan.face_shape as string | null) ?? null;
          generateAndSaveHairProfile(user.id, collectedProfile, faceShape, resolvedGender)
            .catch((err: unknown) => {
              console.error('[useScan] background hair recs gen failed:',
                err instanceof Error ? err.message : String(err));
            });
        }
      } else {
        setShowHairProfile(false);
      }

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

      // Detect rescan BEFORE phase 2 writes the new row. Any existing scan
      // for this user means the in-flight one is a 2nd+ scan.
      let isRescan = false;
      try {
        const { count } = await supabase
          .from('scans')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);
        isRescan = (count ?? 0) >= 1;
      } catch {
        // Non-critical — default to false (treat as first scan).
      }
      setIsRescanResult(isRescan);
      // Reset any stale feedback from a previous scan session.
      rescanFeedbackRef.current = undefined;

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
          () => rescanFeedbackRef.current,
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
      setShowHairProfile(false);
      if (hairProfileResolverRef.current) {
        const resolver = hairProfileResolverRef.current;
        hairProfileResolverRef.current = null;
        resolver(null);
      }
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
    showHairProfile,
    submitHairProfile,
    isRescanResult,
    submitRescanFeedback,
    openCamera,
    reset,
    processPhoto,
    hydratePendingObservation,
  };
}
