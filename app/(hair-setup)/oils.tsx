// Hair setup · step 6 of 7 — oils regularly?

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

export default function HairOils() {
  const router = useRouter();
  const { state, update } = useHairSetup();
  const [value, setValue] = useState<boolean | undefined>(state.oils_regularly);

  const next = () => {
    if (value === undefined) return;
    update({ oils_regularly: value });
    router.push('/(hair-setup)/treatment');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 16, paddingBottom: 48, flexGrow: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            <Dots total={7} active={5} />
          </View>

          <View style={{ height: 32 }} />
          <ChapterLabel>Hair · 6 of 7</ChapterLabel>
          <View style={{ height: 10 }} />
          <Display>
            Do you <Text style={ITALIC}>oil</Text>{'\n'}your hair regularly?
          </Display>
          <View style={{ height: 12 }} />
          <View style={{ maxWidth: 280 }}>
            <Body serif>Once a week or more counts. Once in a while doesn't.</Body>
          </View>
          <View style={{ height: 24 }} />

          <OptionRow
            label="Yes"
            selected={value === true}
            onPress={() => setValue(true)}
          />
          <OptionRow
            label="No"
            selected={value === false}
            onPress={() => setValue(false)}
            last
          />

          <View style={{ flex: 1, minHeight: 24 }} />
          <PrimaryButton label="Continue" onPress={next} disabled={value === undefined} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
