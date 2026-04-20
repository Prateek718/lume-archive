import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Colors } from '../constants/theme';
import { StatusBar } from 'expo-status-bar';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';

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

export default function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

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
            router.replace('/(tabs)/scan');
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
        router.replace('/(tabs)/scan');
      }
    });
    return () => subscription.remove();
  }, []);

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
    </View>
  );
}
