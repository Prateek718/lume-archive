import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Body,
  ChapterLabel,
  Display,
  PrimaryButton,
  TextLink,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';

export default function Complete() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' }}>
        <ChapterLabel>Scan complete</ChapterLabel>
        <View style={{ height: 16 }} />
        <Display size="small" style={{ textAlign: 'center' }}>
          Your reading is{' '}
          <Text
            style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle: 'italic',
            }}
          >
            ready
          </Text>
          .
        </Display>
        <View style={{ height: 16 }} />
        <Body serif size={14} style={{ textAlign: 'center' }}>
          The observation screen arrives in the next build (Phase 3B). For now, this
          confirms the scan flow worked end-to-end.
        </Body>
        <View style={{ height: 40 }} />
        <PrimaryButton
          label="Go to Routine"
          onPress={() => router.replace('/(tabs)/routine')}
        />
        <View style={{ height: 16 }} />
        <TextLink
          label="or read your care plan →"
          onPress={() => router.replace('/recommendations' as never)}
        />
      </View>
    </SafeAreaView>
  );
}
