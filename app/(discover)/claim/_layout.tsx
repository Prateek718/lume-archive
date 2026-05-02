// Claim flow layout. Owns the wizard state via React Context so each step
// can read + write fields and the final submit step can pull the full draft.

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Stack } from 'expo-router';

export interface ClaimDraft {
  google_place_id:  string | null;
  salon_name:       string;
  owner_name:       string;
  phone:            string;
  email:            string;
  city:             string | null;
  services_hair:    string[];
  services_skin:    string[];
  services_beard:   string[];
  services_bridal:  string[];
  services_other:   string[];
  price_range:      'budget' | 'mid' | 'premium' | 'luxury' | null;
  booking_interest: 'yes' | 'maybe' | 'no' | null;
}

interface ClaimContextValue extends ClaimDraft {
  setField: <K extends keyof ClaimDraft>(key: K, value: ClaimDraft[K]) => void;
  reset:    () => void;
}

const EMPTY_DRAFT: ClaimDraft = {
  google_place_id:  null,
  salon_name:       '',
  owner_name:       '',
  phone:            '',
  email:            '',
  city:             null,
  services_hair:    [],
  services_skin:    [],
  services_beard:   [],
  services_bridal:  [],
  services_other:   [],
  price_range:      null,
  booking_interest: null,
};

const ClaimContext = createContext<ClaimContextValue | null>(null);

export function useClaimDraft(): ClaimContextValue {
  const ctx = useContext(ClaimContext);
  if (!ctx) throw new Error('useClaimDraft must be used within a claim layout');
  return ctx;
}

export default function ClaimLayout() {
  const [draft, setDraft] = useState<ClaimDraft>(EMPTY_DRAFT);

  const setField = useCallback(
    <K extends keyof ClaimDraft>(key: K, value: ClaimDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const reset = useCallback(() => setDraft(EMPTY_DRAFT), []);

  const value = useMemo<ClaimContextValue>(
    () => ({ ...draft, setField, reset }),
    [draft, setField, reset],
  );

  return (
    <ClaimContext.Provider value={value}>
      <Stack screenOptions={{ headerShown: false }} />
    </ClaimContext.Provider>
  );
}
