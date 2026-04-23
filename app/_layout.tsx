import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import {
  useFonts,
  CormorantGaramond_400Regular,
  CormorantGaramond_500Medium,
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_500Medium_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Palette } from '../constants/theme';
import { ScanProvider } from '../hooks/useScan';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_400Regular,
    CormorantGaramond_500Medium,
    CormorantGaramond_400Regular_Italic,
    CormorantGaramond_500Medium_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const prevUserIdRef = useRef<string | null>(null);
  const initialRouteDoneRef = useRef(false);

  // Google Sign-In one-time config.
  useEffect(() => {
    GoogleSignin.configure({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID && {
        androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      } as any),
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      scopes: ['profile', 'email'],
    });
  }, []);

  // Deep-link handler for lume://auth/callback. Supabase processes the URL
  // hash automatically on app open; the auth listener below takes over routing.
  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (url.includes('auth/callback')) {
        // no-op: Supabase auto-handles the hash; routing falls through to the
        // onAuthStateChange listener below.
      }
    };
    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });
    return () => sub.remove();
  }, []);

  // Auth + onboarding routing brain. Fires once on app open, then only on
  // sign-in/sign-out transitions — not on token-refresh pings.
  useEffect(() => {
    if (!fontsLoaded && !fontError) return;

    let mounted = true;

    const routeForSession = async (session: Session | null) => {
      if (!session) {
        router.replace('/(auth)/splash');
        return;
      }
      const { data: userRow } = await supabase
        .from('users')
        .select('onboarding_complete')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!userRow || !userRow.onboarding_complete) {
        router.replace('/(auth)/onboarding');
        return;
      }

      const { count } = await supabase
        .from('scans')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id);

      if (!count || count === 0) {
        router.replace('/scan');
        return;
      }

      router.replace('/(tabs)/routine');
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      prevUserIdRef.current = session?.user.id ?? null;
      if (!initialRouteDoneRef.current) {
        initialRouteDoneRef.current = true;
        routeForSession(session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const prevId = prevUserIdRef.current;
      const nextId = session?.user.id ?? null;
      prevUserIdRef.current = nextId;
      if (prevId !== nextId) {
        routeForSession(session);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fontsLoaded, fontError, router]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ScanProvider>
      <View style={{ flex: 1, backgroundColor: Palette.bg }}>
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scan" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="(scan)" />
          <Stack.Screen name="index" />
        </Stack>
      </View>
    </ScanProvider>
  );
}
