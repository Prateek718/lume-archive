// ScanDeltaScreen — the centerpiece comparison read on rescans. Per-concern
// rows showing categorical state badges (Managed / Improved / Still working /
// New / Slipped) with no numeric scores. Pulls editorial copy from
// recommendations.delta_commentary; falls back to mechanically derived copy
// when commentary is null.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  BackButton,
  Body,
  ChapterLabel,
  Display,
  PrimaryButton,
  Rule,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { errorToMessage } from '../../lib/errors';
import { fetchScanDeltaByToScanId, type ScanDeltaRow } from '../../services/deltaService';
import type {
  DeltaCommentaryStored,
  Recommendations,
  Scan,
  SkinConcernObservation,
  SkinConcernSeverity,
} from '../../types';

// ─── Severity helpers ────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<SkinConcernSeverity, number> = {
  mild:        1,
  moderate:    2,
  significant: 3,
};

function severityLabel(s: SkinConcernSeverity): string {
  return s;
}

// ─── State derivation ────────────────────────────────────────────────────────
// One of five categorical states per concern, per the Phase 6 spec.
type ConcernState = 'managed' | 'improved' | 'still_working' | 'new' | 'slipped';

interface ConcernRow {
  concern:       string;
  display_label: string;
  state:         ConcernState;
  prev_severity: SkinConcernSeverity | null;
  curr_severity: SkinConcernSeverity | null;
}

