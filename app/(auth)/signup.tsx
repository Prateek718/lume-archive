import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { FIRST_LAUNCH_KEY } from '../_layout';

export default function SignupScreen() {
  const router = useRouter();

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error('No ID token received');

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;

      const userId   = data.user?.id;
      const userName = data.user?.user_metadata?.full_name as string | undefined
                    ?? data.user?.user_metadata?.name as string | undefined
                    ?? null;

      if (!userId) throw new Error('No user ID received');

      // Always check the users table — don't rely on FIRST_LAUNCH_KEY
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('onboarding_complete')
        .eq('id', userId)
        .single();

      await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');

      if (profileError || !profile) {
        // New user — create row and send to onboarding
        await supabase.from('users').upsert({
          id:                  userId,
          display_name:        userName,
          onboarding_complete: false,
          created_at:          new Date().toISOString(),
        });
        router.replace('/(auth)/onboarding');
      } else if (!profile.onboarding_complete) {
        router.replace('/(auth)/onboarding');
      } else {
        router.replace('/(tabs)/scan');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Google Sign In failed';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email:    trimmedEmail,
      password: password,
    });

    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      Alert.alert('Account created', 'Please check your email to confirm.');
      setLoading(false);
      return;
    }

    const { error: upsertError } = await supabase.from('users').upsert({
      id:                  userId,
      onboarding_complete: false,
      created_at:          new Date().toISOString(),
    });
    if (upsertError) {
      console.error('[signup] upsert error:', upsertError.message);
    }

    await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
    setLoading(false);
    router.replace('/(auth)/onboarding');
  };

  const canSubmit = email.trim().length > 0 && password.length >= 6;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >

          <Text style={styles.title}>Welcome to Lumé</Text>
          <Text style={styles.subtitle}>Your AI care companion</Text>

          {/* Google Sign In */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleText}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email */}
          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor={Colors.text3}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
          />

          {/* Password with show/hide */}
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password (min. 6 characters)"
              placeholderTextColor={Colors.text3}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              returnKeyType="go"
              onSubmitEditing={() => canSubmit && handleSignUp()}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(v => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.eyeIcon}>👁</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.ctaButton, !canSubmit && styles.ctaDisabled]}
            onPress={handleSignUp}
            disabled={!canSubmit || loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color={Colors.textOnAccent} />
              : <Text style={styles.ctaText}>Create account</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchLink}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.7}
          >
            <Text style={styles.switchText}>
              Already have an account?{' '}
              <Text style={styles.switchTextBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: {
    flexGrow:          1,
    justifyContent:    'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.xxxl,
  },

  title: {
    fontFamily:   Typography.serif,
    fontSize:     22,
    color:        Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize:     13,
    color:        Colors.text2,
    marginBottom: Spacing.xxl,
    lineHeight:   20,
  },

  googleBtn: {
    backgroundColor: Colors.card,
    borderRadius:    12,
    paddingVertical: 14,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    marginBottom:    16,
    width:           '100%',
  },
  googleIcon: { fontSize: 18, color: '#4285F4', fontWeight: '700' },
  googleText: { color: Colors.text, fontWeight: '600', fontSize: 15 },

  dividerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   Spacing.xl,
    gap:            Spacing.sm,
  },
  dividerLine:  { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerLabel: { fontSize: Typography.size.sm, color: Colors.text2 },

  input: {
    backgroundColor:   Colors.surface,
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.md,
    fontSize:          15,
    color:             Colors.text,
    marginBottom:      Spacing.md,
  },

  passwordWrapper: {
    position:     'relative',
    marginBottom: Spacing.md,
  },
  passwordInput: {
    backgroundColor:   Colors.surface,
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      Radius.input,
    paddingHorizontal: Spacing.md,
    paddingRight:      48,
    paddingVertical:   Spacing.md,
    fontSize:          15,
    color:             Colors.text,
  },
  eyeBtn: {
    position:       'absolute',
    right:          Spacing.md,
    top:            0,
    bottom:         0,
    justifyContent: 'center',
  },
  eyeIcon: { fontSize: 18 },

  ctaButton: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.input,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginTop:       Spacing.sm,
    marginBottom:    Spacing.xl,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: {
    fontSize:   Typography.size.md,
    fontWeight: '600',
    color:      Colors.textOnAccent,
  },

  switchLink: {
    alignItems:      'center',
    paddingVertical: Spacing.sm,
    marginBottom:    Spacing.sm,
  },
  switchText:     { fontSize: Typography.size.base, color: Colors.text2 },
  switchTextBold: { color: Colors.text, fontWeight: '600' },
});
