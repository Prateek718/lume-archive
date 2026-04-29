// Delta commentary call (Gemini 2.5 Flash). Generates editorial copy that
// frames a rescan as the magazine's next issue: a cover dek, three numbered
// dek lines for IssueCoverScreen, per-concern editorial notes for
// ScanDeltaScreen, and a closing line for the bottom of the delta read.
//
// Wired into services/scanService.runScanPhase2 after Phase 2 settles for
// rescans. If this call fails, the delta screens fall back to mechanically
// derived static copy — never blocking the rescan flow.

import type { Scan, SkinConcernObservation } from '../../types';
import { logUsage } from '../geminiUsage';
import {
  ENDPOINT_TEXT_STREAM,
  RETRY_BACKOFF_MS,
  shouldRetry,
  MODEL_TEXT,
  VOICE_ANCHOR,
  EDITORIAL_RULES,
  cardinal,
  streamGeminiSSE,
} from './shared';

// ═══════════════════════════════════════════════════════════════════════════════
// Output type
// ═══════════════════════════════════════════════════════════════════════════════
export interface DekLine {
  number:   '01' | '02' | '03';
  headline: string;   // 2-4 words, no trailing period
  body:     string;   // 1-2 sentences, max ~150 chars
}

export interface DeltaCommentary {
  cover_dek:     string;                       // 6-10 words, italic voice
  cover_lines:   [DekLine, DekLine, DekLine];
  concern_notes: { [concernKey: string]: string };
  closing_line:  string;                       // 1-2 sentences
}

