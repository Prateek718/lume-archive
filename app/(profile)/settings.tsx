// SettingsScreen — three sections (Account, Preferences, Privacy & data).
// Account is read-only email. Preferences is just the notifications gateway.
// Sign out and Delete account live together under Privacy & data — the two
// account-mutating actions sit side by side. Delete account remains a
// placeholder route until Phase 7C wires the real flow.

import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton, ChapterLabel, Display } from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

interface NotifFlags {
  notify_morning_routine: boolean;
  notify_evening_routine: boolean;
  notify_weekly_summary:  boolean;
  notify_rescan:          boolean;
  notify_milestones:      boolean;
}

const DEFAULT_FLAGS: NotifFlags = {
  notify_morning_routine: true,
  notify_evening_routine: true,
  notify_weekly_summary:  true,
  notify_rescan:          true,
  notify_milestones:      false,
};

interface RowSpec {
  label:    string;
  note:     string;
  onPress?: () => void;
  danger?:  boolean;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [flags, setFlags] = useState<NotifFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const e  = auth.user?.email ?? '';
      const id = auth.user?.id;
      if (cancelled) return;
      setEmail(e);
      if (!id) return;
      const { data } = await supabase.from('users')
        .select('notify_morning_routine, notify_evening_routine, notify_weekly_summary, notify_rescan, notify_milestones')
        .eq('id', id).single();
      if (cancelled) return;
      const row = data as Partial<NotifFlags> | null;
      setFlags({
        notify_morning_routine: row?.notify_morning_routine ?? true,
        notify_evening_routine: row?.notify_evening_routine ?? true,
        notify_weekly_summary:  row?.notify_weekly_summary  ?? true,
        notify_rescan:          row?.notify_rescan          ?? true,
        notify_milestones:      row?.notify_milestones      ?? false,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // Routing handled by the root auth listener.
  };

  const sections: { head: string; rows: RowSpec[] }[] = [
    {
      head: 'Account',
      rows: [
        { label: 'Email', note: email || '—' },
      ],
    },
    {
      head: 'Preferences',
      rows: [
        { label: 'Notifications', note: notificationsSummary(flags),
          onPress: () => router.push('/(profile)/notifications') },
      ],
    },
    {
      head: 'Privacy & data',
      rows: [
        { label: 'Sign out',       note: '', onPress: signOut },
        { label: 'Delete account', note: '', danger: true,
          onPress: () => router.push('/(profile)/delete-account') },
      ],
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 28, paddingVertical: 8 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <Display style={{ fontSize: 34, lineHeight: 38 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>Settings</Text>
          </Display>
        </View>

        <View style={{ paddingTop: 32, paddingHorizontal: 32 }}>
          {sections.map(s => (
            <View key={s.head} style={{ marginBottom: 30 }}>
              <ChapterLabel style={{ marginBottom: 12 }}>{s.head}</ChapterLabel>
              {s.rows.map((r, i) => (
                <SettingsRow
                  key={r.label}
                  row={r}
                  first={i === 0}
                  last={i === s.rows.length - 1}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function notificationsSummary(f: NotifFlags): string {
  const all = [
    f.notify_morning_routine,
    f.notify_evening_routine,
    f.notify_weekly_summary,
    f.notify_rescan,
    f.notify_milestones,
  ];
  const onCount = all.filter(Boolean).length;
  if (onCount === all.length) return 'All on';
  if (onCount === 0)          return 'All off';
  return `${onCount} of ${all.length} on`;
}

interface SettingsRowProps {
  row:   RowSpec;
  first: boolean;
  last:  boolean;
}

function SettingsRow({ row, first, last }: SettingsRowProps) {
  const rowStyle = {
    paddingVertical:    14,
    borderTopWidth:     first ? 1 : 1,
    borderTopColor:     Palette.rule,
    borderBottomWidth:  last ? 1 : 0,
    borderBottomColor:  Palette.rule,
    flexDirection:      'row' as const,
    justifyContent:     'space-between' as const,
    alignItems:         'center' as const,
  };

  const inner = (
    <>
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium_Italic',
            fontStyle:  'italic',
            fontSize:   17,
            color:      row.danger ? Palette.accent : Palette.ink,
          }}
        >
          {row.label}
        </Text>
        {!!row.note && (
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize:   11.5,
              color:      Palette.ink3,
              marginTop:  2,
            }}
          >
            {row.note}
          </Text>
        )}
      </View>
      {row.onPress && (
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
      )}
    </>
  );

  if (row.onPress) {
    return (
      <TouchableOpacity onPress={row.onPress} activeOpacity={0.85} style={rowStyle}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={rowStyle}>{inner}</View>;
}
