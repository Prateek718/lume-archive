// Final claim confirmation. Resets the wizard draft on mount so a new claim
// can start cleanly later.

import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChapterLabel, Display, TextLink,
} from '../../../components/editorial';
import { Palette } from '../../../constants/theme';
import { useClaimDraft } from './_layout';

export default function ClaimConfirmationScreen() {
  const router = useRouter();
  const draft = useClaimDraft();
  const phone = draft.phone || 'your phone';

  useEffect(() => {
    // Reset on mount — but capture phone first since we read it above.
    draft.reset();
    // We intentionally do not list `draft` in the dep array so reset only
    // fires once on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 60, paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 32 }}>
          <ChapterLabel style={{ color: Palette.accent }}>Submitted</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 36 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              Your claim
            </Text>
            {'\nis in review.'}
          </Display>
          <Text style={{
            fontFamily: 'CormorantGaramond_400Regular',
            fontSize:   16,
            color:      Palette.ink2,
            marginTop:  18,
            lineHeight: 24,
          }}>
            We’ll call you at {phone} within 48 hours to verify. Once verified, your salon is featured in Lumé’s recommendations.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 32 }}>
          <Row
            title="What happens next."
            body="A call from our team verifies you’re the owner."
            first
          />
          <Row
            title="After verification."
            body="Your salon shows in nearby search with a verified badge."
            last
          />
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 32, alignItems: 'center' }}>
          <TextLink
            label="Back to Discover →"
            onPress={() => router.replace('/(tabs)/discover')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ title, body, first, last }: {
  title: string;
  body:  string;
  first?: boolean;
  last?:  boolean;
}) {
  return (
    <View style={{
      paddingVertical:   16,
      borderTopWidth:    first ? 1 : 1,
      borderTopColor:    Palette.rule,
      borderBottomWidth: last ? 1 : 0,
      borderBottomColor: Palette.rule,
    }}>
      <Text style={{
        fontFamily: 'CormorantGaramond_500Medium_Italic',
        fontStyle:  'italic',
        fontSize:   16,
        color:      Palette.ink,
      }}>
        {title}
      </Text>
      <Text style={{
        fontFamily: 'Inter_400Regular',
        fontSize:   12,
        color:      Palette.ink3,
        marginTop:  4,
        lineHeight: 17,
      }}>
        {body}
      </Text>
    </View>
  );
}
