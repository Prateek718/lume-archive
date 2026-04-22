import { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  BackButton,
  Dots,
  ChapterLabel,
  Display,
  Body,
  OptionRow,
  TextLink,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';

const italicStyle = {
  fontFamily: 'CormorantGaramond_500Medium_Italic',
  fontStyle: 'italic' as const,
};

const AGE_OPTIONS = ['18 – 25', '26 – 35', '36 – 45', '46 – 55', '55 and over'];
const GENDER_OPTIONS = ['Man', 'Woman', 'Prefer not to say'];

const AGE_RANGE_STORAGE: Record<string, '18-25' | '26-35' | '36-45' | '46-55' | '55+'> = {
  '18 – 25':     '18-25',
  '26 – 35':     '26-35',
  '36 – 45':     '36-45',
  '46 – 55':     '46-55',
  '55 and over': '55+',
};

function titleCase(s: string) {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [age, setAge] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [categories, setCategories] = useState<Array<'skin' | 'hair' | 'beard' | 'makeup'>>(['skin', 'hair']);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleCategory = (cat: 'beard' | 'makeup') => {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  const isValid =
    (step === 0 && name.trim().length >= 1) ||
    (step === 1 && age !== null) ||
    (step === 2 && city.trim().length >= 1) ||
    (step === 3 && gender !== null) ||
    step === 4;

  const back = () => {
    if (step === 0) {
      router.replace('/(auth)/splash');
    } else {
      setStep(step - 1);
    }
  };

  const next = async () => {
    if (!isValid || submitting) return;

    if (step === 0) {
      setName(name.trim());
      setStep(1);
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      setCity(titleCase(city));
      setStep(3);
      return;
    }
    if (step === 3) {
      setStep(4);
      return;
    }

    // step 4 — submit
    setSubmitting(true);
    setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('You are not signed in. Please sign in and try again.');
      setSubmitting(false);
      return;
    }
    const mappedGender: 'man' | 'woman' | 'prefer_not_to_say' =
      gender === 'Man' ? 'man' : gender === 'Woman' ? 'woman' : 'prefer_not_to_say';
    const storedAge = age ? AGE_RANGE_STORAGE[age] : null;
    const { error: upsertError } = await supabase.from('users').upsert({
      id: user.id,
      display_name: name.trim(),
      age_range: storedAge,
      city: titleCase(city),
      gender: mappedGender,
      care_categories: categories,
      onboarding_complete: true,
    });
    if (upsertError) {
      setError(upsertError.message);
      setSubmitting(false);
      return;
    }
    router.replace('/scan');
  };

  const nextLabel = step === 4 ? 'begin reading →' : 'continue →';
  const chapter =
    step === 0 ? 'Chapter one · of five'
    : step === 1 ? 'Chapter two · of five'
    : step === 2 ? 'Chapter three · of five'
    : step === 3 ? 'Chapter four · of five'
    : 'Chapter five · of five';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 16, paddingBottom: 48, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <BackButton onPress={back} />
            <Dots total={5} active={step} />
          </View>

          <View style={{ height: 32 }} />
          <ChapterLabel>{chapter}</ChapterLabel>
          <View style={{ height: 10 }} />

          {step === 0 && (
            <>
              <Display>
                What should{'\n'}we <Text style={italicStyle}>call you?</Text>
              </Display>
              <View style={{ height: 12 }} />
              <View style={{ maxWidth: 260 }}>
                <Body serif>Just a first name is fine.</Body>
              </View>
              <View style={{ height: 40 }} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Type your name"
                placeholderTextColor={Palette.ink4}
                autoCapitalize="words"
                autoCorrect={false}
                style={{
                  fontSize: 20,
                  fontFamily: 'CormorantGaramond_400Regular',
                  color: Palette.ink,
                  borderBottomWidth: 1,
                  borderBottomColor: Palette.rule,
                  paddingVertical: 12,
                }}
              />
              <Text
                style={{
                  marginTop: 10,
                  fontFamily: 'Inter_400Regular',
                  fontSize: 11,
                  letterSpacing: 0.2,
                  color: Palette.ink3,
                }}
              >
                This is how we'll address you.
              </Text>
            </>
          )}

          {step === 1 && (
            <>
              <Display>
                How old are you,{'\n'}<Text style={italicStyle}>roughly?</Text>
              </Display>
              <View style={{ height: 12 }} />
              <View style={{ maxWidth: 260 }}>
                <Body serif>Skin changes shape with age in predictable ways. We'll adjust for that.</Body>
              </View>
              <View style={{ height: 24 }} />
              {AGE_OPTIONS.map((opt, i) => (
                <OptionRow
                  key={opt}
                  label={opt}
                  selected={age === opt}
                  onPress={() => setAge(opt)}
                  last={i === AGE_OPTIONS.length - 1}
                />
              ))}
            </>
          )}

          {step === 2 && (
            <>
              <Display>
                And where do{'\n'}you <Text style={italicStyle}>live?</Text>
              </Display>
              <View style={{ height: 12 }} />
              <View style={{ maxWidth: 260 }}>
                <Body serif>Humidity, pollution, and water change what your skin needs.</Body>
              </View>
              <View style={{ height: 40 }} />
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="Your city"
                placeholderTextColor={Palette.ink4}
                autoCapitalize="words"
                autoCorrect={false}
                style={{
                  fontSize: 20,
                  fontFamily: 'CormorantGaramond_400Regular',
                  color: Palette.ink,
                  borderBottomWidth: 1,
                  borderBottomColor: Palette.rule,
                  paddingVertical: 12,
                }}
              />
            </>
          )}

          {step === 3 && (
            <>
              <Display>
                One last <Text style={italicStyle}>thing</Text>.
              </Display>
              <View style={{ height: 12 }} />
              <View style={{ maxWidth: 260 }}>
                <Body serif>This helps us tailor your care plan — hair, beard, or makeup focus.</Body>
              </View>
              <View style={{ height: 24 }} />
              {GENDER_OPTIONS.map((opt, i) => (
                <OptionRow
                  key={opt}
                  label={opt}
                  selected={gender === opt}
                  onPress={() => setGender(opt)}
                  last={i === GENDER_OPTIONS.length - 1}
                />
              ))}
            </>
          )}

          {step === 4 && (
            <>
              <Display>
                Your care <Text style={italicStyle}>focus</Text>.
              </Display>
              <View style={{ height: 12 }} />
              <View style={{ maxWidth: 260 }}>
                <Body serif>
                  Skin and hair are always part of your plan. Pick anything else you'd like us to cover.
                </Body>
              </View>
              <View style={{ height: 24 }} />
              <OptionRow
                label="Skin"
                selected
                locked
                variant="checkbox"
                onPress={() => {}}
              />
              <OptionRow
                label="Hair"
                selected
                locked
                variant="checkbox"
                onPress={() => {}}
              />
              <OptionRow
                label="Beard"
                selected={categories.includes('beard')}
                variant="checkbox"
                onPress={() => toggleCategory('beard')}
              />
              <OptionRow
                label="Makeup"
                selected={categories.includes('makeup')}
                variant="checkbox"
                onPress={() => toggleCategory('makeup')}
                last
              />
            </>
          )}

          {error && (
            <Text style={{ marginTop: 18, color: Palette.danger, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
              {error}
            </Text>
          )}

          <View style={{ flex: 1 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 32 }}>
            <View style={{ opacity: isValid && !submitting ? 1 : 0.3 }}>
              <TextLink
                label={submitting ? 'saving…' : nextLabel}
                onPress={next}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
