import { Linking, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton,
  Body,
  ChapterLabel,
  Display,
  PrimaryButton,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';

export default function PermissionDenied() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ flex: 1, paddingTop: 60, paddingHorizontal: 32, paddingBottom: 40 }}>
        <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        <View style={{ height: 38 }} />

        <ChapterLabel>A small ask</ChapterLabel>
        <View style={{ height: 16 }} />
        <Display>
          <Display italic>We need</Display>
          {'\n'}the camera.
        </Display>

        <View style={{ height: 24 }} />
        <Body serif size={14.5}>
          The reading is a camera-first moment — no photograph is sent anywhere. Enable it
          in Settings to continue.
        </Body>

        <View style={{ height: 30 }} />
        <View
          style={{
            backgroundColor: Palette.bgElev,
            borderLeftWidth: 2,
            borderLeftColor: Palette.accent,
            paddingVertical: 18,
            paddingHorizontal: 20,
          }}
        >
          <ChapterLabel style={{ marginBottom: 8 }}>Privacy note</ChapterLabel>
          <Body serif size={13} style={{ fontStyle: 'italic' }}>
            Your photograph never leaves your phone. Only the numbers we derive from it do.
          </Body>
        </View>

        <View style={{ flex: 1 }} />
        <PrimaryButton label="Open settings" onPress={() => Linking.openSettings()} />
      </View>
    </SafeAreaView>
  );
}
