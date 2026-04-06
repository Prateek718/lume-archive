// Profile tab — avatar, stats, settings menu

import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import type { User } from '../../types';

const GUEST_PROFILE_KEY = '@lume/guest_profile';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [user, setUser]           = useState<User | null>(null);
  const [isGuest, setIsGuest]     = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [topScore,  setTopScore]  = useState<number | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [notifReminders, setNotifReminders] = useState(true);
  const [notifRoutine,   setNotifRoutine]   = useState(true);

  const fetchProfile = useCallback(async () => {
    const profileStr = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
    const profile = profileStr ? JSON.parse(profileStr) as User : null;
    if (profile) {
      setUser(profile);
      setNotifReminders(profile.notification_reminders ?? true);
      setNotifRoutine(profile.notification_routine ?? true);
      setIsGuest(!profile || profile.id === 'guest');
    } else {
      setIsGuest(true);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchProfile(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchProfile(); };

  const saveNotifPref = async (key: 'notification_reminders' | 'notification_routine', value: boolean) => {
    const profileStr = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
    const profile = profileStr ? JSON.parse(profileStr) : {};
    await AsyncStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify({ ...profile, [key]: value }));
  };

  const handleReferral = () => {
    if (!user?.referral_code) return;
    Alert.alert(
      'Your referral code',
      `Share this code with friends:\n\n${user.referral_code}\n\nWhen they sign up, you both get credit.`,
      [{ text: 'OK' }]
    );
  };

  if (loading) {
    return (
      <View style={[s.screen, s.centre, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  const initials = user?.display_name
    ? user.display_name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} />}
      >
        {/* Guest sign-in banner */}
        {isGuest && (
          <TouchableOpacity
            onPress={() => router.push('/(auth)/signup')}
            style={s.guestBanner}
            activeOpacity={0.8}
          >
            <Text style={s.guestBannerTitle}>Sign in to save your results</Text>
            <Text style={s.guestBannerBody}>
              Create an account to keep your scan history{'\n'}
              and access Lumé from any device
            </Text>
          </TouchableOpacity>
        )}

        {/* Avatar + name */}
        <View style={s.avatarSection}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <Text style={s.displayName}>{user?.display_name ?? 'Guest'}</Text>
          {user?.city && <Text style={s.cityText}>{user.city}</Text>}
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statNum}>{scanCount}</Text>
            <Text style={s.statLabel}>Scans</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statNum}>{topScore ?? '–'}</Text>
            <Text style={s.statLabel}>Top score</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statNum}>{user?.referral_code ?? '–'}</Text>
            <Text style={s.statLabel}>Referral code</Text>
          </View>
        </View>

        {/* Account section */}
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.menuCard}>
          <MenuItem
            label="Referral code"
            value={user?.referral_code ?? undefined}
            onPress={handleReferral}
          />
        </View>

        {/* Notifications section */}
        <Text style={s.sectionLabel}>NOTIFICATIONS</Text>
        <View style={s.menuCard}>
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Visit reminders</Text>
            <Switch
              value={notifReminders}
              onValueChange={v => {
                setNotifReminders(v);
                saveNotifPref('notification_reminders', v);
              }}
              trackColor={{ false: Colors.border, true: Colors.gold }}
              thumbColor={Colors.cream}
            />
          </View>
          <View style={s.divider} />
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Routine nudges</Text>
            <Switch
              value={notifRoutine}
              onValueChange={v => {
                setNotifRoutine(v);
                saveNotifPref('notification_routine', v);
              }}
              trackColor={{ false: Colors.border, true: Colors.gold }}
              thumbColor={Colors.cream}
            />
          </View>
        </View>

        {/* About section */}
        <Text style={s.sectionLabel}>ABOUT</Text>
        <View style={s.menuCard}>
          <MenuItem label="Version" value="1.0.0" />
          <View style={s.divider} />
          <MenuItem label="Privacy policy" arrow />
          <View style={s.divider} />
          <MenuItem label="Terms of service" arrow />
        </View>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ── MenuItem helper ────────────────────────────────────────────────────────
function MenuItem({ label, value, arrow, onPress }: {
  label:    string;
  value?:   string;
  arrow?:   boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={s.menuRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !arrow}
    >
      <Text style={s.menuLabel}>{label}</Text>
      <View style={s.menuRight}>
        {value && <Text style={s.menuValue}>{value}</Text>}
        {arrow && <Text style={s.menuArrow}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: Colors.background },
  centre:  { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  // Guest banner
  guestBanner: {
    backgroundColor: 'rgba(201,168,76,0.1)',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#C9A84C',
    padding:         16,
    marginBottom:    20,
    alignItems:      'center',
  },
  guestBannerTitle: {
    color:        '#C9A84C',
    fontWeight:   '600',
    fontSize:     15,
    marginBottom: 4,
  },
  guestBannerBody: {
    color:     '#8A7A6A',
    fontSize:  13,
    textAlign: 'center',
  },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: Spacing.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.goldDim, borderWidth: 2, borderColor: Colors.gold,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  avatarText:  { fontFamily: Typography.serif, fontSize: 28, color: Colors.gold },
  displayName: { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream, marginBottom: 4 },
  cityText:    { fontSize: Typography.size.base, color: Colors.textSecondary },

  // Stats
  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.xl, alignItems: 'center',
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statNum:     { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream, marginBottom: 2 },
  statLabel:   { fontSize: Typography.size.xs, color: Colors.textSecondary },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.border },

  // Section label
  sectionLabel: {
    fontSize: Typography.size.xs, color: Colors.gold,
    letterSpacing: 6, textTransform: 'uppercase',
    marginBottom: Spacing.sm, marginTop: Spacing.sm,
  },

  // Menu card
  menuCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  menuRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  menuLabel: { fontSize: Typography.size.base, color: Colors.cream },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  menuValue: { fontSize: Typography.size.base, color: Colors.textSecondary },
  menuArrow: { fontSize: 22, color: Colors.textSecondary, lineHeight: 24 },
  divider:   { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.md },

  // Switch row
  switchRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  switchLabel: { fontSize: Typography.size.base, color: Colors.cream },

  // Sign out
  signOutBtn: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: '#A32D2D',
    paddingVertical: Spacing.md, alignItems: 'center', marginBottom: Spacing.md,
  },
  signOutText: { fontSize: Typography.size.md, color: '#A32D2D', fontWeight: '600' },
});
