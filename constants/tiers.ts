export type TierName = 'Polished' | 'Sharp' | 'Elevated';

export interface Tier {
  name:        TierName;
  diamonds:    number;
  description: string;
  minScore:    number;
  maxScore:    number;
}

export const TIERS: Tier[] = [
  {
    name:        'Polished',
    diamonds:    1,
    description: "Great starting point — let's build your routine",
    minScore:    0,
    maxScore:    59,
  },
  {
    name:        'Sharp',
    diamonds:    2,
    description: 'Solid grooming game — a few refinements away from exceptional',
    minScore:    60,
    maxScore:    79,
  },
  {
    name:        'Elevated',
    diamonds:    3,
    description: "Exceptional grooming — you're setting the standard",
    minScore:    80,
    maxScore:    100,
  },
];

export function getTierFromScore(score: number): Tier {
  return TIERS.find(t => score >= t.minScore && score <= t.maxScore) ?? TIERS[0];
}

export function getTierLabel(score: number): string {
  return getTierFromScore(score).name;
}

export type CategoryPotential = 'High potential' | 'Good foundation' | 'Needs attention' | 'Strong asset';

export function getCategoryPotential(score: number | null): CategoryPotential {
  if (score === null) return 'Good foundation';
  if (score >= 80)   return 'High potential';
  if (score >= 70)   return 'Strong asset';
  if (score >= 60)   return 'Good foundation';
  return 'Needs attention';
}

export function getCategoryDiamonds(score: number | null): number {
  if (score === null) return 2;
  if (score >= 80)   return 3;
  if (score >= 60)   return 2;
  return 1;
}
