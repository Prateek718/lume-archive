// Hair setup · step 2 of 7 — scalp type.

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useHairSetup, SetupScalpType } from './_layout';
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

interface Option { label: string; value: SetupScalpType; hint: string }
const OPTIONS: Option[] = [
  { label: 'Oily',        value: 'oily',        hint: 'Greasy by midday' },
  { label: 'Dry',         value: 'dry',         hint: 'Tight or flaky'   },
  { label: 'Normal',      value: 'normal',      hint: 'Mostly balanced'  },
  { label: 'Combination', value: 'combination', hint: 'Oily roots, dry ends' },
];

export default function HairScalp() {
  const router = useRouter();
  const { state, update } = useHairSetup();
  const [value, setValue] = useState<SetupScalpType | undefined>(state.scalp_type);

  const next = () => {
    if (!value) return;
    update({ scalp_type: value });
    router.push('/(hair-setup)/concerns');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 16, paddingBottom: 48, flexGrow: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            <Dots total={7} active={1} />
          </View>

          <View style={{ height: 32 }} />
          <ChapterLabel>Hair · 2 of 7</ChapterLabel>
          <View style={{ height: 10 }} />
          <Display>
            How does your{'\n'}<Text style={ITALIC}>scalp</Text> feel by{'\n'}the end of the day?
          </Display>
          <View style={{ height: 12 }} />
          <View style={{ maxWidth: 280 }}>
            <Body serif>The scalp drives more of the conversation than most realise.</Body>
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
