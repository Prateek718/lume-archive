// Profile tab — editorial dashboard. Metadata bar (since + city), two-line
// italic-comma-regular headline, 2×2 stat grid (Days in / Adherence / Streak /
// Milestones), seven nav rows. Sign out moved to Settings → Account.

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChapterLabel, Display } from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import {
  computeStatGrid,
  fetchProfileHeader,
  fetchKitItems,
  fetchMilestones,
  fetchScanHistory,
  type StatGrid,
  type ProfileHeader,
} from '../../lib/profileData';

interface RowCounts {
  kit_count:       number;
  milestone_count: number;
  scan_count:      number;
}

export default function ProfileTab() {
  const router = useRouter();
  const [header, setHeader] = useState<ProfileHeader | null>(null);
  const [stats, setStats] = useState<StatGrid | null>(null);
  const [rowCounts, setRowCounts] = useState<RowCounts | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) {
      setLoaded(true);
      return;
    }
    const [head, statGrid, kit, milestones, scans] = await Promise.all([
      fetchProfileHeader(userId),
      computeStatGrid(userId),
      fetchKitItems(userId),
      fetchMilestones(userId),
      fetchScanHistory(userId),
    ]);
    setHeader(head);
    setStats(statGrid);
    setRowCounts({
      kit_count:       kit.length,
      milestone_count: milestones.earned.length,
      scan_count:      scans.length,
    });
    setLoaded(true);
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  if (!loaded || !header) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  const hasScans = header.scan_count > 0;
  const issueWord = header.current_issue_word;
  const kitCount = rowCounts?.kit_count ?? 0;
  const milestoneCount = rowCounts?.milestone_count ?? 0;
  const scanCount = rowCounts?.scan_count ?? 0;

  // Metadata bar: "Reading since {month}" plus optional city, separated by ·.
  const metaParts = [`Reading since ${header.reading_since_month}`];
  if (header.city) metaParts.push(header.city);
  const metaLine = metaParts.join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 40, paddingBottom: 90 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 32 }}>
          <ChapterLabel>{metaLine}</ChapterLabel>
          <Display style={{ marginTop: 12, fontSize: 34, lineHeight: 38 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>
              {hasScans ? `${header.name},` : `${header.name}.`}
            </Text>
            {hasScans && `\non issue ${issueWord}.`}
          </Display>
        </View>

        {/* Stats grid — 2×2, clean 1px hairlines, no tint */}
        {hasScans && stats && (
          <View style={{ paddingHorizontal: 32, paddingTop: 28 }}>
            <View
              style={{
                flexDirection: 'row',
                flexWrap:      'wrap',
                borderTopWidth:    1,
                borderTopColor:    Palette.rule,
                borderBottomWidth: 1,
                borderBottomColor: Palette.rule,
              }}
            >
              <StatCell label="Days in" valueText={String(stats.days_in)} />
              <StatCell label="Adherence" valueText={`${stats.adherence_pct}`} suffix="%" right />
              <StatCell label="Streak"     valueText={`${stats.streak_days}`} suffix="d" top />
              <StatCell label="Milestones" valueText={String(stats.milestone_count)} top right />
            </View>
          </View>
        )}

        {/* Rows */}
        <View style={{ paddingHorizontal: 32, paddingTop: 28 }}>
          <ProfileRow
            label="My kit"
            note={kitCount === 0 ? 'Empty' : `${kitCount} ${kitCount === 1 ? 'product' : 'products'}`}
            first
            onPress={() => router.push('/(profile)/my-kit')}
          />
          <ProfileRow
            label="My brands"
            note="Indian-first"
            onPress={() => router.push('/(profile)/my-brands')}
          />
          <ProfileRow
            label="Adherence"
            note={`Issue ${issueWord} · in progress`}
            onPress={() => router.push('/(profile)/adherence')}
          />
          <ProfileRow
            label="Milestones"
            note={`${milestoneCount} earned`}
            onPress={() => router.push('/(profile)/milestones')}
          />
          <ProfileRow
            label="Scan history"
            note={`${scanCount} ${scanCount === 1 ? 'reading' : 'readings'}`}
            onPress={() => router.push('/(profile)/scan-history')}
          />
          <ProfileRow
            label="Hair profile"
            note="Texture & wash"
            onPress={() => router.push('/(profile)/hair-profile')}
          />
          <ProfileRow
            label="Settings"
            note="Account, notifications, privacy"
            last
            onPress={() => router.push('/(profile)/settings')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Stat grid cell ───────────────────────────────────────────────────────────

const STAT_VALUE_STYLE = {
  fontFamily:  'CormorantGaramond_500Medium_Italic',
  fontStyle:   'italic' as const,
  fontSize:    28,
  color:       Palette.ink,
  fontVariant: ['tabular-nums' as const],
};

const STAT_SUFFIX_STYLE = {
  fontSize: 16,
  color:    Palette.ink3,
};

interface StatCellProps {
  label:     string;
  valueText: string;
  suffix?:   string;
  right?:    boolean;     // suppresses right border (right column)
  top?:      boolean;     // adds top border (bottom row)
}

function StatCell({ label, valueText, suffix, right, top }: StatCellProps) {
  return (
    <View
      style={{
        width:           '50%',
        paddingVertical: 18,
        alignItems:      'center',
        borderRightWidth: right ? 0 : 1,
        borderRightColor: Palette.rule,
        borderTopWidth:   top ? 1 : 0,
        borderTopColor:   Palette.rule,
      }}
    >
      <Text
        style={{
          fontFamily:    'Inter_500Medium',
          fontSize:      9,
          letterSpacing: 1.6,                  // ~0.16em at 9px
          textTransform: 'uppercase',
          color:         Palette.ink3,
          marginBottom:  6,
        }}
      >
        {label}
      </Text>
      <Text style={STAT_VALUE_STYLE}>
        {valueText}
        {suffix && <Text style={STAT_SUFFIX_STYLE}>{suffix}</Text>}
      </Text>
    </View>
  );
}

// ─── Nav rows ─────────────────────────────────────────────────────────────────

interface ProfileRowProps {
  label: string;
  note:  string;
  onPress: () => void;
  first?: boolean;
  last?:  boolean;
}

function ProfileRow({ label, note, onPress, first, last }: ProfileRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        paddingVertical:    18,
        borderTopWidth:     first ? 1 : 1,
        borderTopColor:     Palette.rule,
        borderBottomWidth:  last ? 1 : 0,
        borderBottomColor:  Palette.rule,
        flexDirection:      'row',
        justifyContent:     'space-between',
        alignItems:         'center',
      }}
    >
      <View>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium_Italic',
            fontStyle:  'italic',
            fontSize:   20,
            color:      Palette.ink,
          }}
        >
          {label}
        </Text>
        {!!note && (
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize:   11.5,
              color:      Palette.ink3,
              marginTop:  2,
            }}
          >
            {note}
          </Text>
        )}
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
