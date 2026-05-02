// Step 5 of 5 — booking interest. Submits the full claim on continue.

import { useState } from 'react';
import {
  Alert, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton, ChapterLabel, Display, Dots, PrimaryButton,
} from '../../../components/editorial';
import { Palette } from '../../../constants/theme';
import { BOOKING_INTEREST_OPTIONS } from '../../../constants/salonServices';
import { submitClaim } from '../../../services/salonService';
import { useClaimDraft, type ClaimDraft } from './_layout';

type BookingInterest = NonNullable<ClaimDraft['booking_interest']>;

export default function ClaimBookingsScreen() {
  const router = useRouter();
  const draft = useClaimDraft();
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = draft.booking_interest !== null && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    if (!draft.google_place_id || !draft.price_range || !draft.booking_interest) return;
    setSubmitting(true);
    try {
      await submitClaim({
        google_place_id:  draft.google_place_id,
        salon_name:       draft.salon_name.trim(),
        owner_name:       draft.owner_name.trim(),
        phone:            draft.phone.trim(),
        email:            draft.email.trim(),
        city:             draft.city,
        services_hair:    draft.services_hair,
        services_skin:    draft.services_skin,
        services_beard:   draft.services_beard,
        services_bridal:  draft.services_bridal,
        services_other:   draft.services_other,
        price_range:      draft.price_range,
        booking_interest: draft.booking_interest,
      });
      router.replace('/(discover)/claim/confirmation');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Unique constraint violation on google_place_id → already-claimed.
      if (msg.toLowerCase().includes('duplicate') || msg.includes('23505') ||
          msg.toLowerCase().includes('unique')) {
        Alert.alert(
          'Already claimed',
          'This salon has already been claimed. Contact support if you believe this is your salon.',
        );
      } else {
        Alert.alert('Could not submit', 'Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 32, paddingTop: 16 }}>
          <Dots total={5} active={4} />
          <View style={{ height: 18 }} />
          <ChapterLabel>Five of five</ChapterLabel>
          <Display style={{ marginTop: 12, fontSize: 32, lineHeight: 36 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              Bookings,
            </Text>
            {'\nlater.'}
          </Display>
          <Text style={{
            fontFamily: 'CormorantGaramond_400Regular_Italic',
            fontStyle:  'italic',
            fontSize:   14,
            color:      Palette.ink3,
            marginTop:  10,
            lineHeight: 20,
          }}>
            We’re not building bookings yet. Tell us if you’d be interested when we do.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 24 }}>
          {BOOKING_INTEREST_OPTIONS.map((opt, i) => {
            const selected = draft.booking_interest === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                activeOpacity={0.85}
                onPress={() => draft.setField('booking_interest', opt.value as BookingInterest)}
                style={{
                  paddingVertical:    16,
                  borderTopWidth:     1,
                  borderTopColor:     Palette.rule,
                  borderBottomWidth:  i === BOOKING_INTEREST_OPTIONS.length - 1 ? 1 : 0,
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
            label={submitting ? 'Submitting...' : 'Submit claim →'}
            onPress={onSubmit}
            disabled={!canSubmit}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
