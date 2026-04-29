// RescanFeedbackScreen — collected on the second-or-later scan before the
// camera capture. Two questions: subjective improvement (Likert) and
// adherence blockers (multi-select, optional). Persists into useScan so it
// flows to scanService.computeAndStoreScanDelta via the userFeedback callback.
//
// TODO Phase 7: irritation_flags (per-product irritation chips) — deferred
// from v1; needs the kit_item_id surface to be live first.

import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import {
  BackButton,
  Body,
  ChapterLabel,
  Display,
  OptionRow,
  PrimaryButton,
  Rule,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { useScan } from '../../hooks/useScan';
import type {
  AdherenceBlocker,
  RescanFeedback,
  SubjectiveImprovement,
} from '../../types';

interface ImprovementOption {
  value: SubjectiveImprovement;
  label: string;
}

const IMPROVEMENT_OPTIONS: ImprovementOption[] = [
  { value: 'much_better',     label: 'Much better' },
  { value: 'slightly_better', label: 'A little better' },
  { value: 'same',            label: 'About the same' },
  { value: 'slightly_worse',  label: 'A little worse' },
  { value: 'much_worse',      label: 'Much worse' },
];

interface BlockerOption {
  value: AdherenceBlocker;
  label: string;
}

const BLOCKER_OPTIONS: BlockerOption[] = [
  { value: 'travel',                       label: 'Travel or schedule changes' },
  { value: 'too_busy',                     label: 'Forgot some days' },
  { value: 'product_wrong',                label: "Products didn't feel right" },
  { value: 'ran_out',                      label: 'Ran out of products' },
  { value: 'lost_motivation',              label: 'Felt like a chore' },
  { value: 'more_consistent_than_thought', label: 'Stuck to it more than expected' },
];

export default function RescanFeedbackRoute() {
  const router = useRouter();
  const { setRescanFeedback, reset } = useScan();

  const [improvement, setImprovement] = useState<SubjectiveImprovement | null>(null);
  const [blockers, setBlockers]       = useState<AdherenceBlocker[]>([]);

  const toggleBlocker = (b: AdherenceBlocker) => {
    setBlockers(prev =>
      prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b],
    );
  };

  const onContinue = () => {
    const feedback: RescanFeedback = {
      ...(improvement ? { subjective_improvement: improvement } : {}),
      ...(blockers.length > 0 ? { adherence_blockers: blockers } : {}),
    };
    // Clear stale state from any prior scan in this session so /scan doesn't
    // auto-redirect to the previous observation. reset() also clears
    // pendingRescanFeedbackRef, so the setRescanFeedback call must follow it.
    reset();
    setRescanFeedback(feedback);
    router.push('/scan' as never);
  };

  const canContinue = improvement !== null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingVertical: 8, paddingHorizontal: 28 }}>
            <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
          </View>

          {/* Header */}
          <View style={{ paddingTop: 20, paddingHorizontal: 32 }}>
            <ChapterLabel>Issue two · feedback</ChapterLabel>
            <Rule length="short" tone="accent" style={{ marginTop: 10 }} />
            <Display
              style={{
                marginTop:  26,
                fontSize:   42,
                lineHeight: 44,
                letterSpacing: -1,
              }}
            >
              <Display italic style={{ fontSize: 42, lineHeight: 44 }}>Before</Display>
              {'\n'}we look again.
            </Display>
            <Body serif size={15} style={{ fontStyle: 'italic', marginTop: 18, lineHeight: 24 }}>
              Two short questions. They shape what the next reading is allowed to say.
            </Body>
          </View>

          {/* Q1 — subjective improvement */}
          <View style={{ paddingTop: 38, paddingHorizontal: 32 }}>
            <ChapterLabel>One</ChapterLabel>
            <Display size="small" style={{ marginTop: 10, fontSize: 26, lineHeight: 30 }}>
              How is your skin feeling?
            </Display>
            <Body serif size={14} style={{ fontStyle: 'italic', color: Palette.ink3, marginTop: 6 }}>
              Compared to four weeks ago.
            </Body>

            <View style={{ marginTop: 14 }}>
              {IMPROVEMENT_OPTIONS.map((opt, i) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={improvement === opt.value}
                  onPress={() => setImprovement(opt.value)}
                  last={i === IMPROVEMENT_OPTIONS.length - 1}
                />
              ))}
            </View>
          </View>

          {/* Q2 — adherence blockers */}
          <View style={{ paddingTop: 32, paddingHorizontal: 32 }}>
            <ChapterLabel>Two</ChapterLabel>
            <Display size="small" style={{ marginTop: 10, fontSize: 26, lineHeight: 30 }}>
              What got in the way?
            </Display>
            <Body serif size={14} style={{ fontStyle: 'italic', color: Palette.ink3, marginTop: 6 }}>
              Optional. Pick any that apply.
            </Body>

            <View style={{ marginTop: 14 }}>
              {BLOCKER_OPTIONS.map((opt, i) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={blockers.includes(opt.value)}
                  onPress={() => toggleBlocker(opt.value)}
                  variant="checkbox"
                  last={i === BLOCKER_OPTIONS.length - 1}
                />
              ))}
            </View>
          </View>

          {/* Continue */}
          <View style={{ paddingTop: 36, paddingHorizontal: 32 }}>
            <PrimaryButton
              label="Continue to scan →"
              onPress={onContinue}
              disabled={!canContinue}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
