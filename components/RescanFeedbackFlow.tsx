// RescanFeedbackFlow — shown on the observation screen during phase 2 for
// rescans (2nd+ scan). Collects up to three short answers while Gemini is
// still generating recommendations. Answers are passed back via onComplete
// and persisted on the scan_delta row at delta-computation time.
//
// Each question is skippable. The whole flow is optional — if the user
// ignores the card, delta computation still runs with empty feedback.

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SubjectiveImprovement =
  | 'much_better'
  | 'slightly_better'
  | 'same'
  | 'slightly_worse'
  | 'much_worse';

export type AdherenceBlocker =
  | 'travel'
  | 'ran_out'
  | 'too_busy'
  | 'product_wrong'
  | 'lost_motivation'
  | 'more_consistent_than_thought';

export interface RescanFeedback {
  subjective_improvement?: SubjectiveImprovement;
  adherence_blockers?:     AdherenceBlocker[];
  irritation_flags?:       string[]; // kit_item_ids
}

interface Props {
  userId:              string;
  primaryConcern:      string | null;         // from previous scan's first skin concern
  adherencePct:        number | null;         // 30-day adherence 0-100, null if unknown
  onComplete:          (feedback: RescanFeedback) => void;
  onDismiss?:          () => void;
}

// ─── Option data ─────────────────────────────────────────────────────────────

const IMPROVEMENT_OPTIONS: { value: SubjectiveImprovement; label: string }[] = [
  { value: 'much_better',     label: 'Much better' },
  { value: 'slightly_better', label: 'Slightly better' },
  { value: 'same',            label: 'About the same' },
  { value: 'slightly_worse',  label: 'Slightly worse' },
  { value: 'much_worse',      label: 'Much worse' },
];

const BLOCKER_OPTIONS: { value: AdherenceBlocker; label: string }[] = [
  { value: 'travel',                      label: 'Travel or schedule disruption' },
  { value: 'ran_out',                     label: 'Ran out of a product' },
  { value: 'too_busy',                    label: 'Too busy / forgot' },
  { value: 'product_wrong',               label: "Product didn't feel right" },
  { value: 'lost_motivation',             label: 'Nothing specific — just lost motivation' },
  { value: 'more_consistent_than_thought', label: 'Actually, I was more consistent than I thought' },
];

