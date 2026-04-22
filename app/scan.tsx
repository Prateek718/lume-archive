import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { ChapterLabel, Display, Body, TextLink } from '../components/editorial';
import { Palette } from '../constants/theme';

export default function Scan() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 40 }}>
          <ChapterLabel>Scan · coming in phase three</ChapterLabel>
          <View style={{ height: 16 }} />
          <Display size="small">Your first scan begins here.</Display>
          <View style={{ height: 20 }} />
          <Body serif>
            The scan flow will be rebuilt against the editorial design in the next phase.
          </Body>
          <View style={{ height: 32 }} />
          <TextLink label="← back to routine" onPress={() => router.replace('/(tabs)/routine')} />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
