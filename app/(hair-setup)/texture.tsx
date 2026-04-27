// Hair setup · step 4 of 7 — hair texture.

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useHairSetup, SetupTexture } from './_layout';
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

interface Option { label: string; value: SetupTexture }
const OPTIONS: Option[] = [
  { label: 'Straight', value: 'straight' },
  { label: 'Wavy',     value: 'wavy'     },
  { label: 'Curly',    value: 'curly'    },
  { label: 'Coily',    value: 'coily'    },
];

export default function HairTexture() {
  const router = useRouter();
  const { state, update } = useHairSetup();
  const [value, setValue] = useState<SetupTexture | undefined>(state.texture);

  const next = () => {
    if (!value) return;
    update({ texture: value });
    router.push('/(hair-setup)/wash');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 16, paddingBottom: 48, flexGrow: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            <Dots total={7} active={3} />
          </View>

          <View style={{ height: 32 }} />
          <ChapterLabel>Hair · 4 of 7</ChapterLabel>
          <View style={{ height: 10 }} />
          <Display>
            What's your{'\n'}<Text style={ITALIC}>texture?</Text>
          </Display>
          <View style={{ height: 12 }} />
          <View style={{ maxWidth: 280 }}>
            <Body serif>The pattern, not the styling. Read your hair as it dries naturally.</Body>
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