function humanizeConcern(concern: string): string {
  const s = concern.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Kit item type for irritation question ───────────────────────────────────

interface KitChipItem {
  kit_item_id: string;
  label:       string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RescanFeedbackFlow({
  userId,
  primaryConcern,
  adherencePct,
  onComplete,
  onDismiss,
}: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [feedback, setFeedback]   = useState<RescanFeedback>({});
  const [kitItems, setKitItems]   = useState<KitChipItem[] | null>(null);
  const [kitLoading, setKitLoading] = useState(true);
  const [selectedBlockers, setSelectedBlockers]   = useState<Set<AdherenceBlocker>>(new Set());
  const [selectedIrritations, setSelectedIrritations] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);

  // Load active kit items for the irritation question.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('user_kit')
          .select('id, product_id, step_id')
          .eq('user_id', userId)
          .eq('is_active', true);
        if (cancelled) return;
        const rows = (data ?? []) as Array<{ id: string; product_id: string; step_id: string | null }>;
        setKitItems(rows.map(r => ({
          kit_item_id: r.id,
          // product_id is stable; use step_id or product_id for a readable chip label.
          label: prettifyProductId(r.product_id, r.step_id),
        })));
      } catch {
        if (!cancelled) setKitItems([]);
      } finally {
        if (!cancelled) setKitLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Question applicability gates.
  const includeQ1 = !!primaryConcern;
  const includeQ2 = adherencePct !== null && adherencePct < 70;
  const includeQ3 = (kitItems?.length ?? 0) > 0;

  const stepList: ('q1' | 'q2' | 'q3')[] = [
    ...(includeQ1 ? ['q1' as const] : []),
    ...(includeQ2 ? ['q2' as const] : []),
    ...(includeQ3 ? ['q3' as const] : []),
  ];

  // If no questions are applicable and loading is finished, close silently.
  useEffect(() => {
    if (kitLoading) return;
    if (stepList.length === 0 && !done) {
      setDone(true);
      onComplete({});
    }
  }, [kitLoading, stepList.length, done, onComplete]);

  if (done) return null;
  if (kitLoading) return null;
  if (stepList.length === 0) return null;

  const currentStep = stepList[stepIndex];
  const isLast      = stepIndex === stepList.length - 1;

  const advance = (patch: Partial<RescanFeedback>) => {
    const next = { ...feedback, ...patch };
    setFeedback(next);
    if (isLast) {
      setDone(true);
      onComplete(next);
    } else {
      setStepIndex(i => i + 1);
    }
  };

  const skipCurrent = () => {
    if (isLast) {
      setDone(true);
      onComplete(feedback);
    } else {
      setStepIndex(i => i + 1);
    }
  };

  const dismissAll = () => {
    setDone(true);
    onDismiss?.();
    onComplete(feedback);
  };

  // ── Render active question ────────────────────────────────────────────────
  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.label}>QUICK CHECK-IN · {stepIndex + 1} of {stepList.length}</Text>
        <TouchableOpacity onPress={dismissAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.closeX}>×</Text>
        </TouchableOpacity>
      </View>

      {currentStep === 'q1' && primaryConcern && (
        <Q1Improvement
          concern={primaryConcern}
          onPick={(v) => advance({ subjective_improvement: v })}
          onSkip={skipCurrent}
        />
      )}

      {currentStep === 'q2' && (
        <Q2Blockers
          selected={selectedBlockers}
          onToggle={(v) => setSelectedBlockers(prev => {
            const next = new Set(prev);
            if (next.has(v)) next.delete(v); else next.add(v);
            return next;
          })}
          onNext={() => advance({ adherence_blockers: Array.from(selectedBlockers) })}
          onSkip={skipCurrent}
        />
      )}

      {currentStep === 'q3' && kitItems && (
        <Q3Irritation
          items={kitItems}
          selected={selectedIrritations}
          onToggle={(kitItemId) => setSelectedIrritations(prev => {
            const next = new Set(prev);
            if (next.has(kitItemId)) next.delete(kitItemId); else next.add(kitItemId);
            return next;
          })}
          onNext={() => advance({ irritation_flags: Array.from(selectedIrritations) })}
          onSkip={skipCurrent}
        />
      )}
    </View>
  );
}

// ─── Question 1 — subjective improvement ─────────────────────────────────────

