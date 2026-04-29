// IssueCoverScreen — the magazine-cover moment between observation and the
// detailed scan-delta read on rescans. Renders the cover_dek + 3 dek lines
// from recommendations.delta_commentary. Falls back to mechanically derived
// static copy when delta_commentary is absent or generation failed.

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
import type { DeltaCommentaryStored, DeltaDekLine, Recommendations } from '../../types';

// Cardinal helper kept local — lib/gemini/shared isn't a great cross-import target.
function cardinal(n: number): string {
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (n === 3) return 'three';
  if (n === 4) return 'four';
  if (n === 5) return 'five';
  return String(n);
}

// Build a sane fallback when Gemini didn't produce a commentary block.
function fallbackCoverLines(deltaRow: ScanDeltaRow | null): [DeltaDekLine, DeltaDekLine, DeltaDekLine] {
  const improved   = deltaRow?.concerns_improved   ?? [];
  const persistent = deltaRow?.concerns_persistent ?? [];
  const fresh      = deltaRow?.concerns_new        ?? [];

  const lines: DeltaDekLine[] = [];
  if (improved.length > 0) {
    lines.push({
      number: '01',
      headline: 'Quieter notes',
      body:    'Some of what was loud last issue is reading softer now.',
    });
  }
  if (persistent.length > 0) {
    lines.push({
      number: (lines.length + 1).toString().padStart(2, '0') as '01' | '02' | '03',
      headline: 'Still working',
      body:    'A few things are taking their own time. That is the nature of barrier work.',
    });
  }
  if (fresh.length > 0) {
    lines.push({
      number: (lines.length + 1).toString().padStart(2, '0') as '01' | '02' | '03',
      headline: 'A new note',
      body:    'Something new is asking for attention this issue.',
    });
  }
  while (lines.length < 3) {
    lines.push({
      number: (lines.length + 1).toString().padStart(2, '0') as '01' | '02' | '03',
      headline: 'Holding steady',
      body:    'The reading is mostly the same as last issue. Consistency is its own outcome.',
    });
  }
  return lines.slice(0, 3) as [DeltaDekLine, DeltaDekLine, DeltaDekLine];
}

export default function IssueCoverRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scanId?: string }>();
  const scanId = typeof params.scanId === 'string' ? params.scanId : null;

  const [commentary,   setCommentary]   = useState<DeltaCommentaryStored | null>(null);
  const [deltaRow,     setDeltaRow]     = useState<ScanDeltaRow | null>(null);
  const [scanNumber,   setScanNumber]   = useState<number>(2);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

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
            .select('id, user_id, recommendations, created_at')
            .eq('id', scanId)
            .single(),
          fetchScanDeltaByToScanId(scanId),
        ]);

        if (cancelled) return;

        if (scanData?.user_id) {
          const { count } = await supabase
            .from('scans')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', scanData.user_id as string)
            .lte('created_at', scanData.created_at as string);
          setScanNumber(count ?? 2);
        }

        const recs = (scanData?.recommendations as Recommendations | null) ?? null;
        setCommentary(recs?.delta_commentary ?? null);
        setDeltaRow(delta);
      } catch (e) {
        if (cancelled) return;
        setError(errorToMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scanId]);

  const coverDek = commentary?.cover_dek ?? 'What changed, in three observations.';
  const coverLines: [DeltaDekLine, DeltaDekLine, DeltaDekLine] =
    commentary?.cover_lines ?? fallbackCoverLines(deltaRow);

  const weeksLabel = useMemo(() => {
    const days = deltaRow?.days_between ?? 28;
    const weeks = Math.round(days / 7);
    if (weeks <= 0) return 'A few days';
    if (weeks === 1) return 'A week';
    return `${weeks === 4 ? 'Four' : weeks} weeks`;
  }, [deltaRow]);

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
              <ChapterLabel>{`Issue ${cardinal(scanNumber)} \u00B7 comparison`}</ChapterLabel>
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
                  What {weeksLabel.toLowerCase()}
                </Text>
                {'\n'}moved.
              </Display>
            </View>

            {/* Dek */}
            <View style={{ paddingTop: 28, paddingHorizontal: 32 }}>
              <Body serif size={15.5} style={{ fontStyle: 'italic', lineHeight: 24 }}>
                {coverDek}
              </Body>
            </View>

            {/* 3 dek lines */}
            <View style={{ paddingTop: 36, paddingHorizontal: 32 }}>
              {coverLines.map((line, i) => (
                <DekLineRow
                  key={line.number}
                  number={line.number}
                  headline={line.headline}
                  body={line.body}
                  last={i === coverLines.length - 1}
                />
              ))}
            </View>

            <View style={{ paddingTop: 36, paddingHorizontal: 32 }}>
              <PrimaryButton
                label="See the comparison →"
                onPress={() => router.replace({
                  pathname: '/(scan)/scan-delta',
                  params:   { scanId: scanId ?? '' },
                } as never)}
              />
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function DekLineRow({
  number,
  headline,
  body,
  last,
}: {
  number:   string;
  headline: string;
  body:     string;
  last:     boolean;
}) {
  return (
    <View
      style={{
        paddingVertical:   18,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: Palette.rule,
      }}
    >
      <Text
        style={{
          fontFamily:    'Inter_500Medium',
          fontSize:      11,
          letterSpacing: 2.6,
          textTransform: 'uppercase',
          color:         Palette.ink3,
          marginBottom:  6,
        }}
      >
        {number}
      </Text>
      <Text
        style={{
          fontFamily: 'CormorantGaramond_500Medium_Italic',
          fontStyle:  'italic',
          fontSize:   24,
          lineHeight: 28,
          color:      Palette.ink,
          marginBottom: 6,
        }}
      >
        {headline}
      </Text>
      <Body serif size={14.5} style={{ lineHeight: 22 }}>
        {body}
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
