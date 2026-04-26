// Makeup detail — Phase 4B placeholder. Replaced with the real screen in the
// next phase.

import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { BackButton, Body, ChapterLabel, Display } from '../components/editorial';
import { Palette } from '../constants/theme';

export default function MakeupDetailRoute() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <View style={{ paddingVertical: 8, paddingHorizontal: 28 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: 'center' }}>
          <ChapterLabel>Part · makeup</ChapterLabel>
          <View style={{ height: 14 }} />
          <Display size="small">
            <Display size="small" italic>Coming in</Display>
            {'\n'}Phase 4B.
          </Display>
          <View style={{ height: 16 }} />
          <Body serif size={14} style={{ fontStyle: 'italic' }}>
            Makeup detail — palette, swatches, shade families — lands in the next phase.
          </Body>
        </View>
      </SafeAreaView>
    </>
  );
}