// Inputs the prompt builder expects. We deliberately strip down the Scan
// shape to the fields that matter for delta narrative.
interface DeltaScanContext {
  scan_number:           number;
  days_between:          number;
  previous_concerns:     string[];
  current_concerns:      string[];
  previous_concerns_detailed: SkinConcernObservation[];
  current_concerns_detailed:  SkinConcernObservation[];
  concerns_improved:     string[];
  concerns_persistent:   string[];
  concerns_new:          string[];
  concerns_worsened:     string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════
function buildDeltaPrompt(ctx: DeltaScanContext): string {
  const issueCardinal = cardinal(ctx.scan_number);

  const voiceRules = `
Delta-specific voice rules — apply on top of EDITORIAL_RULES:

A. Never shame. Phrases like "you slipped", "you didn't stick to it", "you missed days" are forbidden.
   Use observational language: "the routine ran into friction", "the cheeks held steady", "the work was uneven".

B. Never make medical claims about specific outcomes. No "cured", "healed", "fixed".
   Use observational, sensory language: "calmer", "louder", "quieter", "settling", "steadier".

C. Don't reference scores or numbers. The reader should not see "your score went up by 7" or anything similar.

D. Concerns_improved get acknowledgment without celebration. Tone: "the cheeks are reading calmer", "oiliness has quieted".
   Not: "Great job! Your acne is gone." Never exclaim.

E. Concerns_worsened get observation without alarm. Tone: "oil is louder this issue", "dehydration has crept back".
   Not: "Your skin got worse." Never accuse.

F. Concerns_new get curiosity, not concern. Tone: "a new line is asking for attention", "the t-zone has a new note".

G. Concerns_persistent get patience. Tone: "still working on the cheeks", "the dehydration takes its time".

H. Closing line is meta — it observes the reading itself, not the user.
   Good: "Four weeks in, the routine is doing the quiet work."
   Good: "What changed is small. What's holding is everything."
   Bad:  "You're doing great!" / "Keep it up!"
`.trim();

  const userContext = `
SCAN CONTEXT
- Issue number: ${ctx.scan_number} (cardinal: "${issueCardinal}")
- Days between scans: ${ctx.days_between}
- Concerns IMPROVED (gone from previous → current): ${JSON.stringify(ctx.concerns_improved)}
- Concerns PERSISTENT (in both): ${JSON.stringify(ctx.concerns_persistent)}
- Concerns NEW (only in current): ${JSON.stringify(ctx.concerns_new)}
- Concerns WORSENED (severity increased between scans): ${JSON.stringify(ctx.concerns_worsened)}

PREVIOUS scan skin_concerns_detailed:
${JSON.stringify(ctx.previous_concerns_detailed, null, 2)}

CURRENT scan skin_concerns_detailed:
${JSON.stringify(ctx.current_concerns_detailed, null, 2)}
`.trim();

  const instructions = `
INSTRUCTIONS

1. cover_dek — 6 to 10 words. Italic register. The dek that sits below the
   chapter label on the IssueCoverScreen. Should hint at what's moved
   without summarizing every concern. Examples of register:
     "Some things settled. Others are still asking."
     "The reading is quieter than it was."
     "Four weeks of small, steady moves."

2. cover_lines — exactly 3 entries, numbered "01", "02", "03". Together they
   should balance:
     - one observation about what improved or held steady,
     - one observation about what is still working,
     - one forward-looking observation (a new note, or a meta-observation
       about consistency).
   If there is no improvement at all, lead with patience instead.
   If there is no persistence at all, lead with the new note.

   Each entry:
     - headline: 2-4 words, no trailing period.
     - body:     1-2 sentences, max ~150 characters total. Editorial register.

3. concern_notes — a JSON object keyed by EACH concern present in either
   the previous or current scan (use the canonical concern strings from the
   detailed arrays). Each value is one editorial sentence (max ~140 chars)
   observing what changed for that concern. If a concern is in concerns_improved,
   acknowledge calmly. If in concerns_worsened, observe without alarm. If
   persistent at the same severity, acknowledge patience. If new, frame with
   curiosity.

   Use the canonical concern keys verbatim — they are stable IDs the UI looks up.

4. closing_line — 1 to 2 sentences. A meta-observation on the overall reading.
   Sits at the very bottom of the delta screen. Editorial register. Never
   addresses the user as "you".
`.trim();

  const schema = `
OUTPUT JSON SHAPE — return ONLY valid JSON, no markdown:
{
  "cover_dek":   "6-10 word italic dek",
  "cover_lines": [
    { "number": "01", "headline": "...", "body": "..." },
    { "number": "02", "headline": "...", "body": "..." },
    { "number": "03", "headline": "...", "body": "..." }
  ],
  "concern_notes": {
    "<concern>": "one editorial sentence",
    "<concern>": "one editorial sentence"
  },
  "closing_line": "1-2 sentences"
}
`.trim();

  const fewShot = `
FEW-SHOT — Issue two: hyperpigmentation improved, dehydration persistent (severity unchanged), uneven_texture new.

{
  "cover_dek": "Some things settled. Others are still asking.",
  "cover_lines": [
    { "number": "01", "headline": "Pigment, quieter", "body": "The post-acne marks on the right cheek are reading softer this issue. The vitamin C has done patient work." },
    { "number": "02", "headline": "Hydration, still", "body": "The cheeks are holding the same dehydration note. Barrier work runs on its own clock — usually eight to twelve weeks." },
    { "number": "03", "headline": "A new line", "body": "The forehead has a small surface roughness this issue. Worth watching, not worth chasing yet." }
  ],
  "concern_notes": {
    "hyperpigmentation": "The right cheek is reading calmer; the marks have softened without disappearing.",
    "dehydration":      "Still showing on the cheeks at the same depth. Barrier repair takes its own time.",
    "uneven_texture":   "A small new note across the forehead — possibly seasonal, worth watching."
  },
  "closing_line": "Four weeks in, the routine is doing the quiet work. The skin is moving, just not all at once."
}
`.trim();

  return `${VOICE_ANCHOR}

${EDITORIAL_RULES}

${voiceRules}

${userContext}

${instructions}

${schema}

${fewShot}
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// getDeltaCommentary — Flash call. Mirrors skin.ts retry shape.
// ═══════════════════════════════════════════════════════════════════════════════
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
  const start      = Date.now();
  let inputTokens  = 0;
  let outputTokens = 0;

  const previousDetailed: SkinConcernObservation[] = previousScan.skin_concerns_detailed ?? [];
  const currentDetailed:  SkinConcernObservation[] = currentScan.skin_concerns_detailed ?? [];

  // Severity transitions — anything in concerns_persistent that increased
  // severity is "worsened" for the prompt's purposes.
  const SEVERITY_RANK: Record<string, number> = { mild: 1, moderate: 2, significant: 3 };
  const concerns_worsened: string[] = [];
  for (const c of scanDelta.concerns_persistent) {
    const prev = previousDetailed.find(x => x.concern === c);
    const curr = currentDetailed.find(x => x.concern === c);
    if (!prev || !curr) continue;
    const prevRank = SEVERITY_RANK[prev.severity] ?? 0;
    const currRank = SEVERITY_RANK[curr.severity] ?? 0;
    if (currRank > prevRank) concerns_worsened.push(c);
  }

  const ctx: DeltaScanContext = {
    scan_number:               scanNumber,
    days_between:              scanDelta.days_between,
    previous_concerns:         previousScan.skin_concerns ?? [],
    current_concerns:          currentScan.skin_concerns ?? [],
    previous_concerns_detailed: previousDetailed,
    current_concerns_detailed:  currentDetailed,
    concerns_improved:         scanDelta.concerns_improved,
    concerns_persistent:       scanDelta.concerns_persistent,
    concerns_new:              scanDelta.concerns_new,
    concerns_worsened,
  };

  let lastError:        unknown = null;
  let lastRawResponse   = '';
  let lastFinishReason: string | null = null;
  let lastSafetyRatings: unknown | null = null;
  let didRetry = false;

  // At most TWO attempts: initial + at most one conditional retry.
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      console.warn(`[gemini delta_commentary] retry attempt 2/2 after ${RETRY_BACKOFF_MS}ms (finish_reason: ${lastFinishReason ?? 'unknown'})`);
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
    }

    try {
      const body: RequestInit = {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildDeltaPrompt(ctx) }] }],
          generationConfig: {
            temperature:     0,
            // 4096 covers cover_dek + 3 dek lines (~600 tokens) + concern_notes
            // (one sentence per concern, generous bound 8 entries × ~80 = 640)
            // + closing_line + JSON scaffolding, with comfortable headroom.
            maxOutputTokens: 4096,
          },
        }),
      };

      const { text, inputTokens: it, outputTokens: ot, finishReason, safetyRatings } =
        await streamGeminiSSE(ENDPOINT_TEXT_STREAM, body);
      inputTokens      += it;
      outputTokens     += ot;
      lastFinishReason  = finishReason ?? lastFinishReason;
      lastSafetyRatings = safetyRatings ?? lastSafetyRatings;

      if (!text) throw new Error('Gemini returned empty response');

      lastRawResponse = text;

      if (!text.endsWith('}')) {
        throw new Error(
          `Gemini delta response was truncated — increase maxOutputTokens. Last 100 chars: ${text.slice(-100)}`,
        );
      }

      const parsed = JSON.parse(text) as DeltaCommentary;

      // Schema sanity — fall back rather than crash if the prompt drifted.
      if (!parsed.cover_lines || parsed.cover_lines.length !== 3) {
        throw new Error('Delta commentary missing 3 cover_lines');
      }
      if (!parsed.cover_dek || typeof parsed.cover_dek !== 'string') {
        throw new Error('Delta commentary missing cover_dek');
      }
      if (!parsed.concern_notes || typeof parsed.concern_notes !== 'object') {
        parsed.concern_notes = {};
      }
      if (!parsed.closing_line || typeof parsed.closing_line !== 'string') {
        parsed.closing_line = 'The reading speaks for itself.';
      }

      void logUsage({
        callType:   'delta_commentary',
        model:      MODEL_TEXT,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - start,
        success:    true,
        scanId:     options?.scanId ?? null,
      });

      return parsed;
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[gemini delta_commentary] attempt ${attempt} failed: ${msg} (finish_reason: ${lastFinishReason ?? 'unknown'})`);

      if (attempt === 1) {
        if (!shouldRetry(err, lastFinishReason)) {
          console.warn('[gemini delta_commentary] failure is deterministic — not retrying');
          break;
        }
        didRetry = true;
        continue;
      }
    }
  }

  const exhaustedMsg = lastError instanceof Error ? lastError.message : String(lastError);
  console.error('[gemini delta_commentary EXHAUSTED]', JSON.stringify({
    attempts:             didRetry ? 2 : 1,
    last_error:           exhaustedMsg,
    last_finish_reason:   lastFinishReason ?? 'unknown',
    last_safety_ratings:  lastSafetyRatings ?? null,
    last_response_length: lastRawResponse.length,
    last_response_tail:   lastRawResponse.slice(-500),
    scan_id:              options?.scanId ?? null,
  }, null, 2));

  void logUsage({
    callType:     'delta_commentary',
    model:        MODEL_TEXT,
    inputTokens,
    outputTokens,
    durationMs:   Date.now() - start,
    success:      false,
    errorMessage: exhaustedMsg,
    scanId:       options?.scanId ?? null,
  });

  throw lastError instanceof Error ? lastError : new Error(exhaustedMsg);
}
