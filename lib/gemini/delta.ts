// Delta commentary call. Thin wrapper around the `gemini-delta-commentary`
// edge function — prompt, retry, server-side worsened computation, and
// telemetry all live server-side.
//
// Wired into services/scanService.runScanPhase2 after Phase 2 settles for
// rescans. If this call fails, the delta screens fall back to mechanically
// derived static copy — never blocking the rescan flow.
//
// See docs/phase-xiii-architecture.md §1.6, §4.2, §10.3.

import { supabase } from '../supabase';
import { isDeltaCommentaryEnabled } from '../appConfig';
import type { Scan } from '../../types';

export interface DekLine {
  number:   '01' | '02' | '03';
  headline: string;
  body:     string;
}

export interface DeltaCommentary {
  cover_dek:     string;
  cover_lines:   [DekLine, DekLine, DekLine];
  concern_notes: { [concernKey: string]: string };
  closing_line:  string;
}

export async function getDeltaCommentary(
  previousScan: Scan,
  currentScan:  Scan,
  scanDelta: {
    days_between:        number;
    concerns_improved:   string[];
    concerns_new:        string[];
    concerns_persistent: string[];
  },
  scanNumber:   number,
  options?: { scanId?: string | null },
): Promise<DeltaCommentary> {
  if (!(await isDeltaCommentaryEnabled())) {
    throw new Error('Delta commentary is temporarily unavailable.');
  }

  const { data, error } = await supabase.functions.invoke('gemini-delta-commentary', {
    body: {
      previousScan: {
        skin_concerns:          previousScan.skin_concerns ?? [],
        skin_concerns_detailed: previousScan.skin_concerns_detailed ?? [],
      },
      currentScan: {
        skin_concerns:          currentScan.skin_concerns ?? [],
        skin_concerns_detailed: currentScan.skin_concerns_detailed ?? [],
      },
      scanDelta,
      scanNumber,
      scanId: options?.scanId ?? null,
    },
  });

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`gemini-delta-commentary invoke failed: ${msg}`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('gemini-delta-commentary returned empty body');
  }
  if ('error' in (data as Record<string, unknown>)) {
    throw new Error(String((data as { error: unknown }).error));
  }

  return data as DeltaCommentary;
}
