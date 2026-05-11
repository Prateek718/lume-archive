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
  gemini_scans_enabled: boolean;
}

const DEFAULTS: AppConfig = {
  gemini_scans_enabled: true,
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
        if (row.key === 'gemini_scans_enabled' && typeof row.value === 'boolean') {
          next.gemini_scans_enabled = row.value;
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

export async function isGeminiEnabled(): Promise<boolean> {
  const c = await fetchAppConfig();
  return c.gemini_scans_enabled;
}
