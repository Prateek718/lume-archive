import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);

  // Handle deep link callback from password reset email
  useEffect(() => {
    const token = params.token as string;
    const type  = params.type  as string;

    if (token && type === 'recovery') {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          router.replace('/(tabs)/scan');
        }
      });
    }
  }, [params]);

  const handleSendReset = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert('Enter your email', 'Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: 'lume://auth/callback',
      });
      if (error) throw error;
      setSent(true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Could not send reset email.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <StatusBar style="dark" />
        <View style={styles.container}>
          <Text style={styles.title}>Reset password</Text>

          {!sent ? (
            <>
              <Text style={styles.subtitle}>
                Enter your email and we'll send you a reset link
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={Colors.text3}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                returnKeyType="go"
                onSubmitEditing={handleSendReset}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.ctaButton, !email.trim() && styles.ctaDisabled]}
                onPress={handleSendReset}
                disabled={!email.trim() || loading}
                activeOpacity={0.8}
              >
                {loading
                  ? <ActivityIndicator color={Colors.textOnAccent} />
                  : <Text style={styles.ctaText}>Send reset link</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>
                Check your inbox — we've sent a reset link to {email.trim()}
              </Text>
              <View style={styles.sentIcon}>
                <Text style={styles.sentEmoji}>✉️</Text>
              </View>
              <Text style={styles.sentNote}>
                Didn't receive it? Check your spam folder or try again.
              </Text>
              <TouchableOpacity
                style={styles.retryLink}
                onPress={() => setSent(false)}
              >
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.back()}
          >
            <Text style={styles.backText}>← Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: Colors.background },
  flex:      { flex: 1 },
  container: {
    flexGrow:          1,
    justifyContent:    'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.xxxl,
  },
  title: {
    fontFamily:   Typography.serif,
    fontSize:     Typography.size.xxl,
    color:        Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize:     Typography.size.base,
    color:        Colors.text2,
    marginBottom: Spacing.xxl,
    lineHeight:   22,
  },
  input: {
    backgroundColor:   Colors.surface,
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.md,
    fontSize:          Typography.size.md,
    color:             Colors.text,
    marginBottom:      Spacing.md,
  },
  ctaButton: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.input,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginBottom:    Spacing.xl,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: {
    fontSize:   Typography.size.md,
    fontWeight: '600',
    color:      Colors.textOnAccent,
  },
  sentIcon:  { alignItems: 'center', marginVertical: Spacing.xl },
  sentEmoji: { fontSize: 48 },
  sentNote:  {
    fontSize:     Typography.size.sm,
    color:        Colors.text2,
    textAlign:    'center',
    marginBottom: Spacing.xl,
  },
  retryLink: { alignItems: 'center', marginBottom: Spacing.xl },
  retryText: { color: Colors.text, fontSize: Typography.size.base },
  backLink:  { alignItems: 'center', paddingVertical: Spacing.sm },
  backText:  { fontSize: Typography.size.base, color: Colors.text2 },
});
