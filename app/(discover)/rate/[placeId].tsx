// Rate salon screen. Required: overall rating (1-5) + at least one service.
// Optional: per-dimension ratings + comment. One rating per user per salon —
// on mount we fetch the user's existing rating (if any) and pre-fill the
// form; submit upserts. UI copy switches between first-time and update modes.

import { useEffect, useState } from 'react';
import {
  ScrollView, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BackButton, ChapterLabel, Display, PrimaryButton, TextLink,
} from '../../../components/editorial';
import { Palette } from '../../../constants/theme';
import { StarRating } from '../../../components/ui/StarRating';
import { fetchUserRating, submitRating } from '../../../services/salonService';
import { RATING_SERVICE_CHIPS } from '../../../constants/salonServices';
import { supabase } from '../../../lib/supabase';
import type { SalonRating } from '../../../types';

function formatRatingDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' });
}

export default function RateSalonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ placeId?: string; salonName?: string }>();
  const placeId = typeof params.placeId === 'string' ? params.placeId : null;
  const salonName = typeof params.salonName === 'string' ? params.salonName : 'Salon';

  const [overall, setOverall] = useState(0);
  const [service, setService] = useState(0);
  const [staff,   setStaff]   = useState(0);
  const [hygiene, setHygiene] = useState(0);
  const [valueR,  setValueR]  = useState(0);
  const [done,    setDone]    = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done_state, setDoneState] = useState<'editing' | 'submitted' | 'auth_required'>('editing');
  const [existingRating, setExistingRating] = useState<SalonRating | null>(null);
  const isUpdate = existingRating !== null;

  useEffect(() => {
    if (!placeId) return;
    let cancelled = false;
    (async () => {
      try {
        const prev = await fetchUserRating(placeId);
        if (cancelled || !prev) return;
        setExistingRating(prev);
        setOverall(prev.rating_overall);
        setService(prev.rating_service ?? 0);
        setStaff(prev.rating_staff ?? 0);
        setHygiene(prev.rating_hygiene ?? 0);
        setValueR(prev.rating_value ?? 0);
        setDone(prev.services_done ?? []);
        setComment(prev.comment ?? '');
      } catch {
        // Non-blocking: form just stays empty.
      }
    })();
    return () => { cancelled = true; };
  }, [placeId]);

  const canSubmit = overall > 0 && done.length > 0 && !submitting;

  const toggleService = (s: string) => {
    setDone((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const onSubmit = async () => {
    if (!placeId || !canSubmit) return;
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setDoneState('auth_required');
        setSubmitting(false);
        return;
      }
      await submitRating({
        google_place_id: placeId,
        salon_name:      salonName,
        rating_overall:  overall,
        rating_service:  service > 0 ? service : null,
        rating_staff:    staff   > 0 ? staff   : null,
        rating_hygiene:  hygiene > 0 ? hygiene : null,
        rating_value:    valueR  > 0 ? valueR  : null,
        services_done:   done,
        comment:         comment.trim() || undefined,
      });
      setDoneState('submitted');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'NOT_AUTHENTICATED') {
        setDoneState('auth_required');
      } else {
        // surface a simple inline error
        setDoneState('editing');
        // eslint-disable-next-line no-alert
        alert('Could not submit rating. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!placeId) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  if (done_state === 'submitted') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <View style={{ paddingHorizontal: 32, paddingTop: 80 }}>
          <ChapterLabel style={{ color: Palette.accent }}>
            {isUpdate ? 'Updated' : 'Submitted'}
          </ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 36 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              Thank you,
            </Text>
            {'\nthat helps.'}
          </Display>
          <Text style={{
            fontFamily: 'CormorantGaramond_400Regular',
            fontSize:   15,
            color:      Palette.ink2,
            marginTop:  18,
            lineHeight: 22,
          }}>
            {isUpdate
              ? 'Your rating now reflects your latest visit.'
              : 'Your rating is now part of the average.'}
          </Text>
          <View style={{ marginTop: 28 }}>
            <TextLink label="Back to salon →" onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (done_state === 'auth_required') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
          <BackButton onPress={() => router.back()} />
        </View>
        <View style={{ paddingHorizontal: 32, paddingTop: 40 }}>
          <ChapterLabel>Sign in required</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 36 }}>
            Sign in to{' '}
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              rate salons.
            </Text>
          </Display>
          <View style={{ marginTop: 28 }}>
            <PrimaryButton
              label="Sign in"
              onPress={() => router.push('/(auth)/splash')}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ paddingHorizontal: 32, paddingTop: 12 }}>
          <ChapterLabel>{salonName}</ChapterLabel>
          <Display style={{ marginTop: 12, fontSize: 32, lineHeight: 36 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              Rate this
            </Text>
            {'\nsalon.'}
          </Display>
          <Text style={{
            fontFamily: 'CormorantGaramond_400Regular_Italic',
            fontStyle:  'italic',
            fontSize:   13.5,
            color:      Palette.ink3,
            marginTop:  10,
            lineHeight: 20,
          }}>
            {isUpdate
              ? `You rated this salon on ${formatRatingDate(existingRating!.created_at)}. Update below.`
              : 'Honest ratings help others. We share averages, never individuals.'}
          </Text>
        </View>

        {/* Overall */}
        <View style={{ paddingHorizontal: 32, paddingTop: 32 }}>
          <ChapterLabel>Overall</ChapterLabel>
          <View style={{ marginTop: 14 }}>
            <StarRating value={overall} onChange={setOverall} size="large" />
          </View>
        </View>

        {/* Dimensions */}
        <View style={{ paddingHorizontal: 32, paddingTop: 32 }}>
          <ChapterLabel>By dimension · optional</ChapterLabel>
          <View style={{ height: 12 }} />
          <DimensionRow label="Service quality" value={service} onChange={setService} />
          <DimensionRow label="Staff"           value={staff}   onChange={setStaff} />
          <DimensionRow label="Hygiene"         value={hygiene} onChange={setHygiene} />
          <DimensionRow label="Value"           value={valueR}  onChange={setValueR} />
        </View>

        {/* Services received */}
        <View style={{ paddingHorizontal: 32, paddingTop: 32 }}>
          <ChapterLabel>Services received</ChapterLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {RATING_SERVICE_CHIPS.map((s) => {
              const selected = done.includes(s);
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => toggleService(s)}
                  activeOpacity={0.85}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical:   8,
                    borderRadius:      999,
                    borderWidth:       1,
                    borderColor:       selected ? Palette.ink : Palette.rule,
                    backgroundColor:   selected ? Palette.ink : 'transparent',
                  }}
                >
                  <Text style={{
                    fontFamily: 'Inter_400Regular',
                    fontSize:   12,
                    color:      selected ? Palette.onScanBg : Palette.ink3,
                  }}>
                    {s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Comment */}
        <View style={{ paddingHorizontal: 32, paddingTop: 32 }}>
          <ChapterLabel>Comment · optional</ChapterLabel>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="What stood out?"
            placeholderTextColor={Palette.ink4}
            multiline
            numberOfLines={4}
            style={{
              marginTop:         12,
              borderBottomWidth: 1,
              borderBottomColor: Palette.rule,
              paddingVertical:   8,
              fontFamily:        'CormorantGaramond_400Regular_Italic',
              fontStyle:         'italic',
              fontSize:          16,
              color:             Palette.ink,
              minHeight:         80,
              textAlignVertical: 'top',
            }}
          />
        </View>

        {/* Submit */}
        <View style={{ paddingHorizontal: 32, paddingTop: 32 }}>
          <PrimaryButton
            label={
              submitting
                ? (isUpdate ? 'Updating...' : 'Submitting...')
                : (isUpdate ? 'Update rating →' : 'Submit rating →')
            }
            onPress={onSubmit}
            disabled={!canSubmit}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DimensionRow({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={{
      flexDirection:    'row',
      justifyContent:   'space-between',
      alignItems:       'center',
      paddingVertical:  10,
      borderTopWidth:   1,
      borderTopColor:   Palette.rule,
    }}>
      <Text style={{
        fontFamily: 'CormorantGaramond_500Medium_Italic',
        fontStyle:  'italic',
        fontSize:   15,
        color:      Palette.ink,
      }}>
        {label}
      </Text>
      <StarRating value={value} onChange={onChange} size="small" />
    </View>
  );
}
