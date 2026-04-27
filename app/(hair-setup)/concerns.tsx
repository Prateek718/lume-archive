// Hair setup · step 3 of 7 — primary concerns. Multi-select, max 4.

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useHairSetup } from './_layout';
import {
  BackButton,
  Body,
  ChapterLabel,
  Display,
  Dots,
  OptionRow,
  PrimaryButton,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';

const ITALIC = {
  fontFamily: 'CormorantGaramond_500Medium_Italic',
  fontStyle: 'italic' as const,
};

interface Option { label: string; value: string }
// Drawn from CANONICAL_CONCERNS — hair-applicable subset.
const OPTIONS: Option[] = [
  { label: 'Hair fall',     value: 'hair_fall' },
  { label: 'Dandruff',      value: 'dandruff' },
  { label: 'Frizz',         value: 'frizz' },
  { label: 'Damage',        value: 'damage' },
  { label: 'Dullness',      value: 'dullness_hair' },
  { label: 'Oily scalp',    value: 'oily_scalp' },
  { label: 'Dry scalp',     value: 'dry_scalp' },
  { label: 'Itchy scalp',   value: 'itchy_scalp' },
];

const MAX_PICKS = 4;

export default function HairConcerns() {
  const router = useRouter();
  const { state, update } = useHairSetup();
  const [picks, setPicks] = useState<string[]>(state.primary_concern ?? []);

  const toggle = (val: string) => {
    setPicks(prev => {
      if (prev.includes(val)) return prev.filter(v => v !== val);
      if (prev.length >= MAX_PICKS) return prev;
      return [...prev, val];
    });
  };

  const next = () => {
    update({ primary_concern: picks });
    // Bald users skip texture / wash / oils — go straight to treatment review.
    if (state.hair_length === 'bald') {
      router.push('/(hair-setup)/treatment');
    } else {
      router.push('/(hair-setup)/texture');
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 16, paddingBottom: 48, flexGrow: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            <Dots total={7} active={2} />
          </View>

          <View style={{ height: 32 }} />
          <ChapterLabel>Hair · 3 of 7</ChapterLabel>
          <View style={{ height: 10 }} />
          <Display>
            What are you{'\n'}<Text style={ITALIC}>trying to address?</Text>
          </Display>
          <View style={{ height: 12 }} />
          <View style={{ maxWidth: 280 }}>
            <Body serif>Pick up to four. Or skip this — a calm baseline routine is fine too.</Body>
          </View>
          <View style={{ height: 24 }} />

          {OPTIONS.map((opt, i) => (
            <OptionRow
              key={opt.value}
              label={opt.label}
              selected={picks.includes(opt.value)}
              variant="checkbox"
              onPress={() => toggle(opt.value)}
              last={i === OPTIONS.length - 1}
            />
          ))}

          <View style={{ flex: 1, minHeight: 24 }} />
          <PrimaryButton label="Continue" onPress={next} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
