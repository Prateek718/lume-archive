import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing } from '../../constants/theme';
import { FIRST_LAUNCH_KEY } from '../_layout';

export default function SplashScreen() {
  const router   = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const riseAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(riseAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start();

    const navigate = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Signed in — check if onboarding is complete
        const { data: profile } = await supabase
          .from('users')
          .select('onboarding_complete')
          .eq('id', session.user.id)
          .single();

        if (!profile?.onboarding_complete) {
          router.replace('/(auth)/onboarding');
        } else {
          router.replace('/(tabs)/scan');
        }
        return;
      }

      // Not signed in — first launch or returning guest?
      const firstLaunchDone = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
      if (!firstLaunchDone) {
        router.replace('/(auth)/signup');
      } else {
        router.replace('/(tabs)/scan');
      }
    };

    const timer = setTimeout(navigate, 2400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Animated.View style={[styles.inner, { opacity: fadeAnim, transform: [{ translateY: riseAnim }] }]}>

        {/* Gold diamond icon */}
        <View style={styles.diamondWrapper}>
          <View style={styles.diamond} />
        </View>

        {/* Brand name */}
        <Text style={styles.brand}>Lumé</Text>

      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems:      'center',
    justifyContent:  'center',
  },
  inner: {
    alignItems: 'center',
  },
  diamondWrapper: {
    width:          80,
    height:         80,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   Spacing.xl,
  },
  diamond: {
    width:           52,
    height:          52,
    backgroundColor: Colors.gold,
    borderRadius:    10,
    transform:       [{ rotate: '45deg' }],
  },
  brand: {
    fontFamily:    Typography.serif,
    fontSize:      42,
    color:         Colors.cream,
    letterSpacing: 3,
  },
});
