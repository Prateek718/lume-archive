// Hair profile setup — one-at-a-time question flow with bald branching.
// Bald path: 3 questions (hair_length → scalp_type → scalp_concern)
// Full path:  7 questions (hair_length → scalp_type → primary_concern → texture →
//             wash_frequency → oils_regularly → chemically_treated)
// Saves hair_profile + hair_recommendations to users table on completion.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../lib/supabase';
import { generateAndSaveHairProfile, refreshRecommendations } from '../services/scanService';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import type { HairProfile } from '../types';

// ── Question definitions ───────────────────────────────────────────────────────

type QuestionKey = keyof HairProfile;

type Question = {
  key:     QuestionKey;
  title:   string;
  subtitle?: string;
  options: { label: string; value: string; description?: string }[];
};

// Q1 — shared for both paths. Bald / Shaved is last so gender filter can drop it cleanly.
const Q_HAIR_LENGTH: Question = {
  key:   'hair_length',
  title: 'How would you describe your hair length?',
  options: [
    { label: 'Very short',     value: 'very_short',  description: 'Buzz cut, close crop' },
    { label: 'Short',          value: 'short',       description: 'Above the ears' },
    { label: 'Medium',         value: 'medium',      description: 'Shoulder length or above' },
    { label: 'Long',           value: 'long',        description: 'Past the shoulders' },
    { label: 'Bald / Shaved',  value: 'bald',        description: 'No hair or freshly shaved' },
  ],
};

// Bald path — questions 2 & 3
const BALD_QUESTIONS: Question[] = [
  {
    key:   'scalp_type',
    title: 'What is your scalp like?',
    options: [
      { label: 'Oily',         value: 'oily',        description: 'Gets shiny through the day' },
      { label: 'Normal',       value: 'normal',      description: 'Balanced, rarely irritated' },
      { label: 'Dry',          value: 'dry',         description: 'Feels tight or flaky' },
      { label: 'Combination',  value: 'combination', description: 'Oily in some areas, dry in others' },
    ],
  },
  {
    key:      'scalp_concern',
    title:    'Any specific scalp concerns?',
    subtitle: 'We\'ll tailor your scalp care routine around this.',
    options: [
      { label: 'Dry & flaky',   value: 'dry_flaky',   description: 'Dandruff or visible flaking' },
      { label: 'Oily & shiny',  value: 'oily_shiny',  description: 'Shine or excess sebum' },
      { label: 'Sensitive',     value: 'sensitive',   description: 'Easily irritated or itchy' },
      { label: 'None',          value: 'none',        description: 'Scalp feels fine' },
    ],
  },
];

