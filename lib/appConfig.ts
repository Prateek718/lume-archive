// Remote feature flags read from public.app_config. Cached in memory
// with a 5-minute TTL. Cache also invalidates on app foreground via
// the AppState listener registered in app/_layout.tsx.
//
// FAIL-OPEN BY DESIGN: if the Supabase read fails (network blip, DB
// outage), assume features are enabled. The kill switch's purpose is
// to disable scans when WE choose to — not when an unrelated network
// failure happens to coincide. Failing closed on a network blip would
// brick scans for users on flaky connections every time the cache TTL
// expired. Accept the small window of "still scanning during an
// emergency on a stale-cached client" as the price of availability.
//
// See docs/phase-xiii-architecture.md §10.2.

import { supabase } from './supabase';

export interface AppConfig {
  gemini_scans_enabled:     boolean;
  vision_enabled:           boolean;
  skin_recs_enabled:        boolean;
  beard_recs_enabled:       boolean;
  makeup_recs_enabled:      boolean;
  hair_recs_enabled:        boolean;
  delta_commentary_enabled: boolean;
}

const DEFAULTS: AppConfig = {
  gemini_scans_enabled:     true,
  vision_enabled:           true,
  skin_recs_enabled:        true,
  beard_recs_enabled:       true,
  makeup_recs_enabled:      true,
  hair_recs_enabled:        true,
  delta_commentary_enabled: true,
};

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { config: AppConfig; fetchedAt: number } | null = null;
let inflight: Promise<AppConfig> | null = null;

export async function fetchAppConfig(): Promise<AppConfig> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.config;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('key, value');
      if (error) throw error;

      const next: AppConfig = { ...DEFAULTS };
      for (const row of data ?? []) {
        if (typeof row.value !== 'boolean') continue;
        switch (row.key) {
          case 'gemini_scans_enabled':     next.gemini_scans_enabled = row.value;     break;
          case 'vision_enabled':           next.vision_enabled = row.value;           break;
          case 'skin_recs_enabled':        next.skin_recs_enabled = row.value;        break;
          case 'beard_recs_enabled':       next.beard_recs_enabled = row.value;       break;
          case 'makeup_recs_enabled':      next.makeup_recs_enabled = row.value;      break;
          case 'hair_recs_enabled':        next.hair_recs_enabled = row.value;        break;
          case 'delta_commentary_enabled': next.delta_commentary_enabled = row.value; break;
        }
      }
      cache = { config: next, fetchedAt: Date.now() };
      return next;
    } catch (err) {
      console.warn('[appConfig] fetch failed, using defaults:', err);
      // Default-on; do NOT cache the failure — retry on next call.
      return DEFAULTS;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function invalidateAppConfigCache(): void {
  cache = null;
}

// Master-only check. Kept as an alias of the top-level flag for callers
// that want only the master state — e.g. an admin surface displaying
// "scans globally disabled" without caring which specific call is in play.
export async function isGeminiEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled;
}

// Per-call helpers — each returns true if AND ONLY IF both the master
// flag (gemini_scans_enabled) AND the call-specific flag are true. The
// master short-circuits: flipping master to false disables every call
// regardless of per-call state.

export async function isVisionEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.vision_enabled;
}

export async function isSkinRecsEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.skin_recs_enabled;
}

export async function isBeardRecsEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.beard_recs_enabled;
}

export async function isMakeupRecsEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.makeup_recs_enabled;
}

export async function isHairRecsEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.hair_recs_enabled;
}

export async function isDeltaCommentaryEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled && c.delta_commentary_enabled;
}
