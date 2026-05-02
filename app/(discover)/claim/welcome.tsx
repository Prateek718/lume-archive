// Step 1 of 5 — claim welcome screen. Pre-fills google_place_id + salon_name
// when entered with route params.

import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BackButton, ChapterLabel, Display, Dots, PrimaryButton,
} from '../../../components/editorial';
import { Palette } from '../../../constants/theme';
import { useClaimDraft } from './_layout';

const BULLETS = [
  {
    title: 'Free to claim and list.',
    body:  'No fee for being featured in recommendations.',
  },
  {
    title: 'Verified by us.',
    body:  'A short call confirms you’re the owner.',
  },
  {
    title: 'Bookings, when ready.',
    body:  'Optional bookings arrive in a future update — small commission per booking, only when one happens.',
  },
  {
    title: 'Honest reviews.',
    body:  'Real users, real ratings. We don’t accept payment to inflate scores.',
  },
];

export default function ClaimWelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ placeId?: string; salonName?: string }>();
  const draft = useClaimDraft();

  useEffect(() => {
    if (typeof params.placeId === 'string' && draft.google_place_id !== params.placeId) {
      draft.setField('google_place_id', params.placeId);
    }
    if (typeof params.salonName === 'string' && draft.salon_name === '') {
      draft.setField('salon_name', params.salonName);
    }
  }, [params.placeId, params.salonName, draft]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 32, paddingTop: 16 }}>
          <Dots total={5} active={0} />
          <View style={{ height: 18 }} />
          <ChapterLabel>Salon owners</ChapterLabel>
          <Display style={{ marginTop: 12, fontSize: 32, lineHeight: 36 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              Reach the
            </Text>
            {'\nright clients.'}
          </Display>
          <Text style={{
            fontFamily: 'CormorantGaramond_400Regular',
            fontSize:   16,
            color:      Palette.ink2,
            marginTop:  16,
            lineHeight: 24,
          }}>
            Lumé recommends salons to users tracking their skin and hair. Claim takes 5 minutes.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 28 }}>
          {BULLETS.map((b, i) => (
            <View
              key={b.title}
              style={{
                paddingVertical:    16,
                borderTopWidth:     1,
                borderTopColor:     Palette.rule,
                borderBottomWidth:  i === BULLETS.length - 1 ? 1 : 0,
                borderBottomColor:  Palette.rule,
              }}
            >
              <Text style={{
                fontFamily: 'CormorantGaramond_500Medium_Italic',
                fontStyle:  'italic',
                fontSize:   15,
                color:      Palette.ink,
              }}>
                {b.title}
              </Text>
              <Text style={{
                fontFamily: 'Inter_400Regular',
                fontSize:   11.5,
                color:      Palette.ink3,
                marginTop:  4,
                lineHeight: 17,
              }}>
                {b.body}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 32 }}>
          <PrimaryButton
            label="Begin claim →"
            onPress={() => router.push('/(discover)/claim/about')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
