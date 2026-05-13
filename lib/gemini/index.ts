// Barrel for the gemini pipeline. Phase 6.2 split lib/gemini.ts (1717 lines)
// into per-section modules. Existing imports — `import { ... } from
// '../lib/gemini'` — keep working through these re-exports.

// Vision (Phase 1) ----------------------------------------------------------
export { analyseWithGemini } from './vision';
export type { GeminiAnalysis, ObservationOutput } from './vision';

// Per-section recs (Phase 2) ------------------------------------------------
export { getSkinRecommendations }   from './skin';
export { getBeardRecommendations }  from './beard';
export { getMakeupRecommendations } from './makeup';
export { getHairRecommendationsFromGemini } from './hair';

// Rescan delta narrative ----------------------------------------------------
export { getDeltaCommentary } from './delta';
export type { DeltaCommentary, DekLine } from './delta';
