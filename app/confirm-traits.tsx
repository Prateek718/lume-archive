// Confirm traits screen — surfaced by runScanPhase1 when a trait needs
// explicit user input (first-scan low confidence, or override vs. a locked
// trait). Walks the user through decisions one at a time, then finalizes
// trait persistence and kicks off phase 2.

import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, ActivityIndicator, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { finalizeTraitsAndRunPhase2 } from '../services/scanService';
import type {
  PartialScan,
  PendingTraitDecision,
  UserTrait,
  UserTraits,
  Scan,
} from '../types';
import type { GeminiAnalysis } from '../lib/gemini';

const FACE_SHAPE_DESCRIPTIONS: Record<string, string> = {
  oval:    'Balanced proportions, gentle curves',
  round:   'Soft angles, full cheeks',
  square:  'Strong jaw, defined angles',
  oblong:  'Longer than wide, elegant length',
  heart:   'Wider forehead, tapered chin',
  diamond: 'Defined cheekbones, narrow forehead and jaw',
};

const UNDERTONE_DESCRIPTIONS: Record<string, string> = {
  warm:    'Golden, yellow, peachy base',
  cool:    'Pink, red, bluish base',
  neutral: 'Balanced mix of warm and cool',
};

const TRAIT_LABELS: Record<string, string> = {
  face_shape:     'Face shape',
  skin_undertone: 'Skin undertone',
  hair_texture:   'Hair texture',
};

const TRAIT_LABELS_LOWER: Record<string, string> = {
  face_shape:     'face shape',
  skin_undertone: 'skin undertone',
  hair_texture:   'hair texture',
};

// AsyncStorage key the scan tab polls to pick up a completed scan and
// jump straight into ObservationScreen.
const PENDING_OBSERVATION_KEY = '@lume/pending_observation_scan';

function describeOption(trait: string, value: string): string {
  if (trait === 'face_shape')     return FACE_SHAPE_DESCRIPTIONS[value] ?? '';
  if (trait === 'skin_undertone') return UNDERTONE_DESCRIPTIONS[value]  ?? '';
  return '';
}

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

type Phase1ContextPayload = {
  analysis:        GeminiAnalysis;
  userProfile: {
    city:            string | null;
    preferredBrands: { skin: string[]; hair: string[]; makeup: string[] };
    budget:          string;
    ageRange:        string | null;
  };
  previousContext: string;
  scanType:        string;
  existingTraits:  UserTraits | undefined;
  gender:          string;
};

