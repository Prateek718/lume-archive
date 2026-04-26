import type { SkinConcernObservation } from '../types';

interface ScanWithConcerns {
  skin_concerns_detailed?: SkinConcernObservation[] | null;
  // Loose typing: recommendations is JSONB. The real Recommendations interface
  // doesn't carry skin_concerns_detailed, but legacy rows may have it stashed
  // at the root or under `skin`. Accept anything and narrow at runtime.
  recommendations?: unknown;
}

/**
 * Returns skin_concerns_detailed from a scan row.
 * Preferred source: top-level scans.skin_concerns_detailed column (added Phase 4A.3).
 * Fallback sources: nested in recommendations JSONB (legacy path for pre-4A.3 scans).
 */
export function getSkinConcernsDetailed(
  scan: ScanWithConcerns | null | undefined,
): SkinConcernObservation[] {
  if (!scan) return [];

  if (Array.isArray(scan.skin_concerns_detailed)) {
    return scan.skin_concerns_detailed as SkinConcernObservation[];
  }

  const recs = scan.recommendations;
  if (recs && typeof recs === 'object') {
    const r = recs as { skin_concerns_detailed?: unknown; skin?: { skin_concerns_detailed?: unknown } };
    const candidates = [
      r.skin_concerns_detailed,
      r.skin?.skin_concerns_detailed,
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) return c as SkinConcernObservation[];
    }
  }

  return [];
}
