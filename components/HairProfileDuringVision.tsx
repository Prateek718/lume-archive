// Hair profile collection shown in parallel with phase 1 vision on the first
// scan. Reuses the same question set as app/hair-profile.tsx but inlined here
// so the scan flow doesn't have to route away. Fires onComplete(profile) as
// soon as the last question is answered; the caller saves the profile and
// advances the scan flow.

import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import type { HairProfile } from '../types';

type QuestionKey = keyof HairProfile;

type Question = {
  key:       QuestionKey;
  title:     string;
  subtitle?: string;
  options:   { label: string; value: string; description?: string }[];
};

const Q_HAIR_LENGTH: Question = {
  key:   'hair_length',
  title: 'How would you describe your hair length?',
  options: [
    { label: 'Very short',    value: 'very_short', description: 'Buzz cut, close crop' },
    { label: 'Short',         value: 'short',      description: 'Above the ears' },
    { label: 'Medium',        value: 'medium',     description: 'Shoulder length or above' },
    { label: 'Long',          value: 'long',       description: 'Past the shoulders' },
    { label: 'Bald / Shaved', value: 'bald',       description: 'No hair or freshly shaved' },
  ],
};

const BALD_QUESTIONS: Question[] = [
  {
    key:   'scalp_type',
    title: 'What is your scalp like?',
    options: [
      { label: 'Oily',        value: 'oily',        description: 'Gets shiny through the day' },
      { label: 'Normal',      value: 'normal',      description: 'Balanced, rarely irritated' },
      { label: 'Dry',         value: 'dry',         description: 'Feels tight or flaky' },
      { label: 'Combination', value: 'combination', description: 'Oily in some areas, dry in others' },
    ],
  },
  {
    key:      'scalp_concern',
    title:    'Any specific scalp concerns?',
    subtitle: "We'll tailor your scalp care around this.",
    options: [
      { label: 'Dry & flaky',  value: 'dry_flaky',  description: 'Dandruff or visible flaking' },
      { label: 'Oily & shiny', value: 'oily_shiny', description: 'Shine or excess sebum' },
      { label: 'Sensitive',    value: 'sensitive',  description: 'Easily irritated or itchy' },
      { label: 'None',         value: 'none',       description: 'Scalp feels fine' },
    ],
  },
];

const FULL_QUESTIONS: Question[] = [
  {
    key:   'scalp_type',
    title: 'What is your scalp like?',
    options: [
      { label: 'Oily',        value: 'oily',        description: 'Gets shiny through the day' },
      { label: 'Normal',      value: 'normal',      description: 'Balanced, rarely irritated' },
      { label: 'Dry',         value: 'dry',         description: 'Feels tight or flaky' },
      { label: 'Combination', value: 'combination', description: 'Oily in some areas, dry in others' },
    ],
  },
  {
    key:      'primary_concern',
    title:    'What are your main hair concerns?',
    subtitle: 'Select all that apply.',
    options: [
      { label: 'Hair fall',  value: 'hairfall', description: 'Noticeable shedding or thinning' },
      { label: 'Dandruff',   value: 'dandruff', description: 'Flaking, itchy scalp' },
      { label: 'Dryness',    value: 'dryness',  description: 'Brittle or parched hair' },
      { label: 'Frizz',      value: 'frizz',    description: 'Difficult to manage or style' },
      { label: 'Damage',     value: 'damage',   description: 'From heat, colour or chemicals' },
      { label: 'No concern', value: 'none',     description: 'Hair is in good shape' },
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
      { label: 'Daily',            value: 'daily',            description: 'Every morning or evening' },
      { label: 'Every 2–3 days',   value: 'every_2_3_days',   description: 'Most common routine' },
      { label: 'Once a week',      value: 'once_a_week',      description: 'Weekend wash' },
      { label: 'Less than weekly', value: 'less_than_weekly', description: 'Every 10+ days' },
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
      { label: 'None',          value: 'none',          description: 'No chemical history' },
      { label: 'Hair colour',   value: 'color',         description: 'Dyed or highlighted' },
      { label: 'Straightening', value: 'straightening', description: 'Keratin or relaxer' },
      { label: 'Perming',       value: 'perming',       description: 'Chemical curl treatment' },
      { label: 'Multiple',      value: 'multiple',      description: 'More than one of the above' },
    ],
  },
];

