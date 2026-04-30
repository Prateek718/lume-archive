// AdherenceScreen — issue-window adherence with a big % readout, week
// breakdown, and a contextual note.

import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton, Body, ChapterLabel, Display,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import {
  computeAdherenceForCurrentIssue, type AdherenceBreakdown,
} from '../../lib/profileData';

export default function AdherenceScreen() {
  const router = useRouter();
  const [data, setData] = useState<AdherenceBreakdown | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) { if (!cancelled) setData(null); return; }
      const breakdown = await computeAdherenceForCurrentIssue(userId);
      if (!cancelled) setData(breakdown);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  if (!data.has_scan) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <View style={{ flex: 1, padding: 32, paddingTop: 12 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
          <View style={{ marginTop: 30 }}>
            <ChapterLabel>Before the first reading</ChapterLabel>
            <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
              <Text style={{
                fontFamily: 'CormorantGaramond_500Medium_Italic',
                fontStyle:  'italic',
              }}>No reading</Text>
              {'\n'}yet.
            </Display>
          </View>
          <Body serif size={14} style={{ marginTop: 20, lineHeight: 22, fontStyle: 'italic' }}>
            Take a scan to start tracking adherence.
          </Body>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 28, paddingVertical: 8 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <ChapterLabel>{`Issue ${data.current_issue_word} · in progress`}</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>How it&apos;s</Text>
            {'\n'}been going.
          </Display>
        </View>

        {/* Big % readout */}
        <View
          style={{
            paddingTop: 36,
            paddingHorizontal: 32,
            flexDirection: 'row',
            alignItems: 'flex-end',
          }}
        >
          <Text
            style={{
              fontFamily:        'CormorantGaramond_500Medium_Italic',
              fontStyle:         'italic',
              fontSize:          84,
              lineHeight:        80,
              color:             Palette.ink,
            }}
          >
            {data.overall_pct}
            <Text style={{ fontSize: 32, color: Palette.ink3 }}>%</Text>
          </Text>
          <View style={{ paddingBottom: 14, paddingLeft: 18 }}>
            <ChapterLabel style={{ marginBottom: 4 }}>overall</ChapterLabel>
            <Text
              style={{
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle:  'italic',
                fontSize:   15,
                color:      Palette.ink2,
              }}
            >
              {data.descriptor}
            </Text>
          </View>
        </View>

        {/* By week */}
        {data.weekly.length > 0 && (
          <View style={{ paddingTop: 32, paddingHorizontal: 32 }}>
            <ChapterLabel style={{ marginBottom: 18 }}>By week</ChapterLabel>
            {data.weekly.map((w, i) => (
              <View
                key={w.label}
                style={{
                  paddingVertical:   14,
                  borderTopWidth:    1,
                  borderTopColor:    Palette.rule,
                  borderBottomWidth: i === data.weekly.length - 1 ? 1 : 0,
                  borderBottomColor: Palette.rule,
                  flexDirection:     'row',
                  alignItems:        'center',
                  gap:               14,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'CormorantGaramond_400Regular_Italic',
                    fontStyle:  'italic',
                    fontSize:   15,
                    color:      Palette.ink,
                    width:      84,
                  }}
                >
                  {w.label}
                </Text>
                <View style={{ flex: 1, height: 3, backgroundColor: Palette.rule }}>
                  <View
                    style={{
                      width:          `${Math.max(0, Math.min(100, w.pct))}%`,
                      height:         '100%',
                      backgroundColor: Palette.accent,
                    }}
                  />
                </View>
                <Text
                  style={{
                    fontFamily:    'Inter_400Regular',
                    fontSize:      12,
                    color:         Palette.ink,
                    width:         40,
                    textAlign:     'right',
                  }}
                >
                  {w.pct}%
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Note */}
        {data.note && (
          <View style={{ paddingTop: 30, paddingHorizontal: 32 }}>
            <View
              style={{
                backgroundColor:  Palette.bgElev,
                borderLeftWidth:  2,
                borderLeftColor:  Palette.accent,
                paddingVertical:  18,
                paddingHorizontal: 20,
              }}
            >
              <ChapterLabel>A note</ChapterLabel>
              <Text
                style={{
                  fontFamily: 'CormorantGaramond_500Medium_Italic',
                  fontStyle:  'italic',
                  fontSize:   17,
                  lineHeight: 24,
                  color:      Palette.ink,
                  marginTop:  8,
                }}
              >
                {data.note}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
