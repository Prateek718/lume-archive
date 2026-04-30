// DeleteAccountScreen — placeholder. Real flow (cascade delete + auth.users
// removal) lands in Phase 7C.

import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton, ChapterLabel, Display } from '../../components/editorial';
import { Palette } from '../../constants/theme';

export default function DeleteAccountScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 28, paddingVertical: 8 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <ChapterLabel>Privacy & data</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>Delete account</Text>
            {'\n'}coming soon.
          </Display>
          <Text
            style={{
              marginTop:  22,
              fontFamily: 'CormorantGaramond_400Regular_Italic',
              fontStyle:  'italic',
              fontSize:   14.5,
              lineHeight: 24,
              color:      Palette.ink2,
            }}
          >
            The full delete-account flow lands in a future update. Reach out to support if you need this now.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
