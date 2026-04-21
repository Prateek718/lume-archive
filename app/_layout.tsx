import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors } from '../constants/theme';
import { StatusBar } from 'expo-status-bar';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import {
  checkMilestonesOnAppOpen,
  fetchUncelebratedMilestones,
  markMilestoneCelebrated,
  MILESTONES,
  type EarnedMilestone,
  type MilestoneKey,
} from '../lib/milestones';
import MilestoneCelebration from '../components/MilestoneCelebration';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});

export const FIRST_LAUNCH_KEY = '@lume/first_launch';

// Max celebrations to surface on a single app open. Prevents flooding the
// user if multiple milestones were earned offline.
const MAX_CELEBRATIONS_PER_OPEN = 2;

export default function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [celebrationQueue, setCelebrationQueue] = useState<EarnedMilestone[]>([]);

  useEffect(() => {
    const init = async () => {
      GoogleSignin.configure({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID && { androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID } as any),
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        scopes:      ['profile', 'email'],
      });

      // Handle deep links for password reset (lume://auth/callback)
      // NOTE: Supabase Dashboard → Authentication → URL Configuration must have:
      //   Site URL:      lume://
      //   Redirect URLs: lume://auth/callback
      const handleDeepLink = async (url: string) => {
        if (url.includes('auth/callback')) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            router.replace('/scan');
          }
        }
      };

      Linking.getInitialURL().then(url => {
        if (url) handleDeepLink(url);
      });

      const linkingSub = Linking.addEventListener('url', ({ url }) => {
        handleDeepLink(url);
      });

      setReady(true);
      return () => { linkingSub.remove(); };
    };
    init();
  }, []);

  useEffect(() => {
    if (!ready) return;
    router.replace('/(auth)/splash');
  }, [ready]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.type === 'rescan_nudge') {
        router.replace('/scan');
      }
    });
    return () => subscription.remove();
  }, []);

  // On app ready (once we have a user), evaluate time-only milestones and
  // queue up any uncelebrated ones for display.
  useEffect(() => {
    if (!ready) return;
    const run = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await checkMilestonesOnAppOpen(user.id);
        const pending = await fetchUncelebratedMilestones(user.id);
        if (pending.length > 0) {
          setCelebrationQueue(pending.slice(0, MAX_CELEBRATIONS_PER_OPEN));
        }
      } catch (err) {
        console.error('[milestones] app-open check failed', err);
      }
    };
    run();
  }, [ready]);

  const currentCelebration = celebrationQueue[0] ?? null;

  const dismissCurrent = async () => {
    if (!currentCelebration) return;
    const key = currentCelebration.milestone_key as MilestoneKey;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await markMilestoneCelebrated(user.id, key);
    }
    setCelebrationQueue(q => q.slice(1));
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
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
      {currentCelebration && (
        <MilestoneCelebration
          milestoneKey={currentCelebration.milestone_key as MilestoneKey}
          title={MILESTONES[currentCelebration.milestone_key as MilestoneKey].title}
          copy={MILESTONES[currentCelebration.milestone_key as MilestoneKey].copy}
          context={currentCelebration.context}
          onDismiss={dismissCurrent}
        />
      )}
    </View>
  );
}
