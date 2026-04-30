// MilestonesListScreen — earned milestones (with date) and next milestones
// (with hint copy, dimmed). Empty state when no rows in either list.

import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import {
  BackButton, Body, ChapterLabel, Display, PrimaryButton,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import {
  fetchMilestones, type MilestoneSplit, type MilestoneRow,
} from '../../lib/profileData';

export default function MilestonesListScreen() {
  const router = useRouter();
  const [data, setData] = useState<MilestoneSplit | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) { if (!cancelled) setData({ earned: [], next: [] }); return; }
      const split = await fetchMilestones(userId);
      if (!cancelled) setData(split);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  if (data.earned.length === 0 && data.next.length === 0) {
    return <EmptyState onBack={() => router.back()} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 28, paddingVertical: 8 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <ChapterLabel>Small milestones · quiet celebrations</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 30, lineHeight: 33 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>What you&apos;ve</Text>
            {'\n'}done so far.
          </Display>
        </View>

        {data.earned.length > 0 && (
          <View style={{ paddingTop: 32, paddingHorizontal: 32 }}>
            <ChapterLabel style={{ marginBottom: 14 }}>Earned</ChapterLabel>
            {data.earned.map((m, i) => (
              <MilestoneRowView
                key={m.key}
                row={m}
                first={i === 0}
                last={i === data.earned.length - 1}
                earned
              />
            ))}
          </View>
        )}

        {data.next.length > 0 && (
          <View style={{ paddingTop: 32, paddingHorizontal: 32 }}>
            <ChapterLabel style={{ marginBottom: 14 }}>Next</ChapterLabel>
            {data.next.map((m, i) => (
              <MilestoneRowView
                key={m.key}
                row={m}
                first={i === 0}
                last={i === data.next.length - 1}
                earned={false}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

interface MilestoneRowViewProps {
  row:    MilestoneRow;
  first:  boolean;
  last:   boolean;
  earned: boolean;
}

function MilestoneRowView({ row, first, last, earned }: MilestoneRowViewProps) {
  return (
    <View
      style={{
        paddingVertical:    18,
        borderTopWidth:     first ? 1 : 1,
        borderTopColor:     Palette.rule,
        borderBottomWidth:  last ? 1 : 0,
        borderBottomColor:  Palette.rule,
        flexDirection:      'row',
        justifyContent:     'space-between',
        alignItems:         'center',
        opacity:            earned ? 1 : 0.7,
      }}
    >
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium_Italic',
            fontStyle:  'italic',
            fontSize:   17,
            color:      Palette.ink,
          }}
        >
          {row.label}
        </Text>
        {!!row.date && (
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize:   11.5,
              color:      Palette.ink3,
              marginTop:  3,
            }}
          >
            {row.date}
          </Text>
        )}
      </View>
      {earned ? (
        <View
          style={{
            width: 24, height: 24, borderRadius: 12,
            backgroundColor: Palette.accent,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Svg width={10} height={8} viewBox="0 0 12 9">
            <Path d="M1 4.5L4.5 8L11 1" stroke={Palette.onScanBg}
                  strokeWidth={1.8} strokeLinecap="round"
                  strokeLinejoin="round" fill="none" />
          </Svg>
        </View>
      ) : (
        <View
          style={{
            width: 24, height: 24, borderRadius: 12,
            borderWidth: 1.5, borderColor: Palette.rule,
          }}
        />
      )}
    </View>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ flex: 1, padding: 32, paddingTop: 12 }}>
        <BackButton onPress={onBack} style={{ marginLeft: -8 }} />
        <View style={{ marginTop: 30 }}>
          <ChapterLabel>First steps</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>No milestones</Text>
            {'\n'}yet.
          </Display>
        </View>
        <Body serif size={14} style={{ marginTop: 20, lineHeight: 22, fontStyle: 'italic' }}>
          Take your first reading and start a streak — they appear here as you go.
        </Body>
        <View style={{ flex: 1 }} />
        <PrimaryButton label="Back to profile" onPress={onBack} />
      </View>
    </SafeAreaView>
  );
}
