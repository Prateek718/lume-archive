import { ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import {
  ChapterLabel,
  Display,
  Rule,
  Body,
  PrimaryButton,
  TextLink,
  Dots,
  OptionRow,
  BackButton,
  Placeholder,
} from '../components/editorial';
import { Palette } from '../constants/theme';

export default function StyleDemo() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
          {/* Group 1 — ChapterLabel */}
          <ChapterLabel>Primitive · chapter label</ChapterLabel>
          <ChapterLabel>Chapter one · of four</ChapterLabel>

          {/* Group 2 — Display variants */}
          <View style={{ height: 24 }} />
          <ChapterLabel>Primitive · display serif</ChapterLabel>
          <Display size="large">
            What should we call{' '}
            <Text style={{ fontFamily: 'CormorantGaramond_500Medium_Italic', fontStyle: 'italic' }}>
              you
            </Text>
            ?
          </Display>
          <Display>A quiet beginning.</Display>
          <Display size="small">A smaller display.</Display>
          <Display italic>Italic emphasis variant.</Display>

          {/* Group 3 — Rules */}
          <View style={{ height: 24 }} />
          <ChapterLabel>Primitive · rules</ChapterLabel>
          <Rule length="short" />
          <View style={{ height: 12 }} />
          <Rule length="full" />
          <View style={{ height: 12 }} />
          <Rule length="full" tone="accent" />

          {/* Group 4 — Body */}
          <View style={{ height: 24 }} />
          <ChapterLabel>Primitive · body</ChapterLabel>
          <Body serif>
            Evening light, cool water, an honest mirror. The serif body reads like a paperback.
          </Body>
          <View style={{ height: 12 }} />
          <Body>Short UI copy sits comfortably in Inter sans.</Body>
          <View style={{ height: 12 }} />
          <Body size={12}>Smaller metadata example.</Body>

          {/* Group 5 — Buttons */}
          <View style={{ height: 24 }} />
          <ChapterLabel>Primitive · buttons</ChapterLabel>
          <PrimaryButton label="Begin" onPress={() => {}} />
          <View style={{ height: 12 }} />
          <PrimaryButton label="Begin" disabled onPress={() => {}} />
          <View style={{ height: 12 }} />
          <TextLink label="continue →" onPress={() => {}} />

          {/* Group 6 — Dots */}
          <View style={{ height: 24 }} />
          <ChapterLabel>Primitive · progress dots</ChapterLabel>
          <Dots total={4} active={2} />

          {/* Group 7 — OptionRow */}
          <View style={{ height: 24 }} />
          <ChapterLabel>Primitive · option rows</ChapterLabel>
          <OptionRow label="Mumbai" selected onPress={() => {}} />
          <OptionRow label="Bengaluru" selected={false} onPress={() => {}} />
          <OptionRow label="Delhi" selected={false} last onPress={() => {}} />

          {/* Group 8 — BackButton */}
          <View style={{ height: 24 }} />
          <ChapterLabel>Primitive · back button</ChapterLabel>
          <BackButton onPress={() => router.back()} />

          {/* Group 9 — Placeholder */}
          <View style={{ height: 24 }} />
          <ChapterLabel>Primitive · image placeholder</ChapterLabel>
          <Placeholder height={140} label="scan" />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
