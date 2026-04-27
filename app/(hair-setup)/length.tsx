// Hair setup · step 1 of 7 — hair length.

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useHairSetup, SetupHairLength } from './_layout';
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

interface Option { label: string; value: SetupHairLength; description: string }
const OPTIONS: Option[] = [
  { label: 'Short',          value: 'short',  description: 'above the ears, or close to the scalp' },
  { label: 'Medium',         value: 'medium', description: 'ear-length to shoulder' },
  { label: 'Long',           value: 'long',   description: 'past the shoulders' },
  { label: 'Bald or shaved', value: 'bald',   description: 'clean scalp, or buzzed close' },
];

export default function HairLength() {
  const router = useRouter();
  const { state, update } = useHairSetup();
  const [value, setValue] = useState<SetupHairLength | undefined>(state.hair_length);

  const next = () => {
    if (!value) return;
    update({ hair_length: value });
    if (value === 'bald') {
      // Bald users skip texture / wash / oils / treatment — jump straight to scalp.
      router.push('/(hair-setup)/scalp');
    } else {
      router.push('/(hair-setup)/scalp');
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 16, paddingBottom: 48, flexGrow: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            <Dots total={7} active={0} />
          </View>

          <View style={{ height: 32 }} />
          <ChapterLabel>Hair · 1 of 7</ChapterLabel>
          <View style={{ height: 10 }} />
          <Display>
            How <Text style={ITALIC}>long</Text>{'\n'}is your hair right now?
          </Display>
          <View style={{ height: 12 }} />
          <View style={{ maxWidth: 280 }}>
            <Body serif>Length shapes everything that follows — wash cadence, what to oil, what to skip.</Body>
          </View>
          <View style={{ height: 24 }} />

          {OPTIONS.map((opt, i) => (
            <OptionRow
              key={opt.value}
              label={opt.label}
              description={opt.description}
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
