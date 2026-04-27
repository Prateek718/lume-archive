// Hair setup · step 5 of 7 — wash frequency.

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useHairSetup, SetupWashFrequency } from './_layout';
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

interface Option { label: string; value: SetupWashFrequency }
const OPTIONS: Option[] = [
  { label: 'Daily',                value: 'daily' },
  { label: 'Every 2–3 days',       value: 'every_2_3_days' },
  { label: 'Once a week',          value: 'once_a_week' },
  { label: 'Less than once a week', value: 'less_than_weekly' },
];

export default function HairWash() {
  const router = useRouter();
  const { state, update } = useHairSetup();
  const [value, setValue] = useState<SetupWashFrequency | undefined>(state.wash_frequency);

  const next = () => {
    if (!value) return;
    update({ wash_frequency: value });
    router.push('/(hair-setup)/oils');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 16, paddingBottom: 48, flexGrow: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            <Dots total={7} active={4} />
          </View>

          <View style={{ height: 32 }} />
          <ChapterLabel>Hair · 5 of 7</ChapterLabel>
          <View style={{ height: 10 }} />
          <Display>
            How <Text style={ITALIC}>often</Text>{'\n'}do you wash?
          </Display>
          <View style={{ height: 12 }} />
          <View style={{ maxWidth: 280 }}>
            <Body serif>The honest answer, not the aspirational one.</Body>
          </View>
          <View style={{ height: 24 }} />

          {OPTIONS.map((opt, i) => (
            <OptionRow
              key={opt.value}
              label={opt.label}
              selected={value === opt.value}
              onPress={() => setValue(opt.value)}
              last={i === OPTIONS.length - 1}
            />
          ))}

          <View style={{ flex: 1, minHeight: 24 }} />
          <PrimaryButton label="Continue" onPress={next} disabled={!value} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
