import type { HairProfile } from '../types';

// True when the user has actually filled in their hair profile.
// Empty object ({}) is treated as "not set" — Supabase JSONB columns
// can return {} after a partial upsert, and !{} is false in JS so a
// naive truthy check would miss this.
export function hasValidHairProfile(
  profile: HairProfile | null | undefined,
): boolean {
  return (
    !!profile &&
    typeof profile === 'object' &&
    Object.keys(profile).length > 0
  );
}
