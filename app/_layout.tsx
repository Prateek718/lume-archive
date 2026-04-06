import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const GUEST_PROFILE_KEY = '@lume/guest_profile';

export const DEFAULT_GUEST = {
  id: 'guest',
  display_name: 'Guest',
  gender: 'man',
  city: 'Mumbai',
  onboarding_complete: true,
  notification_reminders: true,
  notification_routine: true,
  avatar_url: null,
  referral_code: null,
  referred_by: null,
  push_token: null,
  last_scan_at: null,
  created_at: new Date().toISOString(),
};

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      const existing = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
      if (!existing) {
        await AsyncStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(DEFAULT_GUEST));
      }
      setReady(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const root = segments[0] as string;
    const safeRoutes = [
      'recommendations', 'salons', 'hair-detail',
      'skin-detail', 'beard-detail', 'makeup-detail'
    ];
    if (safeRoutes.includes(root)) return;
    if (root !== '(tabs)') router.replace('/(tabs)/scan');
  }, [ready, segments]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <StatusBar style="light" backgroundColor="#0A0A0A" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="salons" />
        <Stack.Screen
          name="recommendations"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="hair-detail" />
        <Stack.Screen name="skin-detail" />
        <Stack.Screen name="beard-detail" />
        <Stack.Screen name="makeup-detail" />
      </Stack>
    </View>
  );
}
