// NotificationsScreen — five granular preferences. Morning + Evening rituals
// each carry an HH:MM time the user can edit via the native time picker; the
// other three are static-noted booleans. Toggle taps mutate the boolean only;
// label/note taps on Morning/Evening open the picker so the affordance is
// distinct from the toggle hit area.

import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  BackButton, Body, ChapterLabel, Display,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

interface NotifState {
  notify_morning_routine: boolean;
  notify_evening_routine: boolean;
  notify_weekly_summary:  boolean;
  notify_rescan:          boolean;
  notify_milestones:      boolean;
  notify_morning_time:    string;   // 'HH:MM'
  notify_evening_time:    string;   // 'HH:MM'
}

const DEFAULT_STATE: NotifState = {
  notify_morning_routine: true,
  notify_evening_routine: true,
  notify_weekly_summary:  true,
  notify_rescan:          true,
  notify_milestones:      false,
  notify_morning_time:    '07:30',
  notify_evening_time:    '22:00',
};

type BoolKey = {
  [K in keyof NotifState]: NotifState[K] extends boolean ? K : never
}[keyof NotifState];

type TimeKey = 'notify_morning_time' | 'notify_evening_time';

function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h < 12 ? 'am' : 'pm';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${String(m).padStart(2, '0')} ${period}`;
}

function dateFromHHMM(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function dateToHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState]   = useState<NotifState | null>(null);
  const [pickerKey, setPickerKey] = useState<TimeKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth.user?.id;
      if (!id) { if (!cancelled) setState(DEFAULT_STATE); return; }
      const { data } = await supabase.from('users')
        .select('notify_morning_routine, notify_evening_routine, notify_weekly_summary, notify_rescan, notify_milestones, notify_morning_time, notify_evening_time')
        .eq('id', id).single();
      if (cancelled) return;
      const row = (data ?? {}) as Partial<NotifState>;
      setUserId(id);
      setState({
        notify_morning_routine: row.notify_morning_routine ?? DEFAULT_STATE.notify_morning_routine,
        notify_evening_routine: row.notify_evening_routine ?? DEFAULT_STATE.notify_evening_routine,
        notify_weekly_summary:  row.notify_weekly_summary  ?? DEFAULT_STATE.notify_weekly_summary,
        notify_rescan:          row.notify_rescan          ?? DEFAULT_STATE.notify_rescan,
        notify_milestones:      row.notify_milestones      ?? DEFAULT_STATE.notify_milestones,
        notify_morning_time:    row.notify_morning_time    ?? DEFAULT_STATE.notify_morning_time,
        notify_evening_time:    row.notify_evening_time    ?? DEFAULT_STATE.notify_evening_time,
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const writeField = async <K extends keyof NotifState>(key: K, value: NotifState[K]) => {
    if (!state) return;
    const prior = state;
    setState({ ...state, [key]: value });
    if (!userId) return;
    const { error } = await supabase.from('users')
      .update({ [key]: value }).eq('id', userId);
    if (error) {
      console.error('[notifications] write failed', error);
      setState(prior);
    }
  };

  const toggle = (key: BoolKey) => {
    if (!state) return;
    void writeField(key, !state[key] as NotifState[BoolKey]);
  };

  const onTimeChange = (event: DateTimePickerEvent, picked?: Date) => {
    // Android dismisses the dialog with type === 'dismissed'. iOS fires 'set'
    // every time the wheel changes — write each tick, close on tap-outside.
    const key = pickerKey;
    if (Platform.OS === 'android') {
      setPickerKey(null);
      if (event.type !== 'set' || !picked || !key) return;
      void writeField(key, dateToHHMM(picked));
    } else {
      if (!picked || !key) return;
      void writeField(key, dateToHHMM(picked));
    }
  };

  if (!state) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 28, paddingVertical: 8 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <ChapterLabel>Notifications</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>When we</Text>
            {'\n'}speak up.
          </Display>
          <Body serif size={13.5} style={{ marginTop: 16, lineHeight: 22, fontStyle: 'italic' }}>
            Quiet by default. Enable only what earns its place.
          </Body>
        </View>

        <View style={{ paddingTop: 30, paddingHorizontal: 32 }}>
          <NotifRow
            label="Morning ritual"
            note={formatTime(state.notify_morning_time)}
            on={state.notify_morning_routine}
            first
            onTapBody={() => setPickerKey('notify_morning_time')}
            onToggle={() => toggle('notify_morning_routine')}
          />
          <NotifRow
            label="Evening ritual"
            note={formatTime(state.notify_evening_time)}
            on={state.notify_evening_routine}
            onTapBody={() => setPickerKey('notify_evening_time')}
            onToggle={() => toggle('notify_evening_routine')}
          />
          <NotifRow
            label="Weekly summary"
            note="Sunday evening"
            on={state.notify_weekly_summary}
            onToggle={() => toggle('notify_weekly_summary')}
          />
          <NotifRow
            label="Rescan reminders"
            note="Around day 28"
            on={state.notify_rescan}
            onToggle={() => toggle('notify_rescan')}
          />
          <NotifRow
            label="Celebrations"
            note="When you hit a streak"
            on={state.notify_milestones}
            last
            onToggle={() => toggle('notify_milestones')}
          />
        </View>
      </ScrollView>

      {pickerKey && (
        <DateTimePicker
          value={dateFromHHMM(state[pickerKey])}
          mode="time"
          is24Hour={false}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onTimeChange}
        />
      )}
    </SafeAreaView>
  );
}

interface NotifRowProps {
  label:      string;
  note:       string;
  on:         boolean;
  first?:     boolean;
  last?:      boolean;
  onTapBody?: () => void;
  onToggle:   () => void;
}

function NotifRow({ label, note, on, first, last, onTapBody, onToggle }: NotifRowProps) {
  const Body: React.ComponentType<{ children: React.ReactNode }> = onTapBody
    ? ({ children }) => (
        <TouchableOpacity activeOpacity={0.7} onPress={onTapBody} style={{ flex: 1, paddingRight: 16 }}>
          {children}
        </TouchableOpacity>
      )
    : ({ children }) => <View style={{ flex: 1, paddingRight: 16 }}>{children}</View>;

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
      }}
    >
      <Body>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium_Italic',
            fontStyle:  'italic',
            fontSize:   17,
            color:      Palette.ink,
          }}
        >
          {label}
        </Text>
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
      </Body>
      <Toggle on={on} onPress={onToggle} />
    </View>
  );
}

function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        width: 42, height: 24, borderRadius: 99,
        backgroundColor: on ? Palette.accent : Palette.rule,
        padding: 2,
        flexDirection: 'row',
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}
    >
      <View
        style={{
          width: 20, height: 20, borderRadius: 10,
          backgroundColor: Palette.onScanBg,
        }}
      />
    </TouchableOpacity>
  );
}
