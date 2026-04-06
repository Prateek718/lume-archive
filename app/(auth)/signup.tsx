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

export default function SignupScreen() {
  const router = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

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

    setLoading(false);
    router.replace('/(auth)/onboarding');
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

        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Join Lumé and discover your grooming potential</Text>

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

        <TextInput
          style={styles.input}
          placeholder="Password (min. 6 characters)"
          placeholderTextColor={Colors.textTertiary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          returnKeyType="go"
          onSubmitEditing={() => canSubmit && handleSignUp()}
        />

        <TouchableOpacity
          style={[styles.ctaButton, !canSubmit && styles.ctaDisabled]}
          onPress={handleSignUp}
          disabled={!canSubmit || loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color={Colors.background} />
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

  ctaButton: {
    backgroundColor: Colors.gold,
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
    color:      Colors.background,
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
