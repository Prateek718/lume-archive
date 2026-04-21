// Profile tab — hero, tier card, flat preference/notification/about sections

import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { FIRST_LAUNCH_KEY } from '../_layout';
import { getSavedRecommendations } from '../../services/scanService';
import type { Scan, HairProfile, PreferredBrands } from '../../types';
import { isBaldProfile } from '../../types';
import { inferBudgetFromBrands } from '../../constants/productConstants';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [displayName,       setDisplayName]       = useState('');
  const [city,              setCity]              = useState('');
  const [preferredBrandsV2, setPreferredBrandsV2] = useState<PreferredBrands | null>(null);
  const [hairProfile,       setHairProfile]       = useState<HairProfile | null>(null);
  const [scans,             setScans]             = useState<Scan[]>([]);
  const [kitCount,          setKitCount]          = useState<number>(0);
  const [reminderEnabled,   setReminderEnabled]   = useState(false);
  const [morningTime,       setMorningTime]       = useState(new Date(new Date().setHours(8, 0, 0, 0)));
  const [eveningTime,       setEveningTime]       = useState(new Date(new Date().setHours(21, 0, 0, 0)));
  const [showMorningPicker, setShowMorningPicker] = useState(false);
  const [showEveningPicker, setShowEveningPicker] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, []),
  );

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('users')
      .select('display_name, gender, city, preferred_brands_v2, hair_profile')
      .eq('id', user.id)
      .single();

    if (profile) {
      setDisplayName(profile.display_name ?? '');
      setCity(profile.city ?? '');
      type ProfileRow = {
        preferred_brands_v2?: PreferredBrands | null;
        hair_profile?: HairProfile | null;
      };
      const p = profile as ProfileRow;
      setPreferredBrandsV2(p.preferred_brands_v2 ?? null);
      const hp = p.hair_profile ?? null;
      setHairProfile(hp && Object.keys(hp).length > 0 ? hp : null);
    }

    const { data: scansData } = await supabase
      .from('scans')
      .select('id, score_overall, tier_label, face_shape, skin_type, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (scansData) setScans(scansData as Scan[]);

    const { count: kitActiveCount } = await supabase
      .from('user_kit')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);
    setKitCount(kitActiveCount ?? 0);

    const reminderRaw = await AsyncStorage.getItem('@lume/reminder_enabled');
    if (reminderRaw === 'true') {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') {
        setReminderEnabled(true);
      } else {
        setReminderEnabled(false);
        await AsyncStorage.setItem('@lume/reminder_enabled', 'false');
      }
    } else {
      setReminderEnabled(false);
    }

    const morningRaw = await AsyncStorage.getItem('@lume/morning_time');
    if (morningRaw) setMorningTime(new Date(morningRaw));

    const eveningRaw = await AsyncStorage.getItem('@lume/evening_time');
    if (eveningRaw) setEveningTime(new Date(eveningRaw));
  }

  async function handleReminderToggle(value: boolean) {
    setReminderEnabled(value);
    await AsyncStorage.setItem('@lume/reminder_enabled', value ? 'true' : 'false');

    if (value) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        setReminderEnabled(false);
        await AsyncStorage.setItem('@lume/reminder_enabled', 'false');
        Alert.alert('Permission needed', 'Enable notifications in your phone settings.');
        return;
      }
      await scheduleReminders(morningTime, eveningTime);
    } else {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  }

  async function scheduleReminders(morning: Date, evening: Date) {
    await Notifications.cancelAllScheduledNotificationsAsync();

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('routine-reminders', {
        name:             'Routine Reminders',
        importance:       Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: Colors.accent,
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Lumé',
        body:  'Time for your morning care routine ☀️',
        data:  { type: 'routine_morning' },
        ...(Platform.OS === 'android' ? { channelId: 'routine-reminders' } : {}),
      },
      trigger: {
        type:   Notifications.SchedulableTriggerInputTypes.DAILY,
        hour:   morning.getHours(),
        minute: morning.getMinutes(),
      },
    });

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Lumé',
        body:  'Time for your evening care routine 🌙',
        data:  { type: 'routine_evening' },
        ...(Platform.OS === 'android' ? { channelId: 'routine-reminders' } : {}),
      },
      trigger: {
        type:   Notifications.SchedulableTriggerInputTypes.DAILY,
        hour:   evening.getHours(),
        minute: evening.getMinutes(),
      },
    });
  }

  async function handleMorningChange(event: any, date?: Date) {
    setShowMorningPicker(false);
    if (date) {
      setMorningTime(date);
      await AsyncStorage.setItem('@lume/morning_time', date.toISOString());
      if (reminderEnabled) await scheduleReminders(date, eveningTime);
    }
  }

  async function handleEveningChange(event: any, date?: Date) {
    setShowEveningPicker(false);
    if (date) {
      setEveningTime(date);
      await AsyncStorage.setItem('@lume/evening_time', date.toISOString());
      if (reminderEnabled) await scheduleReminders(morningTime, date);
    }
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function clearRoutineData() {
    await AsyncStorage.multiRemove([
      '@lume/routine_steps',
      '@lume/routine_log',
      '@lume/routine_streak',
      '@lume/morning_time',
      '@lume/evening_time',
      '@lume/reminder_enabled',
    ]);
  }

  function handleSignOut() {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.auth.signOut();
              await AsyncStorage.removeItem(FIRST_LAUNCH_KEY);
              await clearRoutineData();
              router.replace('/(auth)/splash');
            } catch {
              router.replace('/(auth)/splash');
            }
          },
        },
      ],
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('delete_user');
              if (error) throw error;
              await supabase.auth.signOut();
              await AsyncStorage.removeItem(FIRST_LAUNCH_KEY);
              await clearRoutineData();
              router.replace('/(auth)/splash');
            } catch (error: unknown) {
              Alert.alert('Error', 'Could not delete account. Please try again.');
            }
          },
        },
      ],
    );
  }

  const hairProfileSet = hairProfile !== null;

  const latestScan = scans[0] ?? null;
  const scanPills  = latestScan
    ? [
        latestScan.face_shape && `${latestScan.face_shape} face`,
        latestScan.skin_type  && `${latestScan.skin_type} skin`,
      ].filter(Boolean) as string[]
    : [];

  async function openLatestRecommendation() {
    if (!latestScan) return;
    const cached = await getSavedRecommendations(latestScan.id ?? '');
    if (cached) {
      router.push({ pathname: '/recommendations', params: { scanJson: JSON.stringify(cached) } });
    } else {
      router.push({ pathname: '/recommendations', params: { scanId: latestScan.id } });
    }
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Hero ── */}
        <View style={s.hero}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {displayName?.[0]?.toUpperCase() ?? 'U'}
            </Text>
          </View>
          <Text style={s.heroName}>{displayName}</Text>
          {city ? <Text style={s.heroCity}>{city}</Text> : null}

          {latestScan && (
            <TouchableOpacity style={s.tierCard} onPress={openLatestRecommendation} activeOpacity={0.85}>
              <Text style={s.scanDateText}>
                {new Date(latestScan.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </Text>
              {scanPills.length > 0 && (
                <View style={s.tierPills}>
                  {scanPills.map(p => (
                    <View key={p} style={s.tierPill}>
                      <Text style={s.tierPillText}>{p}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={s.viewRecsLink}>View recommendations →</Text>
            </TouchableOpacity>
          )}

          {!latestScan && (
            <View style={s.noScanCard}>
              <Text style={s.noScanText}>Take your first scan to see your personalised plan.</Text>
            </View>
          )}

          <TouchableOpacity
            style={s.viewAllBtn}
            onPress={() => router.push('/profile/recommendations' as any)}
            activeOpacity={0.7}
          >
            <Text style={s.viewAllText}>View all recommendations →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Notifications ── */}
        <Text style={s.sectionLabel}>NOTIFICATIONS</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.rowLabel}>Daily reminder</Text>
            <Switch
              value={reminderEnabled}
              onValueChange={handleReminderToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={Colors.text}
            />
          </View>

          {reminderEnabled && (
            <>
              <View style={s.divider} />
              <TouchableOpacity
                style={s.row}
                onPress={() => setShowMorningPicker(true)}
                activeOpacity={0.7}
              >
                <View>
                  <Text style={s.rowLabel}>Morning</Text>
                  <Text style={s.rowSub}>AM routine reminder</Text>
                </View>
                <View style={s.timeBtn}>
                  <Text style={s.timeBtnText}>{formatTime(morningTime)}</Text>
                </View>
              </TouchableOpacity>
              <View style={s.divider} />
              <TouchableOpacity
                style={s.row}
                onPress={() => setShowEveningPicker(true)}
                activeOpacity={0.7}
              >
                <View>
                  <Text style={s.rowLabel}>Evening</Text>
                  <Text style={s.rowSub}>PM routine reminder</Text>
                </View>
                <View style={s.timeBtn}>
                  <Text style={s.timeBtnText}>{formatTime(eveningTime)}</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>

        {showMorningPicker && (
          <DateTimePicker
            value={morningTime}
            mode="time"
            is24Hour={false}
            onChange={handleMorningChange}
          />
        )}
        {showEveningPicker && (
          <DateTimePicker
            value={eveningTime}
            mode="time"
            is24Hour={false}
            onChange={handleEveningChange}
          />
        )}

        {/* ── Preferences ── */}
        <Text style={s.sectionLabel}>PREFERENCES</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={s.row}
            onPress={() => router.push('/profile/my-brands' as any)}
            activeOpacity={0.7}
          >
            <View>
              <Text style={s.rowLabel}>My brands</Text>
              <Text style={s.rowSub}>
                {(() => {
                  const pb = preferredBrandsV2;
                  const totalBrands = (pb?.skin?.length ?? 0) +
                    (pb?.hair?.length ?? 0) +
                    (pb?.makeup?.length ?? 0);
                  if (totalBrands === 0 || !pb) return 'Not set yet';
                  const budgetLabel = inferBudgetFromBrands(pb);
                  return `${totalBrands} brands · ${budgetLabel}`;
                })()}
              </Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity
            style={s.row}
            onPress={() => router.push('/hair-profile' as any)}
            activeOpacity={0.7}
          >
            <View>
              <Text style={s.rowLabel}>Hair profile</Text>
              <Text style={s.rowSub}>
                {hairProfileSet && hairProfile
                  ? isBaldProfile(hairProfile)
                    ? 'Bald / Shaved · Scalp care'
                    : `${hairProfile.texture ?? ''} · ${hairProfile.primary_concern ?? ''}`.replace(/^ · | · $/, '')
                  : 'Not set yet'}
              </Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── My Kit ── */}
        <Text style={s.sectionLabel}>MY KIT</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={s.row}
            onPress={() => router.push('/profile/my-kit' as any)}
            activeOpacity={0.7}
          >
            <View>
              <Text style={s.rowLabel}>My kit</Text>
              <Text style={s.rowSub}>
                {kitCount > 0
                  ? `${kitCount} product${kitCount === 1 ? '' : 's'} you use · Track reorders`
                  : 'No products yet · Add from your routine'}
              </Text>
            </View>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── About ── */}
        <Text style={s.sectionLabel}>ABOUT</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} activeOpacity={0.7}>
            <Text style={s.rowLabel}>Privacy Policy</Text>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.row} activeOpacity={0.7}>
            <Text style={s.rowLabel}>Terms of Service</Text>
            <Text style={s.rowArrow}>›</Text>
          </TouchableOpacity>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.rowLabel}>Version</Text>
            <Text style={s.rowValue}>1.0.0</Text>
          </View>
        </View>

        {/* ── Account actions ── */}
        <View style={s.accountActions}>
          <TouchableOpacity onPress={handleSignOut} style={s.signOutBtn} activeOpacity={0.7}>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
          <View style={s.actionsDivider} />
          <TouchableOpacity onPress={handleDeleteAccount} style={s.deleteBtn} activeOpacity={0.7}>
            <Text style={s.deleteText}>Delete account</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: Spacing.xl },

  // ── Hero ──
  hero: {
    alignItems:        'center',
    paddingTop:        Spacing.xl,
    paddingBottom:     Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.surface,
    borderWidth: 2, borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: { fontFamily: Typography.serif, fontSize: 26, color: Colors.accent },
  heroName:   { fontFamily: Typography.serif, fontSize: 20, color: Colors.text, marginBottom: 4 },
  heroCity:   { fontSize: 13, color: Colors.text, marginBottom: Spacing.md },

  // Tier card
  tierCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.accent,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  scanDateText: { fontSize: 12, color: Colors.text2, marginBottom: Spacing.xs },
  viewRecsLink: { fontSize: 12, color: Colors.accent, marginTop: Spacing.xs },
  tierPills:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tierPill:     { backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tierPillText: { fontSize: 10, color: Colors.accent, textTransform: 'capitalize' },

  // No scan state
  noScanCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    alignItems: 'center',
  },
  noScanText: { fontSize: 13, color: Colors.text2, textAlign: 'center' },

  viewAllBtn:  { paddingVertical: 8, marginTop: 4 },
  viewAllText: { fontSize: 13, color: Colors.text },

  // ── Section label ──
  sectionLabel: {
    fontSize: 10, color: Colors.text, letterSpacing: 1.5, textTransform: 'uppercase',
    marginHorizontal: Spacing.lg, marginBottom: Spacing.xs, marginTop: Spacing.lg,
  },

  // ── Card ──
  card: {
    backgroundColor:   Colors.surface,
    borderRadius:      Radius.card,
    borderWidth:       1,
    borderColor:       Colors.border,
    marginHorizontal:  Spacing.lg,
    paddingHorizontal: Spacing.md,
    overflow:          'hidden',
  },

  // ── Row primitives ──
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  rowLabel: { fontSize: 15, color: Colors.text },
  rowSub:   { fontSize: 12, color: Colors.text2, marginTop: 2 },
  rowValue: { fontSize: 13, color: Colors.text2 },
  rowArrow: { fontSize: 18, color: Colors.accent },
  divider:  { height: 1, backgroundColor: Colors.border2 },

  timeBtn:     { backgroundColor: Colors.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  timeBtnText: { fontSize: 13, color: Colors.accent },

  // ── Account actions ──
  accountActions: {
    marginHorizontal: Spacing.lg,
    borderTopWidth:   1,
    borderTopColor:   Colors.border,
    paddingTop:       Spacing.md,
    marginTop:        Spacing.lg,
  },
  signOutBtn:     { paddingVertical: 12, alignItems: 'center' },
  signOutText:    { fontSize: 13, color: Colors.text },
  actionsDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  deleteBtn:      { paddingVertical: 12, alignItems: 'center' },
  deleteText:     { fontSize: 13, color: Colors.danger },
});