function humanise(concern: string): string {
  return concern
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function buildConcernRows(
  prev: SkinConcernObservation[],
  curr: SkinConcernObservation[],
): ConcernRow[] {
  const prevMap = new Map(prev.map(o => [o.concern, o]));
  const currMap = new Map(curr.map(o => [o.concern, o]));
  const all     = new Set<string>([...prevMap.keys(), ...currMap.keys()]);

  const rows: ConcernRow[] = [];
  for (const concern of all) {
    const p = prevMap.get(concern) ?? null;
    const c = currMap.get(concern) ?? null;

    const prevSev = p?.severity ?? null;
    const currSev = c?.severity ?? null;
    const display_label = c?.display_label ?? p?.display_label ?? humanise(concern);

    let state: ConcernState;
    if (p && !c) {
      state = 'managed';
    } else if (!p && c) {
      state = 'new';
    } else if (p && c) {
      const pr = SEVERITY_RANK[p.severity];
      const cr = SEVERITY_RANK[c.severity];
      if      (cr < pr) state = 'improved';
      else if (cr > pr) state = 'slipped';
      else              state = 'still_working';
    } else {
      continue;
    }

    rows.push({ concern, display_label, state, prev_severity: prevSev, curr_severity: currSev });
  }

  // Order: managed, improved, still_working, slipped, new — positive-first.
  const order: Record<ConcernState, number> = {
    managed:       0,
    improved:      1,
    still_working: 2,
    slipped:       3,
    new:           4,
  };
  rows.sort((a, b) => order[a.state] - order[b.state]);
  return rows;
}

// ─── Mechanical fallback copy ────────────────────────────────────────────────

function fallbackNoteFor(row: ConcernRow): string {
  switch (row.state) {
    case 'managed':
      return 'No longer reading on the surface. Hold the routine.';
    case 'improved':
      return 'Reading softer than last issue. The work is doing its work.';
    case 'still_working':
      return 'Holding at the same depth. Barrier work runs on its own clock.';
    case 'slipped':
      return 'A little louder this issue. Worth observing, not worth alarm.';
    case 'new':
      return 'A new note this issue. Worth watching.';
  }
}

function fallbackClosingLine(rows: ConcernRow[]): string {
  if (rows.length === 0) {
    return 'The reading speaks for itself.';
  }
  const moved = rows.some(r => r.state !== 'still_working');
  return moved
    ? 'Some things settled. Some are still asking. The work continues.'
    : 'The reading is mostly the same as last issue. Consistency is its own outcome.';
}

// ─── Badge style ─────────────────────────────────────────────────────────────

function stateBadgeStyle(state: ConcernState): { bg: string; ink: string; label: string } {
  switch (state) {
    case 'managed':
      return { bg: Palette.improvedSoft, ink: Palette.improved, label: 'Managed' };
    case 'improved':
      return { bg: Palette.accentSoft, ink: Palette.accent, label: 'Improved' };
    case 'still_working':
      return { bg: Palette.bgDeep, ink: Palette.ink2, label: 'Still working' };
    case 'new':
      return { bg: Palette.bgElev, ink: Palette.ink2, label: 'New' };
    case 'slipped':
      return { bg: Palette.bgDeep, ink: Palette.ink3, label: 'Slipped' };
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export default function ScanDeltaRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scanId?: string }>();
  const scanId = typeof params.scanId === 'string' ? params.scanId : null;

  const [commentary,  setCommentary]  = useState<DeltaCommentaryStored | null>(null);
  const [deltaRow,    setDeltaRow]    = useState<ScanDeltaRow | null>(null);
  const [currentScan, setCurrentScan] = useState<Pick<Scan, 'id' | 'skin_concerns_detailed'> | null>(null);
  const [previousScan, setPreviousScan] = useState<Pick<Scan, 'id' | 'skin_concerns_detailed'> | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!scanId) {
        setError('Missing scan id');
        setLoading(false);
        return;
      }
      try {
        const [{ data: scanData }, delta] = await Promise.all([
          supabase
            .from('scans')
            .select('id, user_id, skin_concerns_detailed, recommendations, created_at')
            .eq('id', scanId)
            .single(),
          fetchScanDeltaByToScanId(scanId),
        ]);

        if (cancelled) return;

        const recs = (scanData?.recommendations as Recommendations | null) ?? null;
        setCommentary(recs?.delta_commentary ?? null);
        setDeltaRow(delta);
        setCurrentScan(
          scanData
            ? {
                id: scanData.id as string,
                skin_concerns_detailed:
                  (scanData.skin_concerns_detailed as SkinConcernObservation[] | null) ?? [],
              }
            : null,
        );

        if (delta?.from_scan_id) {
          const { data: prevData } = await supabase
            .from('scans')
            .select('id, skin_concerns_detailed')
            .eq('id', delta.from_scan_id)
            .single();
          if (cancelled) return;
          if (prevData) {
            setPreviousScan({
              id: prevData.id as string,
              skin_concerns_detailed:
                (prevData.skin_concerns_detailed as SkinConcernObservation[] | null) ?? [],
            });
          }
        }
      } catch (e) {
        if (cancelled) return;
        setError(errorToMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scanId]);

  const concernRows = useMemo(() => {
    const prev = previousScan?.skin_concerns_detailed ?? [];
    const curr = currentScan?.skin_concerns_detailed  ?? [];
    return buildConcernRows(prev, curr);
  }, [previousScan, currentScan]);

  const closingLine = commentary?.closing_line ?? fallbackClosingLine(concernRows);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Palette.accent} />
          </View>
        ) : error ? (
          <FallbackState message={error} />
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}
          >
            <View style={{ paddingVertical: 8, paddingHorizontal: 28 }}>
              <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            </View>

            {/* Title block */}
            <View style={{ paddingTop: 20, paddingHorizontal: 32 }}>
              <ChapterLabel>The comparison</ChapterLabel>
              <Rule length="short" tone="accent" style={{ marginTop: 10 }} />

              <Display
                style={{
                  marginTop:  26,
                  fontSize:   46,
                  lineHeight: 47,
                  letterSpacing: -1.2,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'CormorantGaramond_500Medium_Italic',
                    fontStyle:  'italic',
                  }}
                >
                  What
                </Text>
                {' moved,'}
                {'\n'}line by line.
              </Display>
            </View>

            {/* Concern rows */}
            {concernRows.length === 0 ? (
              <View style={{ paddingTop: 36, paddingHorizontal: 32 }}>
                <Body serif size={15.5} style={{ fontStyle: 'italic', lineHeight: 24 }}>
                  Skin held steady. Sometimes that&apos;s the work.
                </Body>
              </View>
            ) : (
              <View style={{ paddingTop: 36, paddingHorizontal: 32 }}>
                {concernRows.map((row, i) => (
                  <ConcernRowView
                    key={row.concern}
                    index={i}
                    row={row}
                    note={commentary?.concern_notes?.[row.concern] ?? fallbackNoteFor(row)}
                    last={i === concernRows.length - 1}
                  />
                ))}
              </View>
            )}

            {/* Closing line */}
            <View style={{ paddingTop: 36, paddingHorizontal: 32 }}>
              <Rule length="short" tone="accent" />
              <View style={{ height: 16 }} />
              <Body serif size={15.5} style={{ fontStyle: 'italic', lineHeight: 24 }}>
                {closingLine}
              </Body>
            </View>

            {/* CTA */}
            <View style={{ paddingTop: 36, paddingHorizontal: 32 }}>
              <PrimaryButton
                label="See the new plan →"
                onPress={() => router.replace('/recommendations' as never)}
              />
            </View>

            {/* Adherence footnote — calm, optional */}
            {deltaRow?.adherence_overall != null && (
              <View style={{ paddingTop: 24, paddingHorizontal: 32 }}>
                <Text
                  style={{
                    fontFamily:    'Inter_400Regular',
                    fontSize:      11,
                    letterSpacing: 0.2,
                    color:         Palette.ink3,
                  }}
                >
                  {`Routine ran on ${Math.round(deltaRow.adherence_overall * 100)}% of days this issue.`}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

// ─── Concern row ────────────────────────────────────────────────────────────

function ConcernRowView({
  index,
  row,
  note,
  last,
}: {
  index: number;
  row:   ConcernRow;
  note:  string;
  last:  boolean;
}) {
  const badge = stateBadgeStyle(row.state);
  const number = String(index + 1).padStart(2, '0');

  // Severity transition shown only when both severities are known and different.
  const showTransition =
    row.prev_severity != null &&
    row.curr_severity != null &&
    row.prev_severity !== row.curr_severity;

  return (
    <View
      style={{
        paddingVertical:   18,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: Palette.rule,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems:    'center',
          justifyContent:'space-between',
          marginBottom:  6,
        }}
      >
        <Text
          style={{
            fontFamily:    'Inter_500Medium',
            fontSize:      11,
            letterSpacing: 2.6,
            textTransform: 'uppercase',
            color:         Palette.ink3,
          }}
        >
          {number}
        </Text>
        <View
          style={{
            paddingVertical:   4,
            paddingHorizontal: 10,
            borderRadius:      99,
            backgroundColor:   badge.bg,
          }}
        >
          <Text
            style={{
              fontFamily:    'Inter_500Medium',
              fontSize:      10,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              color:         badge.ink,
            }}
          >
            {badge.label}
          </Text>
        </View>
      </View>

      <Text
        style={{
          fontFamily:   'CormorantGaramond_500Medium_Italic',
          fontStyle:    'italic',
          fontSize:     24,
          lineHeight:   28,
          color:        Palette.ink,
          marginBottom: 6,
        }}
      >
        {row.display_label}
      </Text>

      {showTransition && (
        <Text
          style={{
            fontFamily:    'Inter_400Regular',
            fontSize:      11,
            letterSpacing: 0.4,
            color:         Palette.ink3,
            marginBottom:  6,
          }}
        >
          {`${severityLabel(row.prev_severity as SkinConcernSeverity)} → ${severityLabel(row.curr_severity as SkinConcernSeverity)}`}
        </Text>
      )}

      <Body serif size={14.5} style={{ lineHeight: 22 }}>
        {note}
      </Body>
    </View>
  );
}

function FallbackState({ message }: { message: string }) {
  const router = useRouter();
  return (
    <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: 'center' }}>
      <ChapterLabel>A moment</ChapterLabel>
      <View style={{ height: 14 }} />
      <Display size="small">
        <Display size="small" italic>Not quite</Display>
        {'\n'}ready yet.
      </Display>
      <View style={{ height: 16 }} />
      <Body serif size={14} style={{ fontStyle: 'italic' }}>
        {message}
      </Body>
      <View style={{ height: 30 }} />
      <PrimaryButton
        label="Back to Routine"
        onPress={() => router.replace('/(tabs)/routine')}
      />
    </View>
  );
}
