// ObservationScreen — post-scan editorial first reveal.
// Three numbered insights + trait chips, streamed in from Gemini.
// Translated from Complete_ui/src/screens-extra-2.jsx line ~800.

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
import { InsightRow } from '../../components/scan/InsightRow';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import type { Recommendations, ScanObservation } from '../../types';

// Split a title like "A first observation." into first-two-words + rest so we
// can italicise the first fragment and drop the rest on a new line.
// Falls back to rendering the whole string normally if the pattern doesn't match.
function splitTitle(title: string): { italic: string; rest: string } | null {
  const m = title.match(/^(\S+\s+\S+)\s+(.+)$/);
  if (!m) return null;
  return { italic: m[1], rest: m[2] };
}

export default function ObservationRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scanId?: string }>();
  const scanId = typeof params.scanId === 'string' ? params.scanId : null;

  const [observation, setObservation] = useState<ScanObservation | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!scanId) {
        setError('Missing scan id');
        setLoading(false);
        return;
      }
      try {
        const { data, error: dbErr } = await supabase
          .from('scans')
          .select('id, recommendations, scan_type')
          .eq('id', scanId)
          .single();
        if (cancelled) return;
        if (dbErr) throw dbErr;
        const recs = (data as { recommendations: Recommendations | null } | null)?.recommendations;
        if (recs?.observation) {
          setObservation(recs.observation);
        } else {
          setError('Your scan is still being read. Give it a moment.');
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scanId]);

  const titleParts = useMemo(
    () => observation ? splitTitle(observation.title) : null,
    [observation],
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Palette.accent} />
          </View>
        ) : error || !observation ? (
          <FallbackState
            message={error ?? 'Your scan is still being read.'}
            onBack={() => router.back()}
          />
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}
          >
            {/* Back button row */}
            <View style={{ paddingVertical: 8, paddingHorizontal: 28 }}>
              <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            </View>

            {/* Title block */}
            <View style={{ paddingTop: 20, paddingHorizontal: 32 }}>
              <ChapterLabel>{observation.issue_label}</ChapterLabel>
              <Rule length="short" tone="accent" style={{ marginTop: 10 }} />

              <Display
                style={{
                  marginTop:  26,
                  fontSize:   46,
                  lineHeight: 47,
                  letterSpacing: -1.2,
                }}
              >
                {titleParts ? (
                  <>
                    <Text
                      style={{
                        fontFamily: 'CormorantGaramond_500Medium_Italic',
                        fontStyle:  'italic',
                      }}
                    >
                      {titleParts.italic}
                    </Text>
                    {'\n'}{titleParts.rest}
                  </>
                ) : (
                  observation.title
                )}
              </Display>
            </View>

            {/* Dek */}
            <View style={{ paddingTop: 28, paddingHorizontal: 32 }}>
              <Body
                serif
                size={15.5}
                style={{ fontStyle: 'italic', lineHeight: 24 }}
              >
                {observation.dek}
              </Body>
            </View>

            {/* Three numbered insights */}
            <View style={{ paddingTop: 34, paddingHorizontal: 32 }}>
              {observation.insights.map((ins, i) => (
                <InsightRow
                  key={ins.number}
                  number={ins.number}
                  headline={ins.headline}
                  body={ins.body}
                  last={i === observation.insights.length - 1}
                />
              ))}
            </View>

            {/* Quiet trait chips */}
            <View
              style={{
                paddingTop:     34,
                paddingHorizontal: 32,
                flexDirection:  'row',
                flexWrap:       'wrap',
                gap:            8,
              }}
            >
              {observation.trait_chips.map(chip => (
                <View
                  key={chip}
                  style={{
                    paddingVertical:    6,
                    paddingHorizontal:  12,
                    borderRadius:       99,
                    borderWidth:        1,
                    borderColor:        Palette.rule,
                  }}
                >
                  <Text
                    style={{
                      fontFamily:    'Inter_400Regular',
                      fontSize:      11,
                      letterSpacing: 0.2,
                      color:         Palette.ink2,
                    }}
                  >
                    {chip}
                  </Text>
                </View>
              ))}
            </View>

            {/* Read your plan → */}
            <View style={{ paddingTop: 36, paddingHorizontal: 32, paddingBottom: 40 }}>
              <PrimaryButton
                label="Read your plan →"
                onPress={() => router.replace('/recommendations' as never)}
              />
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function FallbackState({ message, onBack }: { message: string; onBack: () => void }) {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingVertical: 8, paddingHorizontal: 28 }}>
        <BackButton onPress={onBack} style={{ marginLeft: -8 }} />
      </View>
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
    </View>
  );
}
