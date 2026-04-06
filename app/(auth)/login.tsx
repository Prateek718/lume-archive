import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

export default function LoginScreen() {
  const router = useRouter();

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [loading,      setLoading]      = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert('Enter email', 'Please enter your email address.');
      return;
    }
    if (!password) {
      Alert.alert('Enter password', 'Please enter your password.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password: password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Sign in failed', error.message);
    }
    // Success: _layout.tsx onAuthStateChange handles routing
  };

  const handleForgotPassword = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Enter email', 'Enter your email address above first.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Check your email', 'A password reset link has been sent to your inbox.');
    }
  };

  const canSubmit = email.trim().length > 0 && password.length >= 6;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to your Lumé account</Text>

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          returnKeyType="next"
          autoFocus
        />

        <View style={styles.passwordWrapper}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor={Colors.textTertiary}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={() => canSubmit && handleLogin()}
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
          onPress={handleLogin}
          disabled={!canSubmit || loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color={Colors.background} />
            : <Text style={styles.ctaText}>Sign in</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.forgotLink}
          onPress={handleForgotPassword}
          activeOpacity={0.7}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchLink}
          onPress={() => router.push('/(auth)/signup')}
          activeOpacity={0.7}
        >
          <Text style={styles.switchText}>
            New to Lumé?{' '}
            <Text style={styles.switchTextBold}>Create account</Text>
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
    fontSize:     Typography.size.xxl,
    color:        Colors.cream,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize:     Typography.size.base,
    color:        Colors.textSecondary,
    marginBottom: Spacing.xxl,
    lineHeight:   20,
  },

  input: {
    backgroundColor:   Colors.surface,
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.md,
    fontSize:          Typography.size.md,
    color:             Colors.cream,
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
    fontSize:          Typography.size.md,
    color:             Colors.cream,
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
    backgroundColor: Colors.gold,
    borderRadius:    Radius.input,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginTop:       Spacing.sm,
    marginBottom:    Spacing.md,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: {
    fontSize:   Typography.size.md,
    fontWeight: '600',
    color:      Colors.background,
  },

  forgotLink: {
    alignItems:      'center',
    paddingVertical: Spacing.sm,
    marginBottom:    Spacing.md,
  },
  forgotText: {
    fontSize: Typography.size.base,
    color:    Colors.gold,
  },

  switchLink: {
    alignItems:      'center',
    paddingVertical: Spacing.sm,
  },
  switchText: {
    fontSize: Typography.size.base,
    color:    Colors.textSecondary,
  },
  switchTextBold: {
    color:      Colors.cream,
    fontWeight: '600',
  },
});