function Q1Improvement({
  concern, onPick, onSkip,
}: {
  concern: string;
  onPick:  (v: SubjectiveImprovement) => void;
  onSkip:  () => void;
}) {
  const [saving, setSaving] = useState<SubjectiveImprovement | null>(null);
  return (
    <View>
      <Text style={s.title}>
        Since your last scan, how has your {humanizeConcern(concern).toLowerCase()} changed?
      </Text>
      <View style={s.options}>
        {IMPROVEMENT_OPTIONS.map(opt => {
          const isSaving = saving === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[s.option, isSaving && s.optionSaving]}
              onPress={() => { setSaving(opt.value); onPick(opt.value); }}
              activeOpacity={0.85}
              disabled={saving !== null}
            >
              <Text style={s.optionTitle}>{opt.label}</Text>
              {isSaving && <ActivityIndicator color={Colors.accent} size="small" />}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity onPress={onSkip} style={s.skipRow} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Text style={s.skipText}>Skip</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Question 2 — adherence blockers ─────────────────────────────────────────

function Q2Blockers({
  selected, onToggle, onNext, onSkip,
}: {
  selected: Set<AdherenceBlocker>;
  onToggle: (v: AdherenceBlocker) => void;
  onNext:   () => void;
  onSkip:   () => void;
}) {
  return (
    <View>
      <Text style={s.title}>What made sticking to your routine hard?</Text>
      <Text style={s.subtitle}>Pick any that apply.</Text>
      <View style={s.options}>
        {BLOCKER_OPTIONS.map(opt => {
          const isSelected = selected.has(opt.value);
          return (
            <TouchableOpacity
              key={opt.value}
              style={[s.option, isSelected && s.optionSelected]}
              onPress={() => onToggle(opt.value)}
              activeOpacity={0.85}
            >
              <Text style={[s.optionTitle, isSelected && s.optionTitleSelected]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={s.footerRow}>
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNext} style={s.nextBtn} activeOpacity={0.85}>
          <Text style={s.nextBtnText}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Question 3 — irritation flags ───────────────────────────────────────────

function Q3Irritation({
  items, selected, onToggle, onNext, onSkip,
}: {
  items:    KitChipItem[];
  selected: Set<string>;
  onToggle: (kitItemId: string) => void;
  onNext:   () => void;
  onSkip:   () => void;
}) {
  return (
    <View>
      <Text style={s.title}>Any products that didn&apos;t feel right?</Text>
      <Text style={s.subtitle}>Tap any that felt irritating or wrong.</Text>
      <View style={s.chipRow}>
        {items.map(item => {
          const isSelected = selected.has(item.kit_item_id);
          return (
            <TouchableOpacity
              key={item.kit_item_id}
              style={[s.chip, isSelected && s.chipSelected]}
              onPress={() => onToggle(item.kit_item_id)}
              activeOpacity={0.85}
            >
              <Text style={[s.chipText, isSelected && s.chipTextSelected]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={s.footerRow}>
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onNext} style={s.nextBtn} activeOpacity={0.85}>
          <Text style={s.nextBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Label helpers ───────────────────────────────────────────────────────────

function prettifyProductId(productId: string, stepId: string | null): string {
  if (stepId) {
    const short = stepId.replace(/^(skin_|beard_|hair_|makeup_)/, '').replace(/_/g, ' ');
    return short.charAt(0).toUpperCase() + short.slice(1);
  }
  const short = productId.replace(/_/g, ' ');
  return short.charAt(0).toUpperCase() + short.slice(1);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.accentTintBorderStrong,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  headerRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   Spacing.xs,
  },
  label: {
    fontSize:      9,
    color:         Colors.accent,
    letterSpacing: 1.5,
  },
  closeX: {
    fontSize: 22,
    color:    Colors.text2,
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  title: {
    fontFamily:   Typography.serif,
    fontSize:     17,
    color:        Colors.text,
    marginBottom: 6,
    lineHeight:   22,
  },
  subtitle: {
    fontSize:     12,
    color:        Colors.text2,
    marginBottom: Spacing.sm,
  },
  options: {
    gap: 8,
  },
  option: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    backgroundColor:   Colors.background,
    borderRadius:      Radius.input,
    borderWidth:       1,
    borderColor:       Colors.border,
    paddingVertical:   10,
    paddingHorizontal: 12,
  },
  optionSaving: {
    borderColor: Colors.accent,
  },
  optionSelected: {
    borderColor:     Colors.accent,
    backgroundColor: Colors.accentTintLight,
  },
  optionTitle: {
    fontSize:   14,
    color:      Colors.text,
    fontWeight: '500',
    flex:       1,
  },
  optionTitleSelected: {
    color: Colors.accent,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  chip: {
    borderRadius:      Radius.pill,
    borderWidth:       1,
    borderColor:       Colors.border,
    backgroundColor:   Colors.background,
    paddingHorizontal: 12,
    paddingVertical:   6,
  },
  chipSelected: {
    borderColor:     Colors.accent,
    backgroundColor: Colors.accentTintMedium,
  },
  chipText: {
    fontSize: 12,
    color:    Colors.text,
  },
  chipTextSelected: {
    color:      Colors.accent,
    fontWeight: '600',
  },
  skipRow: {
    alignItems:     'center',
    paddingVertical: Spacing.sm,
    marginTop:       Spacing.xs,
  },
  skipText: {
    fontSize: 12,
    color:    Colors.text2,
  },
  footerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      Spacing.md,
  },
  nextBtn: {
    backgroundColor:   Colors.accent,
    borderRadius:      Radius.input,
    paddingVertical:   8,
    paddingHorizontal: 20,
  },
  nextBtnText: {
    fontSize:   13,
    color:      Colors.textOnAccent,
    fontWeight: '600',
  },
});