export default function ConfirmTraitsScreen() {
  const router = useRouter();
  const { partialScanJson, phase1ContextJson } = useLocalSearchParams<{
    partialScanJson:   string;
    phase1ContextJson: string;
  }>();

  const partialScan = useMemo<PartialScan>(
    () => JSON.parse(partialScanJson) as PartialScan,
    [partialScanJson],
  );
  const phase1Context = useMemo<Phase1ContextPayload>(
    () => JSON.parse(phase1ContextJson) as Phase1ContextPayload,
    [phase1ContextJson],
  );

  // Flatten decisions into a single ordered list. Overrides first because
  // they affect locked history — resolving them first matches user mental
  // model of "fix existing" before "lock new".
  const decisions = useMemo<PendingTraitDecision[]>(() => {
    const pending = partialScan._pendingTraitDecisions;
    if (!pending) return [];
    return [...pending.overrides, ...pending.confirmations];
  }, [partialScan]);

  const [index,         setIndex]         = useState(0);
  const [confirmations, setConfirmations] = useState<
    Record<string, { value: string; source: UserTrait['source'] }>
  >({});
  const [finalizing,    setFinalizing]    = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const current = decisions[index];

  const advance = async (
    nextConfirmations: Record<string, { value: string; source: UserTrait['source'] }>,
  ) => {
    if (index + 1 < decisions.length) {
      setConfirmations(nextConfirmations);
      setIndex(index + 1);
      return;
    }

    // Last decision — finalize and run phase 2.
    setConfirmations(nextConfirmations);
    setFinalizing(true);
    setError(null);
    try {
      const completedScan: Scan = await finalizeTraitsAndRunPhase2(
        partialScan.user_id,
        partialScan,
        nextConfirmations,
        {
          analysis:        phase1Context.analysis,
          userProfile:     phase1Context.userProfile,
          previousContext: phase1Context.previousContext,
          scanType:        phase1Context.scanType,
          compressedUri:   '',
          existingTraits:  phase1Context.existingTraits,
          gender:          phase1Context.gender,
        },
      );

      // Hand the completed scan to the scan tab so ObservationScreen can
      // pick up from where the user left off.
      await AsyncStorage.setItem(
        PENDING_OBSERVATION_KEY,
        JSON.stringify(completedScan),
      );
      router.replace('/scan');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[confirm-traits] finalize failed:', msg);
      setError('Could not finish processing. Please try again.');
      setFinalizing(false);
    }
  };

  const pick = (value: string, source: UserTrait['source']) => {
    const next = {
      ...confirmations,
      [current.trait]: { value, source },
    };
    advance(next);
  };

  if (!current) {
    // No decisions — defensive fallback. Route back.
    return (
      <SafeAreaView style={s.fill}>
        <StatusBar style="dark" />
        <View style={s.centered}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (finalizing) {
    return (
      <SafeAreaView style={s.fill}>
        <StatusBar style="dark" />
        <View style={s.centered}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={s.loadingText}>Building your plan…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const traitLabelLower = TRAIT_LABELS_LOWER[current.trait] ?? current.trait;
  const confidencePct   = Math.round(current.confidence * 100);

  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>Help us get this right</Text>
        <Text style={s.subtitle}>
          We&apos;re {confidencePct}% confident about your {traitLabelLower}.
          Which feels more like you?
        </Text>

        <Text style={s.stepIndicator}>
          {decisions.length > 1
            ? `${index + 1} of ${decisions.length}`
            : ' '}
        </Text>

        {/* Primary card */}
        <TouchableOpacity
          style={s.card}
          onPress={() => pick(current.primary, 'user_confirmed')}
          activeOpacity={0.85}
        >
          <Text style={s.cardTitle}>{cap(current.primary)}</Text>
          <Text style={s.cardDescription}>
            {describeOption(current.trait, current.primary)}
          </Text>
        </TouchableOpacity>

        {/* Alternative card */}
        {current.alternative && current.alternative !== current.primary ? (
          <TouchableOpacity
            style={s.card}
            onPress={() => pick(current.alternative, 'user_confirmed')}
            activeOpacity={0.85}
          >
            <Text style={s.cardTitle}>{cap(current.alternative)}</Text>
            <Text style={s.cardDescription}>
              {describeOption(current.trait, current.alternative)}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* "Not sure" fallback — treats as implicit accept */}
        <TouchableOpacity
          style={s.notSure}
          onPress={() => pick(current.primary, 'first_scan_auto')}
          activeOpacity={0.7}
        >
          <Text style={s.notSureText}>
            Not sure — {cap(current.primary)} it is
          </Text>
        </TouchableOpacity>

        {error ? <Text style={s.errorText}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fill: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            Spacing.md,
  },
  loadingText: {
    fontSize: 13,
    color:    Colors.text2,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop:        Spacing.xxl,
    paddingBottom:     Spacing.xxxl,
  },
  title: {
    fontFamily: Typography.serif,
    fontSize:   Typography.size.xxl,
    color:      Colors.text,
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize:   Typography.size.md,
    color:      Colors.text2,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  stepIndicator: {
    fontSize:      Typography.size.xs,
    color:         Colors.text3,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom:  Spacing.md,
    minHeight:     14,
  },
  card: {
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    Radius.card,
    padding:         Spacing.xl,
    marginBottom:    Spacing.md,
  },
  cardTitle: {
    fontFamily: Typography.serif,
    fontSize:   Typography.size.xl,
    color:      Colors.text,
    marginBottom: Spacing.xs,
  },
  cardDescription: {
    fontSize:   Typography.size.base,
    color:      Colors.text2,
    lineHeight: 20,
  },
  notSure: {
    alignItems:      'center',
    paddingVertical: Spacing.md,
    marginTop:       Spacing.sm,
  },
  notSureText: {
    fontSize: Typography.size.base,
    color:    Colors.accent,
  },
  errorText: {
    fontSize:    Typography.size.base,
    color:       Colors.danger,
    marginTop:   Spacing.md,
    textAlign:   'center',
  },
});
