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
type RoutineLevel   = 'simple' | 'balanced' | 'full';

const GENDER_OPTIONS: { label: string; emoji: string; value: GenderValue }[] = [
  { label: 'Man',                emoji: '🧔', value: 'man'   },
  { label: 'Woman',              emoji: '👩', value: 'woman' },
  { label: 'Non-binary / Other', emoji: '🌟', value: 'other' },
];

const ROUTINE_OPTIONS: { label: string; sub: string; value: RoutineLevel }[] = [
  { label: 'Keep it simple',   sub: '2–3 essential products only',  value: 'simple'   },
  { label: 'Balanced routine', sub: '4–5 products, targeted care',  value: 'balanced' },
  { label: 'Full routine',     sub: '6+ products, complete care',   value: 'full'     },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step,         setStep]         = useState<1 | 2 | 3 | 4>(1);
  const [displayName,  setDisplayName]  = useState('');
  const [gender,       setGender]       = useState<GenderValue | null>(null);
  const [city,         setCity]         = useState('');
  const [routineLevel, setRoutineLevel] = useState<RoutineLevel>('simple');
  const [loading,      setLoading]      = useState(false);

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
      city:                city.trim(),
      routine_level:       routineLevel,
      onboarding_complete: true,
    }).eq('id', session.user.id);

    if (error) {
      Alert.alert('Error', 'Could not save profile. Please try again.');
      setLoading(false);
      return;
    }

    await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
    router.replace('/(tabs)/scan');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />

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
              placeholderTextColor={Colors.textTertiary}
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
            <Text style={s.subtitle}>This helps us tailor grooming recommendations for you</Text>
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

        {/* ── STEP 3: City ── */}
        {step === 3 && (
          <>
            <Text style={s.title}>Which city{'\n'}are you in?</Text>
            <Text style={s.subtitle}>We'll show you the best salons near you</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Mumbai, Delhi, Bangalore"
              placeholderTextColor={Colors.textTertiary}
              value={city}
              onChangeText={setCity}
              autoFocus
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => city.trim() && setStep(4)}
            />
            <TouchableOpacity
              style={[s.cta, !city.trim() && s.ctaDisabled]}
              onPress={() => setStep(4)}
              disabled={!city.trim()}
              activeOpacity={0.8}
            >
              <Text style={s.ctaText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── STEP 4: Routine level ── */}
        {step === 4 && (
          <>
            <Text style={s.title}>What kind of routine{'\n'}are you looking for?</Text>
            <Text style={s.subtitle}>We'll recommend the right number of products</Text>
            <View style={s.routineCol}>
              {ROUTINE_OPTIONS.map((opt, idx) => (
                <View key={opt.value}>
                  <TouchableOpacity
                    style={s.routineRow}
                    onPress={() => setRoutineLevel(opt.value)}
                    activeOpacity={0.8}
                  >
                    <View style={s.routineTexts}>
                      <Text style={[s.routineLabel, routineLevel === opt.value && s.routineLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={s.routineSub}>{opt.sub}</Text>
                    </View>
                    <View style={[s.radioOuter, routineLevel === opt.value && s.radioOuterActive]}>
                      {routineLevel === opt.value && <View style={s.radioInner} />}
                    </View>
                  </TouchableOpacity>
                  {idx < ROUTINE_OPTIONS.length - 1 && <View style={s.routineDivider} />}
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={[s.cta, loading && s.ctaDisabled]}
              onPress={handleComplete}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color={Colors.background} />
                : <Text style={s.ctaText}>Finish setup</Text>
              }
            </TouchableOpacity>
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
  backArrow: { fontSize: 32, color: Colors.gold, lineHeight: 40 },

  dotsRow: {
    flexDirection: 'row',
    gap:           6,
    alignItems:    'center',
  },
  dot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: '#2A2420',
  },
  dotActive: {
    backgroundColor: Colors.gold,
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
    color:        Colors.cream,
    lineHeight:   42,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize:     Typography.size.base,
    color:        Colors.textSecondary,
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
    color:             Colors.cream,
    marginBottom:      Spacing.lg,
  },

  genderCol: {
    gap:          Spacing.sm,
    marginBottom: Spacing.lg,
  },
  genderCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#1A1412',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#2A2420',
    padding:         18,
    gap:             Spacing.md,
  },
  genderCardActive: {
    borderColor:     Colors.gold,
    backgroundColor: Colors.goldDim,
  },
  genderEmoji: { fontSize: 22 },
  genderLabel: {
    fontSize: Typography.size.md,
    color:    Colors.textSecondary,
  },
  genderLabelActive: {
    color:      Colors.cream,
    fontWeight: '600',
  },

  cta: {
    backgroundColor: Colors.gold,
    borderRadius:    Radius.input,
    paddingVertical: Spacing.md,
    alignItems:      'center',
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: {
    fontSize:   Typography.size.md,
    fontWeight: '600',
    color:      Colors.background,
  },

  // Routine level step
  routineCol: {
    backgroundColor: '#1A1412',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#2A2420',
    marginBottom:    Spacing.lg,
    overflow:        'hidden',
  },
  routineRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingVertical: 18,
    paddingHorizontal: Spacing.md,
  },
  routineTexts: { flex: 1, marginRight: Spacing.md },
  routineLabel: {
    fontSize:  Typography.size.md,
    color:     Colors.textSecondary,
    marginBottom: 3,
  },
  routineLabelActive: { color: Colors.cream, fontWeight: '600' },
  routineSub:  { fontSize: 13, color: Colors.textTertiary },
  routineDivider: { height: 1, backgroundColor: '#2A2420', marginHorizontal: Spacing.md },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#4A4540',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  radioOuterActive: { borderColor: Colors.gold },
  radioInner: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.gold,
  },
});
