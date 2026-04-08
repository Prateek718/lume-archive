// Profile tab — user info, stats, routine reminders, account actions

import { useState, useEffect, useCallback } from 'react';
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
import { FIRST_LAUNCH_KEY, GUEST_PROFILE_KEY } from '../_layout';
import { getTierFromScore } from '../../constants/tiers';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [isGuest,           setIsGuest]           = useState(true);
  const [displayName,       setDisplayName]       = useState('');
  const [gender,            setGender]            = useState('');
  const [city,              setCity]              = useState('');
  const [scanCount,         setScanCount]         = useState(0);
  const [currentStreak,     setCurrentStreak]     = useState(0);
  const [bestStreak,        setBestStreak]        = useState(0);
  const [topTier,           setTopTier]           = useState('');
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

    if (!user) {
      setIsGuest(true);
      return;
    }

    setIsGuest(false);

    // Load user profile
    const { data: profile } = await supabase
      .from('users')
      .select('display_name, gender, city')
      .eq('id', user.id)
      .single();

    if (profile) {
      setDisplayName(profile.display_name ?? '');
      setGender(profile.gender ?? '');
      setCity(profile.city ?? '');
    }

    // Load scan count and top tier
    const { data: scans } = await supabase
      .from('scans')
      .select('score_overall, tier_label')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (scans) {
      setScanCount(scans.length);
      const bestScore = scans.length > 0
        ? Math.max(...scans.map(sc => sc.score_overall ?? 0))
        : 0;
      if (bestScore > 0) setTopTier(getTierFromScore(bestScore).name);
    }

    // Load streak from AsyncStorage
    const streakRaw = await AsyncStorage.getItem('@lume/routine_streak');
    if (streakRaw) {
      const streak = JSON.parse(streakRaw) as { current: number; best: number };
      setCurrentStreak(streak.current ?? 0);
      setBestStreak(streak.best ?? 0);
    }

    // Load notification settings
    const reminderRaw = await AsyncStorage.getItem('@lume/reminder_enabled');
    setReminderEnabled(reminderRaw === 'true');

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

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Lumé',
        body: 'Time for your morning grooming routine ☀️',
        data: { type: 'routine_morning' },
      },
      trigger: {
        hour: morning.getHours(),
        minute: morning.getMinutes(),
        repeats: true,
      } as any,
    });

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Lumé',
        body: 'Time for your evening grooming routine 🌙',
        data: { type: 'routine_evening' },
      },
      trigger: {
        hour: evening.getHours(),
        minute: evening.getMinutes(),
        repeats: true,
      } as any,
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
              router.replace('/(auth)/splash');
            } catch (error: unknown) {
              Alert.alert('Error', 'Could not delete account. Please try again.');
            }
          },
        },
      ],
    );
  }

  // ── Guest view ─────────────────────────────────────────────────────────────
  if (isGuest) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={s.pageTitle}>Profile</Text>

          <View style={s.guestBanner}>
            <View style={s.guestAvatar}>
              <Text style={s.guestAvatarText}>?</Text>
            </View>
            <Text style={s.guestTitle}>You're browsing as a guest</Text>
            <Text style={s.guestSub}>
              Sign in to save your scans, track streaks and get reminders
            </Text>
            <TouchableOpacity
              style={s.signInBtn}
              onPress={() => router.push('/(auth)/signup')}
              activeOpacity={0.85}
            >
              <Text style={s.signInBtnText}>Sign in</Text>
            </TouchableOpacity>
          </View>

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
        </ScrollView>
      </View>
    );
  }

  // ── Authenticated view ─────────────────────────────────────────────────────
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>Profile</Text>

        {/* User info card */}
        <View style={s.userCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {displayName?.[0]?.toUpperCase() ?? 'U'}
            </Text>
          </View>
          <Text style={s.userName}>{displayName}</Text>
          <Text style={s.userMeta}>
            {city}{city && gender ? ' · ' : ''}{gender === 'man' ? 'Man' : gender === 'woman' ? 'Woman' : ''}
          </Text>
          {topTier ? (
            <View style={s.tierBadge}>
              <Text style={s.tierBadgeText}>{topTier}</Text>
            </View>
          ) : null}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{scanCount}</Text>
            <Text style={s.statLabel}>SCANS</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>🔥 {currentStreak}</Text>
            <Text style={s.statLabel}>STREAK</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{bestStreak}</Text>
            <Text style={s.statLabel}>BEST</Text>
          </View>
        </View>

        {/* Routine reminders */}
        <Text style={s.sectionLabel}>ROUTINE REMINDERS</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.rowLabel}>Daily reminder</Text>
            <Switch
              value={reminderEnabled}
              onValueChange={handleReminderToggle}
              trackColor={{ false: Colors.border, true: Colors.gold }}
              thumbColor={Colors.cream}
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

        {/* About */}
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

        {/* Account actions */}
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
  screen:       { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: Spacing.xl },

  pageTitle: {
    fontFamily:        Typography.serif,
    fontSize:          28,
    color:             Colors.cream,
    paddingHorizontal: Spacing.lg,
    paddingTop:        Spacing.md,
    marginBottom:      Spacing.lg,
  },

  // Guest
  guestBanner: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     'rgba(201,168,76,0.2)',
    padding:         Spacing.xl,
    alignItems:      'center',
    marginHorizontal: Spacing.lg,
    marginBottom:    Spacing.lg,
  },
  guestAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  guestAvatarText: { fontSize: 24, color: Colors.textSecondary },
  guestTitle:  { fontFamily: Typography.serif, fontSize: 16, color: Colors.cream, marginBottom: Spacing.xs, textAlign: 'center' },
  guestSub:    { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: Spacing.lg },
  signInBtn:     { backgroundColor: Colors.gold, borderRadius: Radius.input, paddingVertical: 12, paddingHorizontal: 32, width: '100%', alignItems: 'center' },
  signInBtnText: { fontSize: 14, fontWeight: '600', color: Colors.background },

  // User card
  userCard: {
    alignItems:      'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    marginBottom:    Spacing.sm,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText:    { fontFamily: Typography.serif, fontSize: 26, color: Colors.gold },
  userName:      { fontFamily: Typography.serif, fontSize: 22, color: Colors.cream, marginBottom: 4 },
  userMeta:      { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.sm },
  tierBadge:     { backgroundColor: 'rgba(201,168,76,0.12)', borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 4 },
  tierBadgeText: { fontSize: 12, color: Colors.gold },

  // Stats
  statsRow: {
    flexDirection: 'row', gap: Spacing.sm,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.lg,
  },
  statCard:  { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, alignItems: 'center' },
  statNum:   { fontFamily: Typography.serif, fontSize: 22, color: Colors.cream, marginBottom: 2 },
  statLabel: { fontSize: 9, color: Colors.textSecondary, letterSpacing: 1 },

  // Section / card
  sectionLabel: {
    fontSize: 10, color: Colors.textSecondary, letterSpacing: 2,
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, marginTop: Spacing.xs,
  },
  card: {
    backgroundColor:  Colors.surface,
    borderRadius:     Radius.card,
    borderWidth:      1,
    borderColor:      Colors.border,
    marginHorizontal: Spacing.lg,
    marginBottom:     Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  rowLabel: { fontSize: 14, color: Colors.cream },
  rowSub:   { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  rowValue: { fontSize: 13, color: Colors.textSecondary },
  rowArrow: { fontSize: 18, color: Colors.gold },
  divider:  { height: 1, backgroundColor: Colors.border },
  timeBtn:     { backgroundColor: Colors.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  timeBtnText: { fontSize: 13, color: Colors.gold },

  // Account actions
  accountActions:  { marginHorizontal: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  signOutBtn:      { paddingVertical: 12, alignItems: 'center' },
  signOutText:     { fontSize: 14, color: Colors.textSecondary },
  actionsDivider:  { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  deleteBtn:       { paddingVertical: 12, alignItems: 'center' },
  deleteText:      { fontSize: 14, color: '#FF4444' },
});
