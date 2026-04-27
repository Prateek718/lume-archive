// constants/beardStyles.ts
// Beard style suggestions keyed by face_shape × beard_goal.
// Hand-curated. Each cell is a stable suggestion that doesn't drift between scans.
// Gemini generates a personalized intro sentence; this table provides the rest.

import type { BeardGoal } from '../types';

export type FaceShape = 'oval' | 'round' | 'square' | 'heart' | 'oblong';

export interface BeardStyle {
  style_name:   string;       // The named shape — italic display
  description:  string;       // 2-3 sentences. What to do. Editorial tone.
  barber_note:  string;       // What to say to a barber. Specific. 1-2 sentences.
  search_query: string;       // Google Images query — phrase users would type to find reference photos.
}

const FALLBACK: BeardStyle = {
  style_name:   'A natural shape',
  description:  'Trim what grows, neaten the edges, and leave the rest. The simplest beards age the best.',
  barber_note:  'Keep what I have. Tidy the cheek and neckline, no length change.',
  search_query: 'natural beard shape men reference',
};

const TABLE: Record<FaceShape, Record<BeardGoal, BeardStyle>> = {
  oval: {
    fuller: {
      style_name:   'The full natural',
      description:  'Let the cheeks fill in over four to six weeks before shaping. Condition daily; resist the urge to trim until the patches close.',
      barber_note:  'Growing it out — leave it alone. Just clean the neckline below the Adam\'s apple.',
      search_query: 'full natural beard oval face men',
    },
    sharper: {
      style_name:   'The balanced short',
      description:  'Trim cheeks clean along a natural curve, keep the jawline full, and let the chin anchor. The neckline sits a finger above the Adam\'s apple, curved to match the jaw.',
      barber_note:  'Short beard, about 6mm. Clean cheek line — curved, not straight. Natural neckline. Leave the chin full.',
      search_query: 'short beard curved cheek line oval face men',
    },
    shorter: {
      style_name:   'The clean stubble',
      description:  'A consistent short length — three to five days of growth — that reads tidy without effort. Trim every two days with a fixed guard, keep the line below the jaw soft.',
      barber_note:  '3mm guard all over, soft neckline, no harsh cheek line.',
      search_query: 'clean stubble 3mm even oval face men',
    },
    longer: {
      style_name:   'The framed long',
      description:  'Let length build for eight to twelve weeks. Shape only the perimeter — clean cheeks, defined neckline — but never the bulk. The length is the point.',
      barber_note:  'Don\'t shorten anything. Tidy the cheek and the neckline only. Keep the chin and length untouched.',
      search_query: 'long framed beard clean cheekline oval face men',
    },
    none: {
      style_name:   'A natural shape',
      description:  'You\'ve got an even canvas. Trim only what grows out of place; the natural shape works for you without intervention.',
      barber_note:  'Keep the length and shape I have. Tidy stray hairs only.',
      search_query: 'natural beard oval face neat men',
    },
  },
  round: {
    fuller: {
      style_name:   'The lengthening fill',
      description:  'Grow longer at the chin and shorter at the cheeks — this stretches the face vertically as the patches close. Be patient through the awkward weeks.',
      barber_note:  'Growing it out. Leave the chin completely; gently soften only the cheek line.',
      search_query: 'lengthening beard short cheeks long chin round face men',
    },
    sharper: {
      style_name:   'The defined angle',
      description:  'Sharp lines do the work for you here. Crisp cheek line angled toward the corner of the mouth, defined jawline edge, length kept moderate to elongate the face.',
      barber_note:  'Defined cheek line — straight, angled toward the mouth corner. Sharp neckline along the jaw. About 6–8mm length.',
      search_query: 'sharp angled cheek line beard round face men',
    },
    shorter: {
      style_name:   'The light stubble',
      description:  'Very short keeps the face from looking softer than it is. Two to three days of growth, clean lines, refreshed every other day.',
      barber_note:  '2mm guard. Sharp cheek line. Clean jaw definition.',
      search_query: 'short stubble sharp cheek line round face men',
    },
    longer: {
      style_name:   'The chin-led grow',
      description:  'Length concentrated at the chin elongates the face. Keep cheeks shorter; let the chin lead by 1.5x the cheek length.',
      barber_note:  'Cheeks at 4mm, chin and below untouched. Goal is length below the jaw, not on the sides.',
      search_query: 'chin led long beard round face men',
    },
    none: {
      style_name:   'A clean trim',
      description:  'Keep things tidy without adding weight to the cheeks. A short, well-defined shape balances the face naturally.',
      barber_note:  'Even length around 3mm, clean cheek line, sharp neckline.',
      search_query: 'short clean beard sharp neckline round face men',
    },
  },
  square: {
    fuller: {
      style_name:   'The softening fill',
      description:  'Length softens the strong jaw — fuller cheeks and a rounded chin balance the angles. Grow for six weeks, then shape.',
      barber_note:  'Letting it fill out. Don\'t shape the chin into a point — keep it rounded.',
      search_query: 'soft full beard rounded chin square jaw men',
    },
    sharper: {
      style_name:   'The kept short',
      description:  'Your jaw doesn\'t need extra angles. A short, even beard with soft edges does the work without competing with the bone structure.',
      barber_note:  'Even 4–5mm. Soft cheek line, soft neckline. Don\'t cut harsh angles.',
      search_query: 'short even beard soft edges square jaw men',
    },
    shorter: {
      style_name:   'The classic stubble',
      description:  'Short and even, with intentional softness at the edges. The face does the work; the beard supports it.',
      barber_note:  '2–3mm guard, soft natural lines, no harsh angles.',
      search_query: 'classic short stubble soft lines square face men',
    },
    longer: {
      style_name:   'The rounded long',
      description:  'Length builds up evenly with a rounded bottom, not a pointed one. Avoid sharp chin shapes — they compete with the jaw.',
      barber_note:  'Growing length, but keep the chin shape rounded as it grows. No point.',
      search_query: 'rounded long beard square jaw men',
    },
    none: {
      style_name:   'A soft natural',
      description:  'Your face structure is already strong. Keep the beard soft and natural to balance.',
      barber_note:  'Keep it natural and soft. Tidy edges only, no shaping.',
      search_query: 'soft natural beard square face men',
    },
  },
  heart: {
    fuller: {
      style_name:   'The chin-anchor',
      description:  'Build mass at the chin and jaw to balance a wider forehead. Keep cheeks moderate; let the chin lead.',
      barber_note:  'Goal is fullness at chin and jaw. Cheeks stay moderate, around 5mm. Chin untouched as it grows.',
      search_query: 'chin anchor full beard heart face men',
    },
    sharper: {
      style_name:   'The chin-defined',
      description:  'A sharper chin shape narrows the face\'s upper width by visual contrast. Define the chin line; keep cheeks softer.',
      barber_note:  'Defined chin shape — clean lines around it. Cheeks softer, no hard line.',
      search_query: 'defined chin beard soft cheeks heart face men',
    },
    shorter: {
      style_name:   'The light frame',
      description:  'Short stubble with slightly more presence at the chin. Don\'t go too light — some weight at the bottom anchors the face.',
      barber_note:  '3mm everywhere except the chin — leave that 4–5mm. Soft cheek line.',
      search_query: 'short stubble chin emphasis heart face men',
    },
    longer: {
      style_name:   'The full beard',
      description:  'A long beard with chin emphasis genuinely transforms a heart-shaped face. Let it grow for ten plus weeks; trim cheeks lightly.',
      barber_note:  'Going long. Cheeks at 6mm, chin completely untouched. Goal is length below the jaw.',
      search_query: 'full long beard chin emphasis heart face men',
    },
    none: {
      style_name:   'A balanced shape',
      description:  'Aim for visual weight at the chin to balance your face structure. Even length, soft edges.',
      barber_note:  'Keep what I have. Slightly more length at the chin if anything.',
      search_query: 'balanced beard chin weight heart face men',
    },
  },
  oblong: {
    fuller: {
      style_name:   'The widening fill',
      description:  'Volume on the cheeks and sides — not length at the chin — balances an oblong face. Grow the patches over six weeks; resist trimming the sides.',
      barber_note:  'Filling out the sides. Cheeks left alone. Trim only the chin if it gets long.',
      search_query: 'wide cheek full beard oblong face men',
    },
    sharper: {
      style_name:   'The kept full',
      description:  'Avoid the urge to make it sharp and angular — that lengthens the face further. A fuller, softer shape with clean lines wins here.',
      barber_note:  'Fuller, not sharper. Soft natural lines, no angular cheek line. Don\'t lengthen the chin.',
      search_query: 'soft full beard oblong face men',
    },
    shorter: {
      style_name:   'The sideways stubble',
      description:  'Short stubble distributed evenly with slight emphasis on the cheeks and sides. Avoid lengthening the chin shape.',
      barber_note:  '3mm even. Don\'t leave the chin longer than the sides.',
      search_query: 'even stubble wide cheeks oblong face men',
    },
    longer: {
      style_name:   'The wide grow',
      description:  'Counterintuitive but right: grow the sides and cheeks more than the chin. Use a wider comb and condition daily for volume.',
      barber_note:  'Want fullness on the sides, not length below. If the chin gets longer than the sides, trim it back.',
      search_query: 'wide sides full beard oblong face men',
    },
    none: {
      style_name:   'A soft shape',
      description:  'Keep the beard from emphasizing the length of your face. Soft, even, and distributed.',
      barber_note:  'Soft, natural shape. Even length all around. No long chin.',
      search_query: 'soft even beard oblong face men',
    },
  },
};

export function getBeardStyle(face_shape: FaceShape | string | null | undefined, beard_goal: BeardGoal | null | undefined): BeardStyle {
  if (!face_shape || !beard_goal) return FALLBACK;
  const row = TABLE[face_shape as FaceShape];
  if (!row) return FALLBACK;
  const cell = row[beard_goal];
  if (!cell) return FALLBACK;
  return cell;
}