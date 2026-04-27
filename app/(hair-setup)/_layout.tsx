// Hair profile setup — 7-step questionnaire flow that hands off to a terminal
// "analyzing" screen which fires the Gemini hair recs call. State lives in
// HairSetupContext, exposed below; each screen reads/updates a single field.

import React, { createContext, useContext, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Palette } from '../../constants/theme';
import type { HairProfile } from '../../types';

// ─── Setup state ───────────────────────────────────────────────────────────────
// Mirrors HairProfile but every field is optional while the user is filling it
// in. The shared HairProfile type uses 'bald' | 'very_short' | 'short' | ... ,
// but the new questionnaire only emits 'short' | 'medium' | 'long' | 'bald'.

export type SetupHairLength      = 'short' | 'medium' | 'long' | 'bald';
export type SetupScalpType       = 'oily' | 'dry' | 'normal' | 'combination';
export type SetupTexture         = 'straight' | 'wavy' | 'curly' | 'coily';
export type SetupWashFrequency   = 'daily' | 'every_2_3_days' | 'once_a_week' | 'less_than_weekly';
export type SetupTreatment       = 'none' | 'colored' | 'permed' | 'bleached';

export interface HairSetupState {
  hair_length?:        SetupHairLength;
  scalp_type?:         SetupScalpType;
  primary_concern?:    string[];
  texture?:            SetupTexture;
  wash_frequency?:     SetupWashFrequency;
  oils_regularly?:     boolean;
  chemically_treated?: SetupTreatment;
}

interface HairSetupContextValue {
  state: HairSetupState;
  update: (patch: Partial<HairSetupState>) => void;
  reset:  () => void;
}

const HairSetupContext = createContext<HairSetupContextValue | null>(null);

export function useHairSetup(): HairSetupContextValue {
  const ctx = useContext(HairSetupContext);
  if (!ctx) throw new Error('useHairSetup must be called inside (hair-setup) layout');
  return ctx;
}

// Translate the in-flight setup state to the persisted HairProfile shape.
// 'colored' → 'color', 'permed' → 'perming', 'bleached' → 'multiple' (no
// dedicated bleach value in the schema; bleach is a flavour of multi-step
// chemical work). Length values pass through; the schema accepts them.
export function toHairProfile(state: HairSetupState): HairProfile {
  const treatmentMap: Record<SetupTreatment, HairProfile['chemically_treated']> = {
    none:     'none',
    colored:  'color',
    permed:   'perming',
    bleached: 'multiple',
  };
  return {
    hair_length:        (state.hair_length ?? 'medium') as HairProfile['hair_length'],
    scalp_type:         state.scalp_type ?? 'normal',
    primary_concern:    state.primary_concern ?? [],
    texture:            state.texture,
    wash_frequency:     state.wash_frequency,
    oils_regularly:     state.oils_regularly,
    chemically_treated: state.chemically_treated
      ? treatmentMap[state.chemically_treated]
      : 'none',
  };
}

// ─── Layout ────────────────────────────────────────────────────────────────────

export default function HairSetupLayout() {
  const [state, setState] = useState<HairSetupState>({});
  const update = (patch: Partial<HairSetupState>) =>
    setState(prev => ({ ...prev, ...patch }));
  const reset = () => setState({});

  return (
    <HairSetupContext.Provider value={{ state, update, reset }}>
      <View style={{ flex: 1, backgroundColor: Palette.bg }}>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
      </View>
    </HairSetupContext.Provider>
  );
}
