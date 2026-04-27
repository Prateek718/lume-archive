// Hair setup · step 7 of 7 — chemical treatments. Final step before the
// terminal "analyzing" screen, which is where we route on submit.

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useHairSetup, SetupTreatment } from './_layout';
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

interface Option { label: string; value: SetupTreatment }
const OPTIONS: Option[] = [
  { label: 'None',     value: 'none'     },
  { label: 'Coloured', value: 'colored'  },
  { label: 'Permed',   value: 'permed'   },
  { label: 'Bleached', value: 'bleached' },
];

export default function HairTreatment() {
  const router = useRouter();
  const { state, update } = useHairSetup();
  const [value, setValue] = useState<SetupTreatment | undefined>(state.chemically_treated);

  const submit = () => {
    if (!value) return;
    update({ chemically_treated: value });
    router.replace('/(hair-setup)/analyzing');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 16, paddingBottom: 48, flexGrow: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            <Dots total={7} active={6} />
          </View>

          <View style={{ height: 32 }} />
          <ChapterLabel>Hair · 7 of 7</ChapterLabel>
          <View style={{ height: 10 }} />
          <Display>
            Any <Text style={ITALIC}>chemical{'\n'}treatments?</Text>
          </Display>
          <View style={{ height: 12 }} />
          <View style={{ maxWidth: 280 }}>
            <Body serif>Treated hair behaves differently — we'll account for it.</Body>
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
          <PrimaryButton label="Read your hair" onPress={submit} disabled={!value} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
