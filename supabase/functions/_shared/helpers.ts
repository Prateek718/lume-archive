// Server-side helpers duplicated from lib/gemini/shared.ts and
// lib/gemini/vision.ts. Pure JS/TS — no Node-only globals. Verified
// Deno-compatible in Gate 2 (2026-05-11).

import type { DepthTier, ScanObservation, ScanInsight, Undertone } from "./types.ts";

// ─── ordinal / cardinal (lib/gemini/shared.ts:195-227) ───────────────────────
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = [
  "ten", "eleven", "twelve", "thirteen", "fourteen",
  "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ORDINAL_ONES = [
  "", "first", "second", "third", "fourth",
  "fifth", "sixth", "seventh", "eighth", "ninth",
];
const ORDINAL_TEENS = [
  "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth",
  "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth",
];
const ORDINAL_TENS = [
  "", "", "twentieth", "thirtieth", "fortieth",
  "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth",
];

export function cardinal(n: number): string {
  if (n < 0 || !Number.isInteger(n)) return String(n);
  if (n === 0) return "zero";
  if (n < 10)  return ONES[n];
  if (n < 20)  return TEENS[n - 10];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return ones === 0 ? TENS[tens] : `${TENS[tens]}-${ONES[ones]}`;
  }
  return String(n);
}

export function ordinal(n: number): string {
  if (n < 0 || !Number.isInteger(n)) return `${n}th`;
  if (n === 0) return "zeroth";
  if (n < 10)  return ORDINAL_ONES[n];
  if (n < 20)  return ORDINAL_TEENS[n - 10];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    if (ones === 0) return ORDINAL_TENS[tens];
    return `${TENS[tens]}-${ORDINAL_ONES[ones]}`;
  }
  return `${n}th`;
}

// ─── Fitzpatrick → depth tier (lib/gemini/shared.ts:146-154) ─────────────────
export function fitzpatrickToDepthTier(
  fitzpatrick: number | null | undefined,
): DepthTier | null {
  if (fitzpatrick == null) return null;
  if (fitzpatrick <= 2)   return "fair";
  if (fitzpatrick === 3)  return "light_medium";
  if (fitzpatrick === 4)  return "medium";
  if (fitzpatrick === 5)  return "tan";
  if (fitzpatrick === 6)  return "deep";
  return null;
}

// ─── Palette swatches (lib/gemini/shared.ts:123-144) ─────────────────────────
export const PALETTE_SWATCHES: Record<string, string[]> = {
  "warm-fair":         ["#f5d4b8", "#e8b48a", "#d19073", "#b8753f", "#8c5a2f", "#e8c9a8"],
  "warm-light_medium": ["#e8b48a", "#d19073", "#b8753f", "#c88960", "#8c5a2f", "#e0b59c"],
  "warm-medium":       ["#d19073", "#b8532f", "#8c4e3a", "#c68c6b", "#6b4a3a", "#e0b59c"],
  "warm-tan":          ["#b8753f", "#8c4e3a", "#6b3a28", "#a16a4a", "#7a3a20", "#c28968"],
  "warm-deep":         ["#6b3a28", "#4a2818", "#3a1e12", "#854a34", "#2a1208", "#a06a4e"],

  "cool-fair":         ["#f0d0d0", "#e5b5b5", "#d19595", "#c88080", "#a05050", "#f5e0e0"],
  "cool-light_medium": ["#e5b5b5", "#d19595", "#b87070", "#c88080", "#905050", "#e8c8c8"],
  "cool-medium":       ["#b87070", "#9e5858", "#7a4040", "#a86060", "#60302c", "#c89090"],
  "cool-tan":          ["#9e5858", "#7a4040", "#60302c", "#8c4840", "#4a2420", "#a86868"],
  "cool-deep":         ["#60302c", "#4a2420", "#321810", "#7a3a34", "#1f0c08", "#8e5048"],

  "neutral-fair":         ["#f0d8c5", "#e0c0a5", "#c89878", "#b08560", "#8c6848", "#e8ccb5"],
  "neutral-light_medium": ["#e0c0a5", "#c89878", "#b08560", "#a07858", "#805838", "#d8b89a"],
  "neutral-medium":       ["#c89878", "#a87858", "#805838", "#b08868", "#604828", "#d0a888"],
  "neutral-tan":          ["#a87858", "#805838", "#604828", "#906850", "#402818", "#b09078"],
  "neutral-deep":         ["#604828", "#402818", "#2c1808", "#805040", "#18100c", "#907060"],
};

export function getPaletteSwatches(
  undertone:   Undertone | null | undefined,
  fitzpatrick: number | null | undefined,
): string[] | null {
  const tier = fitzpatrickToDepthTier(fitzpatrick);
  if (!undertone || !tier) return null;
  return PALETTE_SWATCHES[`${undertone}-${tier}`] ?? null;
}

// ─── Face-shape leak detection (lib/gemini/shared.ts:232-240) ────────────────
export function faceShapeProse(): RegExp {
  return /\b(oval|round|square|heart|oblong|diamond|triangle)[\s-]+(face|facial|shape)\b/i;
}

export function stripFaceShapeSentences(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const cleaned = sentences.filter((s) => !faceShapeProse().test(s));
  return cleaned.join(" ").replace(/\s+/g, " ").trim();
}

// ─── JSON cleanup (lib/gemini/shared.ts:383-393) ─────────────────────────────
export function cleanJsonResponse(raw: string): string {
  const stripped = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace  = stripped.lastIndexOf("}");
  return firstBrace !== -1 && lastBrace !== -1
    ? stripped.slice(firstBrace, lastBrace + 1)
    : stripped;
}

// ─── Observation sanitizer (lib/gemini/vision.ts:536-552) ────────────────────
const FACE_SHAPE_CHIP = /\b(oval|round|square|heart|oblong|diamond|triangle)\s+face\b/i;

export function sanitizeObservation(obs: ScanObservation): void {
  if (Array.isArray(obs.trait_chips)) {
    obs.trait_chips = obs.trait_chips.filter((chip) => !FACE_SHAPE_CHIP.test(chip));
  }
  if (Array.isArray(obs.insights)) {
    for (const insight of obs.insights as ScanInsight[]) {
      if (insight.body && faceShapeProse().test(insight.body)) {
        insight.body = stripFaceShapeSentences(insight.body);
      }
    }
  }
  if (obs.dek && faceShapeProse().test(obs.dek)) {
    obs.dek = stripFaceShapeSentences(obs.dek);
  }
}
