// Step 3 of 5 — services offered. Multi-select per group; "other" allows
// custom service tags.

import { useState } from 'react';
import {
  ScrollView, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton, ChapterLabel, Display, Dots, PrimaryButton,
} from '../../../components/editorial';
import { Palette } from '../../../constants/theme';
import {
  SALON_SERVICE_GROUPS, type SalonServiceGroup,
} from '../../../constants/salonServices';
import { useClaimDraft, type ClaimDraft } from './_layout';

const FIELD_BY_GROUP: Record<SalonServiceGroup, keyof ClaimDraft> = {
  hair:   'services_hair',
  skin:   'services_skin',
  beard:  'services_beard',
  bridal: 'services_bridal',
};

const GROUP_LABELS: Record<SalonServiceGroup, string> = {
  hair:   'Hair',
  skin:   'Skin',
  beard:  'Beard',
  bridal: 'Bridal',
};

export default function ClaimServicesScreen() {
  const router = useRouter();
  const draft = useClaimDraft();
  const [otherInput, setOtherInput] = useState('');

  const totalSelected =
    draft.services_hair.length +
    draft.services_skin.length +
    draft.services_beard.length +
    draft.services_bridal.length +
    draft.services_other.length;
  const canContinue = totalSelected > 0;

  const togglePill = (group: SalonServiceGroup, value: string) => {
    const field = FIELD_BY_GROUP[group];
    const current = draft[field] as string[];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    draft.setField(field, next as never);
  };

  const addOther = () => {
    const trimmed = otherInput.trim();
    if (!trimmed) return;
    if (draft.services_other.includes(trimmed)) {
      setOtherInput('');
      return;
    }
    draft.setField('services_other', [...draft.services_other, trimmed]);
    setOtherInput('');
  };

  const removeOther = (value: string) => {
    draft.setField('services_other', draft.services_other.filter((v) => v !== value));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={{ paddingHorizontal: 32, paddingTop: 16 }}>
          <Dots total={5} active={2} />
          <View style={{ height: 18 }} />
          <ChapterLabel>Three of five</ChapterLabel>
          <Display style={{ marginTop: 12, fontSize: 32, lineHeight: 36 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              What you
            </Text>
            {'\noffer.'}
          </Display>
        </View>

        {(Object.keys(SALON_SERVICE_GROUPS) as SalonServiceGroup[]).map((group) => {
          const field = FIELD_BY_GROUP[group];
          const selectedList = draft[field] as string[];
          return (
            <View key={group} style={{ paddingHorizontal: 32, paddingTop: 24 }}>
              <ChapterLabel>{GROUP_LABELS[group]}</ChapterLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {SALON_SERVICE_GROUPS[group].map((service) => {
                  const selected = selectedList.includes(service);
                  return (
                    <TouchableOpacity
                      key={service}
                      onPress={() => togglePill(group, service)}
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
                        {service}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Other services */}
        <View style={{ paddingHorizontal: 32, paddingTop: 24 }}>
          <ChapterLabel>Other services</ChapterLabel>
          <Text style={{
            fontFamily: 'CormorantGaramond_400Regular_Italic',
            fontStyle:  'italic',
            fontSize:   12,
            color:      Palette.ink3,
            marginTop:  6,
          }}>
            Anything we missed?
          </Text>
          {draft.services_other.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {draft.services_other.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => removeOther(s)}
                  activeOpacity={0.85}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical:   8,
                    borderRadius:      999,
                    backgroundColor:   Palette.ink,
                    flexDirection:     'row',
                    alignItems:        'center',
                    gap:               6,
                  }}
                >
                  <Text style={{
                    fontFamily: 'Inter_400Regular',
                    fontSize:   12,
                    color:      Palette.onScanBg,
                  }}>
                    {s}
                  </Text>
                  <Text style={{
                    fontFamily: 'Inter_400Regular',
                    fontSize:   12,
                    color:      Palette.onScanBg,
                  }}>
                    ×
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={{
            flexDirection:    'row',
            alignItems:       'center',
            marginTop:        16,
            borderTopWidth:   1,
            borderTopColor:   Palette.rule,
            borderStyle:      'dashed',
            paddingTop:       12,
          }}>
            <TextInput
              value={otherInput}
              onChangeText={setOtherInput}
              onSubmitEditing={addOther}
              placeholder="Add a service..."
              placeholderTextColor={Palette.ink4}
              returnKeyType="done"
              style={{
                flex:       1,
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle:  'italic',
                fontSize:   16,
                color:      Palette.ink,
                paddingVertical: 6,
              }}
            />
            <TouchableOpacity
              onPress={addOther}
              style={{
                paddingHorizontal: 14,
                paddingVertical:   6,
              }}
            >
              <Text style={{
                fontFamily: 'CormorantGaramond_500Medium_Italic',
                fontStyle:  'italic',
                fontSize:   22,
                color:      Palette.accent,
              }}>
                +
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 32 }}>
          <PrimaryButton
            label="Continue →"
            onPress={() => router.push('/(discover)/claim/pricing')}
            disabled={!canContinue}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
