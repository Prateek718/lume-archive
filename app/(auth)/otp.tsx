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

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Enter email', 'Please enter your email address.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Reset link sent', 'Check your inbox for a password reset link.');
    }
  };

  const canSubmit = email.trim().length > 0;

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

        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          Enter your email address and we'll send you a reset link
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          returnKeyType="go"
          onSubmitEditing={() => canSubmit && !loading && handleReset()}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.ctaButton, (!canSubmit || loading) && styles.ctaDisabled]}
          onPress={handleReset}
          disabled={!canSubmit || loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color={Colors.background} />
            : <Text style={styles.ctaText}>Send reset link</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backLink}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← Back to sign in</Text>
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

  backLink: {
    alignItems:      'center',
    paddingVertical: Spacing.sm,
  },
  backText: {
    fontSize: Typography.size.base,
    color:    Colors.gold,
  },
});
