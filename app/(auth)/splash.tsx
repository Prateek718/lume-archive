import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Spacing } from '../../constants/theme';

export default function SplashScreen() {
  const router   = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const riseAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    // Fade + rise in together
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 900, useNativeDriver: true,
      }),
      Animated.timing(riseAnim, {
        toValue: 0, duration: 900, useNativeDriver: true,
      }),
    ]).start();

    // Auto-advance to signup after 2.4 s
    const timer = setTimeout(() => {
      router.replace('/(auth)/signup');
    }, 2400);

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

        {/* Tagline */}
        <Text style={styles.tagline}>be you</Text>

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

  // Diamond shape — a rotated square with rounded corners
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
    marginBottom:  Spacing.sm,
  },
  tagline: {
    fontSize:      Typography.size.sm,
    color:         Colors.gold,
    letterSpacing: 6,
    textTransform: 'uppercase',
  },
});
