// Fitzpatrick-scale → DepthTier mapping. Extracted from lib/gemini/shared.ts
// during Phase XIII-b cleanup so scanService can import it without pulling
// in the deleted Gemini-direct module.

import type { DepthTier } from '../../types';

export function fitzpatrickToDepthTier(fitzpatrick: number | null | undefined): DepthTier | null {
  if (fitzpatrick == null) return null;
  if (fitzpatrick <= 2)   return 'fair';
  if (fitzpatrick === 3)  return 'light_medium';
  if (fitzpatrick === 4)  return 'medium';
  if (fitzpatrick === 5)  return 'tan';
  if (fitzpatrick === 6)  return 'deep';
  return null;
}
