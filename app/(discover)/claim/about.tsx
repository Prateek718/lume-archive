// Step 2 of 5 — basic salon details (name + owner + phone + email).

import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton, ChapterLabel, Display, Dots, PrimaryButton,
} from '../../../components/editorial';
import { Palette } from '../../../constants/theme';
import { useClaimDraft } from './_layout';

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE  = /^\+?\d{7,15}$/;

export default function ClaimAboutScreen() {
  const router = useRouter();
  const draft = useClaimDraft();

  const phoneOk = PHONE_RE.test(draft.phone.replace(/\s+/g, ''));
  const emailOk = EMAIL_RE.test(draft.email.trim());
  const canContinue =
    draft.salon_name.trim().length > 0 &&
    draft.owner_name.trim().length > 0 &&
    phoneOk &&
    emailOk;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <BackButton onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 32, paddingTop: 16 }}>
          <Dots total={5} active={1} />
          <View style={{ height: 18 }} />
          <ChapterLabel>Two of five</ChapterLabel>
          <Display style={{ marginTop: 12, fontSize: 32, lineHeight: 36 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              About your
            </Text>
            {'\nsalon.'}
          </Display>
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 28 }}>
          <Field
            label="Salon name"
            value={draft.salon_name}
            onChange={(v) => draft.setField('salon_name', v)}
          />
          <Field
            label="Owner / manager name"
            value={draft.owner_name}
            onChange={(v) => draft.setField('owner_name', v)}
          />
          <Field
            label="Phone"
            value={draft.phone}
            onChange={(v) => draft.setField('phone', v)}
            keyboardType="phone-pad"
          />
          <Field
            label="Email"
            value={draft.email}
            onChange={(v) => draft.setField('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={{ paddingHorizontal: 32, paddingTop: 28 }}>
          <PrimaryButton
            label="Continue →"
            onPress={() => router.push('/(discover)/claim/services')}
            disabled={!canContinue}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label, value, onChange, keyboardType, autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={Palette.ink4}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={{
          borderBottomWidth: 1,
          borderBottomColor: Palette.rule,
          paddingVertical:   10,
          fontFamily:        'CormorantGaramond_400Regular_Italic',
          fontStyle:         'italic',
          fontSize:          18,
          color:             Palette.ink,
        }}
      />
    </View>
  );
}
