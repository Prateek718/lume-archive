// DeadTimeQuestionCard — asks the user a one-tap question while Gemini
// generates recommendations in the background. Currently used on the
// observation screen to collect beard_goal before phase 2 finalises beard
// recs. The card hides itself once the user has answered (or if the question
// is not applicable — e.g. women, men without beards, or users who already
// answered on a prior scan).

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import type { BeardGoal } from '../types';

interface Option {
  value: BeardGoal;
  title: string;
  blurb: string;
}

const OPTIONS: Option[] = [
  { value: 'clean_simple',       title: 'Clean & simple',        blurb: 'Just keep it tidy — minimum effort' },
  { value: 'healthy_groomed',    title: 'Healthy & groomed',     blurb: 'Soft, conditioned, no patchy feel' },
  { value: 'growing_thickening', title: 'Grow it in',            blurb: 'Fill in patches, add density' },
  { value: 'styled',             title: 'Fully styled',          blurb: 'Shaped, held, defined lines' },
];

interface Props {
  userId:      string;
  // Only render the card when the user has a beard to care for.
  beardDensity: string | null | undefined;
  gender:       string;
  onAnswered?:  (goal: BeardGoal) => void;
}

export function DeadTimeQuestionCard({ userId, beardDensity, gender, onAnswered }: Props) {
  const [visible, setVisible]   = useState(false);
  const [saving, setSaving]     = useState<BeardGoal | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Only men with a detected beard get the question.
    if (gender !== 'man' && gender !== 'other') return;
    if (!beardDensity || beardDensity === 'none') return;
    if (!userId) return;

    (async () => {
      const { data } = await supabase
        .from('users')
        .select('beard_goal')
        .eq('id', userId)
        .single();
      if (cancelled) return;
      const row = data as { beard_goal?: BeardGoal | null } | null;
      if (!row?.beard_goal) setVisible(true);
    })();

    return () => { cancelled = true; };
  }, [userId, beardDensity, gender]);

  const handlePick = async (goal: BeardGoal) => {
    if (saving) return;
    setSaving(goal);
    const { error } = await supabase
      .from('users')
      .update({ beard_goal: goal })
      .eq('id', userId);
    setSaving(null);
    if (error) {
      console.warn('[DeadTimeQuestionCard] failed to save beard_goal:', error.message);
      return;
    }
    setVisible(false);
    onAnswered?.(goal);
  };

  if (!visible) return null;

  return (
    <View style={s.card}>
      <Text style={s.label}>ONE QUICK QUESTION</Text>
      <Text style={s.title}>What&apos;s your beard goal?</Text>
      <Text style={s.subtitle}>Tap one — it tailors your beard prescription.</Text>

      <View style={s.options}>
        {OPTIONS.map(opt => {
          const isSaving = saving === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[s.option, isSaving && s.optionSaving]}
              onPress={() => handlePick(opt.value)}
              activeOpacity={0.85}
              disabled={saving !== null}
            >
              <View style={s.optionText}>
                <Text style={s.optionTitle}>{opt.title}</Text>
                <Text style={s.optionBlurb}>{opt.blurb}</Text>
              </View>
              {isSaving && <ActivityIndicator color={Colors.accent} size="small" />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.accentTintBorderStrong,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  label: {
    fontSize:      9,
    color:         Colors.accent,
    letterSpacing: 1.5,
    marginBottom:  Spacing.xs,
  },
  title: {
    fontFamily:   Typography.serif,
    fontSize:     18,
    color:        Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize:     12,
    color:        Colors.text2,
    marginBottom: Spacing.md,
  },
  options: {
    gap: 8,
  },
  option: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: Colors.background,
    borderRadius:    Radius.input,
    borderWidth:     1,
    borderColor:     Colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optionSaving: {
    borderColor: Colors.accent,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize:   14,
    color:      Colors.text,
    fontWeight: '500',
  },
  optionBlurb: {
    fontSize: 11,
    color:    Colors.text2,
    marginTop: 2,
  },
});
