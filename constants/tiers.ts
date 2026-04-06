// Score tier labels for the overall grooming score.
// Each tier has a minimum score, a maximum score, and the label shown to the user.

export interface Tier {
  min:   number;
  max:   number;
  label: string;
}

export const TIERS: Tier[] = [
  { min:  0,  max: 20,  label: 'Needs Work'  },
  { min: 21,  max: 40,  label: 'Developing'  },
  { min: 41,  max: 60,  label: 'Refined'     },
  { min: 61,  max: 75,  label: 'Sharp'       },
  { min: 76,  max: 90,  label: 'Polished'    },
  { min: 91,  max: 100, label: 'Immaculate'  },
];

// Helper: pass a score (0-100) and get back the tier label.
export function getTierLabel(score: number): string {
  const tier = TIERS.find(t => score >= t.min && score <= t.max);
  return tier?.label ?? 'Needs Work';
}
