import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { FIRST_LAUNCH_KEY } from '../_layout';

type GenderValue    = 'man' | 'woman' | 'other';
type AgeRange       = '18-25' | '26-35' | '36-45' | '46-55' | '55+';

const GENDER_OPTIONS: { label: string; emoji: string; value: GenderValue }[] = [
  { label: 'Man',                emoji: '🧔', value: 'man'   },
  { label: 'Woman',              emoji: '👩', value: 'woman' },
  { label: 'Non-binary / Other', emoji: '🌟', value: 'other' },
];

const AGE_RANGE_OPTIONS: AgeRange[] = ['18-25', '26-35', '36-45', '46-55', '55+'];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step,        setStep]        = useState<1 | 2 | 3 | 4>(1);
  const [displayName, setDisplayName] = useState('');
  const [gender,      setGender]      = useState<GenderValue | null>(null);
  const [ageRange,    setAgeRange]    = useState<AgeRange | null>(null);
  const [city,        setCity]        = useState('');
  const [loading,     setLoading]     = useState(false);

  const goBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(3);
  };

  const handleComplete = async () => {
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      Alert.alert('Session expired', 'Please sign in again.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('users').update({
      display_name:        displayName.trim(),
      gender:              gender,
      age_range:           ageRange,
      city:                city.trim(),
      onboarding_complete: true,
    }).eq('id', session.user.id);

    if (error) {
      Alert.alert('Error', 'Could not save profile. Please try again.');
      setLoading(false);
      return;
    }

    await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
    router.replace('/scan');
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />

      {/* Top bar — back arrow + progress dots */}
      <View style={[s.topBar, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={{ width: 40 }}>
          {step > 1 && (
            <TouchableOpacity
              onPress={goBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={s.backArrow}>‹</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.dotsRow}>
          {([1, 2, 3, 4] as const).map(i => (
            <View key={i} style={[s.dot, i === step && s.dotActive]} />
          ))}
        </View>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── STEP 1: Name ── */}
        {step === 1 && (
          <>
            <Text style={s.title}>What should we{'\n'}call you?</Text>
            <Text style={s.subtitle}>We'll use this to personalise your experience</Text>
            <TextInput
              style={s.input}
              placeholder="Your name"
              placeholderTextColor={Colors.text3}
              value={displayName}
              onChangeText={setDisplayName}
              autoFocus
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => displayName.trim() && setStep(2)}
            />
            <TouchableOpacity
              style={[s.cta, !displayName.trim() && s.ctaDisabled]}
              onPress={() => setStep(2)}
              disabled={!displayName.trim()}
              activeOpacity={0.8}
            >
              <Text style={s.ctaText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── STEP 2: Gender ── */}
        {step === 2 && (
          <>
            <Text style={s.title}>How do you{'\n'}identify?</Text>
            <Text style={s.subtitle}>This helps us tailor care recommendations for you</Text>
            <View style={s.genderCol}>
              {GENDER_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.genderCard, gender === opt.value && s.genderCardActive]}
                  onPress={() => setGender(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={s.genderEmoji}>{opt.emoji}</Text>
                  <Text style={[s.genderLabel, gender === opt.value && s.genderLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[s.cta, !gender && s.ctaDisabled]}
              onPress={() => setStep(3)}
              disabled={!gender}
              activeOpacity={0.8}
            >
              <Text style={s.ctaText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── STEP 3: Age range ── */}
        {step === 3 && (
          <>
            <Text style={s.title}>How old{'\n'}are you?</Text>
            <Text style={s.subtitle}>Helps us factor age into your skin and care advice</Text>
            <View style={s.ageGrid}>
              {AGE_RANGE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[s.ageCard, ageRange === opt && s.ageCardActive]}
                  onPress={() => setAgeRange(opt)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.ageLabel, ageRange === opt && s.ageLabelActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[s.cta, !ageRange && s.ctaDisabled]}
              onPress={() => setStep(4)}
              disabled={!ageRange}
              activeOpacity={0.8}
            >
              <Text style={s.ctaText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── STEP 4: City ── */}
        {step === 4 && (
          <>
            <Text style={s.title}>Which city{'\n'}are you in?</Text>
            <Text style={s.subtitle}>We'll show you the best salons near you</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Mumbai, Delhi, Bangalore"
              placeholderTextColor={Colors.text3}
              value={city}
              onChangeText={setCity}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => city.trim() && !loading && handleComplete()}
            />
            <TouchableOpacity
              style={[s.cta, (!city.trim() || loading) && s.ctaDisabled]}
              onPress={handleComplete}
              disabled={!city.trim() || loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color={Colors.textOnAccent} />
                : <Text style={s.ctaText}>Finish setup</Text>
              }
            </TouchableOpacity>
            <Text style={s.privacyNote}>
              Your scans are private — photos are{'\n'}analysed and immediately deleted.
            </Text>
          </>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom:  Spacing.md,
  },
  backArrow: { fontSize: 32, color: Colors.text, lineHeight: 40 },

  dotsRow: {
    flexDirection: 'row',
    gap:           6,
    alignItems:    'center',
  },
  dot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: Colors.surface,
  },
  dotActive: {
    backgroundColor: Colors.accent,
  },

  content: {
    flexGrow:          1,
    paddingHorizontal: Spacing.xl,
    paddingTop:        Spacing.lg,
    paddingBottom:     Spacing.xl,
  },

  title: {
    fontFamily:   Typography.serif,
    fontSize:     Typography.size.xxxl,
    color:        Colors.text,
    lineHeight:   42,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize:     Typography.size.base,
    color:        Colors.text2,
    marginBottom: Spacing.xl,
    lineHeight:   20,
  },

  input: {
    backgroundColor:   Colors.surface,
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.md,
    fontSize:          Typography.size.lg,
    color:             Colors.text,
    marginBottom:      Spacing.lg,
  },

  genderCol: {
    gap:          Spacing.sm,
    marginBottom: Spacing.lg,
  },
  genderCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         18,
    gap:             Spacing.md,
  },
  genderCardActive: {
    borderColor:     Colors.accent,
    backgroundColor: Colors.surface2,
  },
  genderEmoji: { fontSize: 22 },
  genderLabel: {
    fontSize: Typography.size.md,
    color:    Colors.text2,
  },
  genderLabelActive: {
    color:      Colors.text,
    fontWeight: '600',
  },

  cta: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.input,
    paddingVertical: Spacing.md,
    alignItems:      'center',
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: {
    fontSize:   Typography.size.md,
    fontWeight: '600',
    color:      Colors.textOnAccent,
  },

  // Age range step
  ageGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            Spacing.sm,
    marginBottom:   Spacing.lg,
  },
  ageCard: {
    flex:            1,
    minWidth:        '28%',
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    paddingVertical: 16,
    alignItems:      'center',
  },
  ageCardActive: {
    borderColor:     Colors.accent,
    backgroundColor: Colors.surface2,
  },
  ageLabel: {
    fontSize:   Typography.size.md,
    color:      Colors.text2,
    fontWeight: '500',
  },
  ageLabelActive: {
    color:      Colors.text,
    fontWeight: '600',
  },

  privacyNote: {
    fontSize:    11,
    color:       Colors.text2,
    textAlign:   'center',
    marginTop:   Spacing.md,
    letterSpacing: 0.2,
    lineHeight:  17,
  },
});
