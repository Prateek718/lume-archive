// Scan delta view — the "aha moment" screen after a rescan.
// Reads a pre-computed row from scan_deltas and lays out:
//  • Score delta hero
//  • Concerns: improved / still working on / new
//  • Adherence card (overall + by category)
//  • Optional streak highlight
//  • Optional user-feedback reflection (when subjective feel ≠ measured delta)
//  • CTA back to the routine tab

import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import {
  fetchScanDeltaByToScanId,
  type ScanDeltaRow,
} from '../services/deltaService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function humanizeConcern(concern: string): string {
  const s = concern.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pctLabel(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n * 100)}%`;
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case 'skin_am': return 'Skin AM';
    case 'skin_pm': return 'Skin PM';
    case 'beard':   return 'Beard';
    case 'hair':    return 'Hair';
    default:        return cat;
  }
}

// Decide whether the subjective feeling diverges from the measured delta
// enough to warrant a reflection line. Threshold: delta >= ±3 and direction mismatch.
function divergenceLine(
  subjective: string | undefined,
  delta: number,
): string | null {
  if (!subjective) return null;
  const feelsBetter = subjective === 'much_better' || subjective === 'slightly_better';
  const feelsWorse  = subjective === 'much_worse'  || subjective === 'slightly_worse';
  const feelsSame   = subjective === 'same';

  if (feelsBetter && delta < -2) {
    return 'You felt things improved — the measurements show a slight dip, but progress is not always linear.';
  }
  if (feelsWorse && delta > 2) {
    return 'Your measurements actually moved up. Days often feel worse than the trend shows.';
  }
  if (feelsSame && delta > 4) {
    return 'Your measurements show improvement even if it did not feel dramatic day-to-day.';
  }
  if (feelsSame && delta < -4) {
    return 'Your measurements drifted down even though things felt steady — worth keeping an eye on.';
  }
  return null;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ScanDeltaScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ to_scan_id?: string }>();
  const toScanId = params.to_scan_id;

  const [delta,   setDelta]   = useState<ScanDeltaRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!toScanId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    (async () => {
      const row = await fetchScanDeltaByToScanId(toScanId);
      if (!row) {
        setNotFound(true);
      } else {
        setDelta(row);
      }
      setLoading(false);
    })();
  }, [toScanId]);

  if (loading) {
    return (
      <View style={[s.screen, s.center]}>
        <StatusBar style="dark" />
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (notFound || !delta) {
    return (
      <View style={[s.screen, s.center]}>
        <StatusBar style="dark" />
        <Text style={s.emptyText}>No progress data available yet.</Text>
        <TouchableOpacity style={s.cta} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={s.ctaText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const overall = delta.score_changes?.overall ?? { from: 0, to: 0, delta: 0 };
  const deltaValue = overall.delta ?? 0;

  // Hero copy
  const heroTitle = delta.days_between === 28
    ? 'Your 4-week update'
    : `Your update after ${delta.days_between} days`;
  const headline =
    deltaValue > 0 ? `Your score improved ${deltaValue} points` :
    deltaValue < 0 ? `Your score changed ${deltaValue} points` :
                     'Your score held steady';

  const headlineColor = deltaValue > 0 ? Colors.green : Colors.text;

  const byCat = delta.adherence_by_category ?? {};
  const catsWithData = (['skin_am', 'skin_pm', 'beard', 'hair'] as const)
    .filter(c => byCat[c] != null);

  const showStreak = (delta.streak_longest ?? 0) > 7;
  const feedbackLine = divergenceLine(delta.user_feedback?.subjective_improvement, deltaValue);

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + Spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backRow}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>‹</Text>
          <Text style={s.backLabel}>Back</Text>
        </TouchableOpacity>

        {/* Hero */}
        <Text style={s.heroLabel}>PROGRESS UPDATE</Text>
        <Text style={s.heroTitle}>{heroTitle}</Text>
        <Text style={[s.heroHeadline, { color: headlineColor }]}>{headline}</Text>
        <Text style={s.heroSub}>From {overall.from} to {overall.to}</Text>

        {/* Concerns */}
        {delta.concerns_improved.length > 0 && (
          <View style={s.concernCard}>
            <Text style={s.cardLabel}>WHAT IMPROVED</Text>
            {delta.concerns_improved.map(c => (
              <Text key={c} style={s.concernItem}>{humanizeConcern(c)}</Text>
            ))}
          </View>
        )}

        {delta.concerns_persistent.length > 0 && (
          <View style={s.concernCard}>
            <Text style={s.cardLabel}>STILL WORKING ON</Text>
            {delta.concerns_persistent.map(c => (
              <Text key={c} style={s.concernItem}>{humanizeConcern(c)}</Text>
            ))}
          </View>
        )}

        {delta.concerns_new.length > 0 && (
          <View style={s.concernCard}>
            <Text style={s.cardLabel}>NEW SINCE LAST SCAN</Text>
            {delta.concerns_new.map(c => (
              <Text key={c} style={s.concernItem}>{humanizeConcern(c)}</Text>
            ))}
          </View>
        )}

        {/* Adherence */}
        <View style={s.adherenceCard}>
          <Text style={s.cardLabel}>YOUR ADHERENCE</Text>
          <Text style={s.adherenceBig}>{pctLabel(delta.adherence_overall)}</Text>
          <Text style={s.adherenceSub}>
            Over the {delta.days_between === 28 ? '4 weeks' : `${delta.days_between} days`}
          </Text>
          {catsWithData.length > 0 && (
            <View style={s.catRow}>
              {catsWithData.map((c, i) => (
                <Text key={c} style={s.catItem}>
                  {categoryLabel(c)}: {pctLabel(byCat[c] ?? null)}
                  {i < catsWithData.length - 1 ? '  ·  ' : ''}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* Streak */}
        {showStreak && (
          <View style={s.streakCard}>
            <Text style={s.cardLabel}>LONGEST STREAK</Text>
            <Text style={s.streakValue}>{delta.streak_longest} days</Text>
          </View>
        )}

        {/* Feedback reflection */}
        {feedbackLine && (
          <View style={s.feedbackCard}>
            <Text style={s.feedbackText}>{feedbackLine}</Text>
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={s.cta}
          onPress={() => router.replace('/(tabs)/routine')}
          activeOpacity={0.85}
        >
          <Text style={s.ctaText}>See your updated routine</Text>
        </TouchableOpacity>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    alignItems:     'center',
    justifyContent: 'center',
    padding:        Spacing.xl,
  },
  emptyText: {
    fontSize:     13,
    color:        Colors.text2,
    marginBottom: Spacing.lg,
    textAlign:    'center',
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom:     Spacing.xxxl,
  },
  backRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  Spacing.md,
  },
  backArrow: {
    fontSize:   32,
    color:      Colors.text,
    lineHeight: 32,
    marginRight: 4,
  },
  backLabel: {
    fontSize: 14,
    color:    Colors.text,
  },

  heroLabel: {
    fontSize:      9,
    color:         Colors.accent,
    letterSpacing: 1.5,
    marginBottom:  Spacing.xs,
    marginTop:     Spacing.sm,
  },
  heroTitle: {
    fontFamily:   Typography.serif,
    fontSize:     22,
    color:        Colors.text,
    marginBottom: Spacing.lg,
  },
  heroHeadline: {
    fontFamily:   Typography.serif,
    fontSize:     32,
    lineHeight:   38,
    marginBottom: 6,
  },
  heroSub: {
    fontSize:     13,
    color:        Colors.text2,
    marginBottom: Spacing.xl,
  },

  concernCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  cardLabel: {
    fontSize:      9,
    color:         Colors.accent,
    letterSpacing: 1.5,
    marginBottom:  Spacing.sm,
  },
  concernItem: {
    fontSize:     15,
    color:        Colors.text,
    marginBottom: 4,
  },

  adherenceCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  adherenceBig: {
    fontFamily:   Typography.serif,
    fontSize:     40,
    color:        Colors.text,
    lineHeight:   46,
    marginBottom: 2,
  },
  adherenceSub: {
    fontSize:     12,
    color:        Colors.text2,
    marginBottom: Spacing.sm,
  },
  catRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
  },
  catItem: {
    fontSize: 12,
    color:    Colors.text2,
  },

  streakCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  streakValue: {
    fontFamily: Typography.serif,
    fontSize:   22,
    color:      Colors.text,
  },

  feedbackCard: {
    backgroundColor: Colors.accentTintLight,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.accentTintBorder,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  feedbackText: {
    fontSize:   13,
    color:      Colors.text,
    lineHeight: 20,
  },

  cta: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.input,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginTop:       Spacing.md,
  },
  ctaText: {
    fontSize:   15,
    fontWeight: '600',
    color:      Colors.textOnAccent,
  },
});
