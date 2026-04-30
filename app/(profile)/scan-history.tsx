// ScanHistoryScreen — chronological list of past scans, newest first.
// Each row shows the issue label + date, the score, and a delta-vs-prior note.
// Tap routes to /recommendations?scanId=… in historical mode.

import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton, Body, ChapterLabel, Display, PrimaryButton, TextLink,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import {
  fetchScanHistory, type ScanHistoryRow,
} from '../../lib/profileData';

export default function ScanHistoryScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<ScanHistoryRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) { if (!cancelled) setRows([]); return; }
      const list = await fetchScanHistory(userId);
      if (!cancelled) setRows(list);
    })();
    return () => { cancelled = true; };
  }, []);

  if (rows === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  if (rows.length === 0) return <EmptyState onBack={() => router.back()} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 28, paddingVertical: 8 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <ChapterLabel>The readings, in order</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>Your</Text>
            {'\n'}history.
          </Display>
        </View>

        <View style={{ paddingTop: 32, paddingHorizontal: 32 }}>
          {rows.map((r, i) => (
            <ScanRow
              key={r.id}
              row={r}
              first={i === 0}
              last={i === rows.length - 1}
              onPress={() => router.push(`/recommendations?scanId=${encodeURIComponent(r.id)}`)}
            />
          ))}
        </View>

        <View style={{ alignItems: 'center', paddingTop: 32, paddingBottom: 40 }}>
          <TextLink
            label="Take a new reading →"
            onPress={() => router.push('/(scan)/rescan-feedback')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface ScanRowProps {
  row:    ScanHistoryRow;
  first:  boolean;
  last:   boolean;
  onPress: () => void;
}

function ScanRow({ row, first, last, onPress }: ScanRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        paddingVertical:    22,
        borderTopWidth:     first ? 1 : 1,
        borderTopColor:     Palette.rule,
        borderBottomWidth:  last ? 1 : 0,
        borderBottomColor:  Palette.rule,
        flexDirection:      'row',
        alignItems:         'center',
        gap:                16,
      }}
    >
      <View
        style={{
          width: 68, height: 88,
          backgroundColor: Palette.accentSoft,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: 'CormorantGaramond_400Regular_Italic',
            fontStyle:  'italic',
            fontSize:   11,
            color:      Palette.ink3,
          }}
        >
          scan
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <ChapterLabel style={{ marginBottom: 4 }}>
          {`${row.issue_label} · ${row.date_long}`}
        </ChapterLabel>
        <Text
          style={{
            fontFamily:  'CormorantGaramond_500Medium_Italic',
            fontStyle:   'italic',
            fontSize:    44,
            lineHeight:  44,
            color:       Palette.ink,
          }}
        >
          {row.score ?? '—'}
        </Text>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_400Regular_Italic',
            fontStyle:  'italic',
            fontSize:   12.5,
            color:      Palette.ink3,
            marginTop:  4,
          }}
        >
          {row.note}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: 'CormorantGaramond_400Regular_Italic',
          fontStyle:  'italic',
          fontSize:   13,
          color:      Palette.ink3,
        }}
      >
        →
      </Text>
    </TouchableOpacity>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ flex: 1, padding: 32, paddingTop: 12 }}>
        <BackButton onPress={onBack} style={{ marginLeft: -8 }} />
        <View style={{ marginTop: 30 }}>
          <ChapterLabel>Before the first reading</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>No scans</Text>
            {'\n'}yet.
          </Display>
        </View>
        <Body serif size={14} style={{ marginTop: 20, lineHeight: 22, fontStyle: 'italic' }}>
          Your readings, side by side, live here. Take one to begin.
        </Body>
        <View style={{ flex: 1 }} />
        <PrimaryButton label="Take first reading →" onPress={() => router.replace('/scan')} />
      </View>
    </SafeAreaView>
  );
}