// Full path — questions 2–7
const FULL_QUESTIONS: Question[] = [
  {
    key:   'scalp_type',
    title: 'What is your scalp like?',
    options: [
      { label: 'Oily',         value: 'oily',        description: 'Gets shiny through the day' },
      { label: 'Normal',       value: 'normal',      description: 'Balanced, rarely irritated' },
      { label: 'Dry',          value: 'dry',         description: 'Feels tight or flaky' },
      { label: 'Combination',  value: 'combination', description: 'Oily in some areas, dry in others' },
    ],
  },
  {
    key:      'primary_concern',
    title:    'What are your main hair concerns?',
    subtitle: 'Select all that apply.',
    options: [
      { label: 'Hair fall',    value: 'hairfall',  description: 'Noticeable shedding or thinning' },
      { label: 'Dandruff',     value: 'dandruff',  description: 'Flaking, itchy scalp' },
      { label: 'Dryness',      value: 'dryness',   description: 'Brittle or parched hair' },
      { label: 'Frizz',        value: 'frizz',     description: 'Difficult to manage or style' },
      { label: 'Damage',       value: 'damage',    description: 'From heat, colour or chemicals' },
      { label: 'No concern',   value: 'none',      description: 'Hair is in good shape' },
    ],
  },
  {
    key:   'texture',
    title: 'What is your natural hair texture?',
    options: [
      { label: 'Straight', value: 'straight', description: 'Lies flat without curl' },
      { label: 'Wavy',     value: 'wavy',     description: 'Gentle S-shaped waves' },
      { label: 'Curly',    value: 'curly',    description: 'Defined spiral curls' },
      { label: 'Coily',    value: 'coily',    description: 'Tight coils or kinks' },
    ],
  },
  {
    key:   'wash_frequency',
    title: 'How often do you wash your hair?',
    options: [
      { label: 'Daily',             value: 'daily',            description: 'Every morning or evening' },
      { label: 'Every 2–3 days',    value: 'every_2_3_days',  description: 'Most common routine' },
      { label: 'Once a week',       value: 'once_a_week',      description: 'Weekend wash' },
      { label: 'Less than weekly',  value: 'less_than_weekly', description: 'Every 10+ days' },
    ],
  },
  {
    key:   'oils_regularly',
    title: 'Do you oil your hair regularly?',
    options: [
      { label: 'Yes', value: 'true',  description: 'At least once a week' },
      { label: 'No',  value: 'false', description: 'Rarely or never' },
    ],
  },
  {
    key:   'chemically_treated',
    title: 'Any chemical treatments?',
    options: [
      { label: 'None',           value: 'none',          description: 'No chemical history' },
      { label: 'Hair colour',    value: 'color',         description: 'Dyed or highlighted' },
      { label: 'Straightening',  value: 'straightening', description: 'Keratin or relaxer' },
      { label: 'Perming',        value: 'perming',       description: 'Chemical curl treatment' },
      { label: 'Multiple',       value: 'multiple',      description: 'More than one of the above' },
    ],
  },
];

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function HairProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();

  const [gender,     setGender]     = useState<string>('man');
  const [step,       setStep]       = useState(0);
  const [answers,    setAnswers]    = useState<Record<string, string | string[]>>({});
  const [saving,     setSaving]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    const loadGender = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('gender')
        .eq('id', user.id)
        .single();
      if (data?.gender) setGender(data.gender as string);
    };
    loadGender();
  }, []);

  const isBald = answers['hair_length'] === 'bald';

  // Build the full question list depending on whether user is bald
  const questions: Question[] = step === 0
    ? [Q_HAIR_LENGTH]
    : isBald
      ? [Q_HAIR_LENGTH, ...BALD_QUESTIONS]
      : [Q_HAIR_LENGTH, ...FULL_QUESTIONS];

  // After Q1 answer lands we re-derive questions, so cap step to list length
  const current = questions[Math.min(step, questions.length - 1)];

  const isMultiSelect = current.key === 'primary_concern';

  const handleSelect = async (value: string) => {
    if (isMultiSelect) {
      const prev = (answers[current.key as string] as string[] | undefined) ?? [];
      const next = prev.includes(value)
        ? prev.filter(v => v !== value)
        : [...prev, value];
      setAnswers({ ...answers, [current.key as string]: next });
      return;
    }

    const newAnswers = { ...answers, [current.key]: value };
    setAnswers(newAnswers);

    // Determine the full question set for this user after this answer
    const nextIsBald = newAnswers['hair_length'] === 'bald';
    const fullQuestions: Question[] = newAnswers['hair_length']
      ? [Q_HAIR_LENGTH, ...(nextIsBald ? BALD_QUESTIONS : FULL_QUESTIONS)]
      : [Q_HAIR_LENGTH];

    if (step < fullQuestions.length - 1) {
      setStep(step + 1);
    } else {
      await submit(newAnswers, nextIsBald);
    }
  };

  const handleMultiContinue = async () => {
    const nextIsBald = answers['hair_length'] === 'bald';
    const fullQuestions: Question[] = [Q_HAIR_LENGTH, ...(nextIsBald ? BALD_QUESTIONS : FULL_QUESTIONS)];
    if (step < fullQuestions.length - 1) {
      setStep(step + 1);
    } else {
      await submit(answers, nextIsBald);
    }
  };

  const submit = async (rawAnswers: Record<string, string | string[]>, bald: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const profile: HairProfile = {
        hair_length: rawAnswers.hair_length as HairProfile['hair_length'],
        scalp_type:  rawAnswers.scalp_type  as HairProfile['scalp_type'],
        ...(bald
          ? {
              scalp_concern: rawAnswers.scalp_concern as HairProfile['scalp_concern'],
            }
          : {
              primary_concern:    rawAnswers.primary_concern    as HairProfile['primary_concern'],
              texture:            rawAnswers.texture            as HairProfile['texture'],
              wash_frequency:     rawAnswers.wash_frequency     as HairProfile['wash_frequency'],
              oils_regularly:     rawAnswers.oils_regularly     === 'true',
              chemically_treated: rawAnswers.chemically_treated as HairProfile['chemically_treated'],
            }),
      };

      // Grab face shape from latest scan if available
      const { data: latestScan } = await supabase
        .from('scans')
        .select('face_shape')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const faceShape = (latestScan?.face_shape as string | null) ?? null;
      await generateAndSaveHairProfile(user.id, profile, faceShape, gender);

      setSaving(false);
      Alert.alert(
        'Hair profile saved',
        'Your hair routine is updated. Want to also refresh your face scan recommendations with the new profile?',
        [
          {
            text: 'Done',
            style: 'cancel',
            onPress: () => {
              if (returnTo === 'hair-detail') {
                router.replace('/hair-detail' as any);
              } else {
                router.replace('/(tabs)/routine');
              }
            },
          },
          {
            text: 'Refresh face scan',
            onPress: async () => {
              setRefreshing(true);
              try {
                console.log('[hair-profile] calling refreshRecommendations for user:', user.id);
                const scanId = await refreshRecommendations(user.id);
                console.log('[hair-profile] refresh succeeded, scanId:', scanId);
                router.replace({
                  pathname: '/recommendations',
                  params: { scanId },
                });
              } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error('[hair-profile] refresh failed:', msg);
                Alert.alert('Error', 'Could not refresh recommendations. Please try again.');
                if (returnTo === 'hair-detail') {
                  router.replace('/hair-detail' as any);
                } else {
                  router.replace('/(tabs)/routine');
                }
              } finally {
                setRefreshing(false);
              }
            },
          },
        ],
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  // Derive total steps for progress dots (finalised once hair_length is answered)
  const totalSteps = answers['hair_length']
    ? (isBald ? 1 + BALD_QUESTIONS.length : 1 + FULL_QUESTIONS.length)
    : 7; // default to full length before Q1 is answered

  if (saving || refreshing) {
    return (
      <View style={[s.screen, s.center, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={Colors.accent} size="large" style={{ marginBottom: Spacing.lg }} />
        <Text style={s.savingText}>
          {refreshing ? 'Refreshing recommendations…' : 'Building your hair profile…'}
        </Text>
        <Text style={s.savingNote}>This takes about 10 seconds</Text>
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>

        {/* Progress dots */}
        <View style={s.dotsRow}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={[s.dot, i === step && s.dotActive, i < step && s.dotDone]}
            />
          ))}
        </View>

        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.stepLabel}>{step + 1} of {totalSteps}</Text>
        <Text style={s.question}>{current.title}</Text>
        {current.subtitle && (
          <Text style={s.questionSubtitle}>{current.subtitle}</Text>
        )}

        <View style={s.cardList}>
          {(current.key === 'hair_length'
            ? (gender === 'woman'
                ? Q_HAIR_LENGTH.options.filter(o =>
                    ['short', 'medium', 'long'].includes(o.value)
                  )
                : Q_HAIR_LENGTH.options)
            : current.options
          ).map(opt => {
            const isSelected = isMultiSelect
              ? ((answers[current.key as string] as string[] | undefined) ?? []).includes(opt.value)
              : answers[current.key as string] === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[s.card, isSelected && s.cardActive]}
                onPress={() => handleSelect(opt.value)}
                activeOpacity={0.8}
              >
                <View style={s.cardInner}>
                  <Text style={[s.cardLabel, isSelected && s.cardLabelActive]}>
                    {opt.label}
                  </Text>
                  {opt.description && (
                    <Text style={[s.cardDesc, isSelected && s.cardDescActive]}>
                      {opt.description}
                    </Text>
                  )}
                </View>
                <View style={[isMultiSelect ? s.cardCheckbox : s.cardRadio, isSelected && s.cardRadioActive]}>
                  {isSelected && <View style={isMultiSelect ? s.cardCheckmark : s.cardRadioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {isMultiSelect && (
          <TouchableOpacity
            style={[
              s.continueBtn,
              !((answers['primary_concern'] as string[] | undefined)?.length) && s.continueBtnDisabled,
            ]}
            onPress={handleMultiContinue}
            disabled={!((answers['primary_concern'] as string[] | undefined)?.length)}
            activeOpacity={0.8}
          >
            <Text style={s.continueBtnText}>Continue</Text>
          </TouchableOpacity>
        )}

        {error && (
          <Text style={s.errorText}>{error}</Text>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backArrow: { fontSize: 32, color: Colors.text, lineHeight: 40 },

  dotsRow: { flexDirection: 'row', gap: 6 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.accent, width: 20, borderRadius: 4 },
  dotDone:   { backgroundColor: (Colors.accent as string) + '60' },

  content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.xl, paddingBottom: Spacing.xxxl },

  stepLabel: {
    fontSize: 11, color: Colors.text, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: Spacing.sm,
  },
  question: {
    fontFamily: Typography.serif, fontSize: 26, color: Colors.text,
    lineHeight: 34, marginBottom: Spacing.sm,
  },
  questionSubtitle: {
    fontSize: 14, color: Colors.text2, lineHeight: 20,
    marginBottom: Spacing.xl,
  },

  cardList: { gap: Spacing.sm, marginTop: Spacing.lg },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.card, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  cardActive: { backgroundColor: Colors.surface2, borderColor: Colors.accent },
  cardInner: { flex: 1 },
  cardLabel: { fontSize: 15, color: Colors.text, fontWeight: '500', marginBottom: 2 },
  cardLabelActive: { color: Colors.accent },
  cardDesc: { fontSize: 12, color: Colors.text3, lineHeight: 16 },
  cardDescActive: { color: Colors.accent + 'AA' },

  cardRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.md,
  },
  cardRadioActive: { borderColor: Colors.accent },
  cardRadioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },

  cardCheckbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.md,
  },
  cardCheckmark: { width: 10, height: 10, borderRadius: 2, backgroundColor: Colors.accent },

  continueBtn: {
    marginTop: Spacing.xl, backgroundColor: Colors.accent,
    borderRadius: Radius.card, paddingVertical: 14, alignItems: 'center',
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText:     { fontSize: 15, fontWeight: '600', color: Colors.card },

  savingText: { fontFamily: Typography.serif, fontSize: 22, color: Colors.text, marginBottom: Spacing.xs },
  savingNote: { fontSize: 13, color: Colors.text2 },

  errorText: { fontSize: 13, color: '#A32D2D', marginTop: Spacing.lg, textAlign: 'center' },
});