export function HairProfileDuringVision({
  gender,
  visionStep,
  onComplete,
}: {
  gender:     string;
  visionStep: string;
  onComplete: (profile: HairProfile) => void;
}) {
  const [step,    setStep]    = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const isBald = answers['hair_length'] === 'bald';

  const questions: Question[] = step === 0
    ? [Q_HAIR_LENGTH]
    : isBald
      ? [Q_HAIR_LENGTH, ...BALD_QUESTIONS]
      : [Q_HAIR_LENGTH, ...FULL_QUESTIONS];

  const current = questions[Math.min(step, questions.length - 1)];
  const isMultiSelect = current.key === 'primary_concern';

  const totalSteps = answers['hair_length']
    ? (isBald ? 1 + BALD_QUESTIONS.length : 1 + FULL_QUESTIONS.length)
    : 7;

  const buildProfile = (raw: Record<string, string | string[]>, bald: boolean): HairProfile => ({
    hair_length: raw.hair_length as HairProfile['hair_length'],
    scalp_type:  raw.scalp_type  as HairProfile['scalp_type'],
    ...(bald
      ? { scalp_concern: raw.scalp_concern as HairProfile['scalp_concern'] }
      : {
          primary_concern:    raw.primary_concern    as HairProfile['primary_concern'],
          texture:            raw.texture            as HairProfile['texture'],
          wash_frequency:     raw.wash_frequency     as HairProfile['wash_frequency'],
          oils_regularly:     raw.oils_regularly === 'true',
          chemically_treated: raw.chemically_treated as HairProfile['chemically_treated'],
        }),
  });

  const handleSelect = (value: string) => {
    if (isMultiSelect) {
      const prev = (answers[current.key as string] as string[] | undefined) ?? [];
      const next = prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value];
      setAnswers({ ...answers, [current.key as string]: next });
      return;
    }

    const newAnswers = { ...answers, [current.key]: value };
    setAnswers(newAnswers);

    const nextIsBald = newAnswers['hair_length'] === 'bald';
    const fullQuestions: Question[] = newAnswers['hair_length']
      ? [Q_HAIR_LENGTH, ...(nextIsBald ? BALD_QUESTIONS : FULL_QUESTIONS)]
      : [Q_HAIR_LENGTH];

    if (step < fullQuestions.length - 1) {
      setStep(step + 1);
    } else {
      onComplete(buildProfile(newAnswers, nextIsBald));
    }
  };

  const handleMultiContinue = () => {
    const nextIsBald = answers['hair_length'] === 'bald';
    const fullQuestions: Question[] = [Q_HAIR_LENGTH, ...(nextIsBald ? BALD_QUESTIONS : FULL_QUESTIONS)];
    if (step < fullQuestions.length - 1) {
      setStep(step + 1);
    } else {
      onComplete(buildProfile(answers, nextIsBald));
    }
  };

  const lengthOptions = gender === 'woman'
    ? Q_HAIR_LENGTH.options.filter(o => ['short', 'medium', 'long'].includes(o.value))
    : Q_HAIR_LENGTH.options;

  return (
    <View style={s.screen}>
      <View style={s.topStripe}>
        <ActivityIndicator color={Colors.accent} size="small" />
        <Text style={s.stripeText}>{visionStep}</Text>
      </View>

      <View style={s.dotsRow}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View key={i} style={[s.dot, i === step && s.dotActive, i < step && s.dotDone]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.intro}>
          While we analyse your scan, tell us about your hair so we can personalise your plan.
        </Text>

        <Text style={s.stepLabel}>{step + 1} of {totalSteps}</Text>
        <Text style={s.question}>{current.title}</Text>
        {current.subtitle && <Text style={s.questionSubtitle}>{current.subtitle}</Text>}

        <View style={s.cardList}>
          {(current.key === 'hair_length' ? lengthOptions : current.options).map(opt => {
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
                  <Text style={[s.cardLabel, isSelected && s.cardLabelActive]}>{opt.label}</Text>
                  {opt.description && (
                    <Text style={[s.cardDesc, isSelected && s.cardDescActive]}>{opt.description}</Text>
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
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  topStripe: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border2,
  },
  stripeText: { fontSize: 12, color: Colors.text2, letterSpacing: 0.3 },

  dotsRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
  },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.accent, width: 20, borderRadius: 4 },
  dotDone:   { backgroundColor: (Colors.accent as string) + '60' },

  content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.xxxl },

  intro: {
    fontSize: 13, color: Colors.text2, lineHeight: 19,
    marginBottom: Spacing.lg,
  },

  stepLabel: {
    fontSize: 11, color: Colors.text, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: Spacing.sm,
  },
  question: {
    fontFamily: Typography.serif, fontSize: 24, color: Colors.text,
    lineHeight: 32, marginBottom: Spacing.sm,
  },
  questionSubtitle: {
    fontSize: 14, color: Colors.text2, lineHeight: 20,
    marginBottom: Spacing.md,
  },

  cardList: { gap: Spacing.sm, marginTop: Spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.card, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  cardActive: { backgroundColor: Colors.surface2, borderColor: Colors.accent },
  cardInner:  { flex: 1 },
  cardLabel:  { fontSize: 15, color: Colors.text, fontWeight: '500', marginBottom: 2 },
  cardLabelActive: { color: Colors.accent },
  cardDesc:   { fontSize: 12, color: Colors.text3, lineHeight: 16 },
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
});
