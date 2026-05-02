// Step 4 of 5 — pricing tier select.

import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton, ChapterLabel, Display, Dots, PrimaryButton,
} from '../../../components/editorial';
import { Palette } from '../../../constants/theme';
import { PRICE_RANGE_OPTIONS } from '../../../constants/salonServices';
import { useClaimDraft, type ClaimDraft } from './_layout';

type PriceRange = NonNullable<ClaimDraft['price_range']>;

export default function ClaimPricingScreen() {
  const router = useRouter();
  const draft = useClaimDraft();
  const canContinue = draft.price_range !== null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 32, paddingTop: 16 }}>
          <Dots total={5} active={3} />
          <View style={{ height: 18 }} />
          <ChapterLabel>Four of five</ChapterLabel>
          <Display style={{ marginTop: 12, fontSize: 32, lineHeight: 36 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              Where you
            </Text>
            {'\nsit.'}
          </Display>
          <Text style={{
            fontFamily: 'CormorantGaramond_400Regular_Italic',
            fontStyle:  'italic',
            fontSize:   14,
            color:      Palette.ink3,
            marginTop:  10,
            lineHeight: 20,
          }}>
            Approximate haircut prices help us match you with the right users.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 24 }}>
          {PRICE_RANGE_OPTIONS.map((opt, i) => {
            const selected = draft.price_range === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                activeOpacity={0.85}
                onPress={() => draft.setField('price_range', opt.value as PriceRange)}
                style={{
                  paddingVertical:    16,
                  borderTopWidth:     1,
                  borderTopColor:     Palette.rule,
                  borderBottomWidth:  i === PRICE_RANGE_OPTIONS.length - 1 ? 1 : 0,
                  borderBottomColor:  Palette.rule,
                  flexDirection:      'row',
                  alignItems:         'center',
                  justifyContent:     'space-between',
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{
                    fontFamily: 'CormorantGaramond_500Medium_Italic',
                    fontStyle:  'italic',
                    fontSize:   17,
                    color:      Palette.ink,
                  }}>
                    {opt.label}
                  </Text>
                  <Text style={{
                    fontFamily: 'Inter_400Regular',
                    fontSize:   11.5,
                    color:      Palette.ink3,
                    marginTop:  3,
                  }}>
                    {opt.note}
                  </Text>
                </View>
                <View style={{
                  width:           18,
                  height:          18,
                  borderRadius:    99,
                  borderWidth:     1,
                  borderColor:     selected ? Palette.accent : Palette.rule,
                  backgroundColor: selected ? Palette.accent : 'transparent',
                }} />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 28 }}>
          <PrimaryButton
            label="Continue →"
            onPress={() => router.push('/(discover)/claim/bookings')}
            disabled={!canContinue}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
