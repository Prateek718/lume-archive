import { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '../../lib/supabase';
import {
  BackButton,
  ChapterLabel,
  Display,
  Body,
  PrimaryButton,
  Rule,
  TextLink,
  GoogleSignInButton,
} from '../../components/editorial';
import { Palette, Type } from '../../constants/theme';

const italicStyle = {
  fontFamily: 'CormorantGaramond_500Medium_Italic',
  fontStyle: 'italic' as const,
};

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length >= 8 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: 'lume://auth/callback' },
    });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setSentTo(email.trim());
  };

  const resend = async () => {
    if (!sentTo) return;
    await supabase.auth.resend({ type: 'signup', email: sentTo });
  };

  const handleGoogleSignIn = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo: any = await GoogleSignin.signIn();
      const idToken = userInfo?.data?.idToken || userInfo?.idToken;
      if (!idToken) throw new Error('No ID token returned from Google');
      const { error: idtError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (idtError) throw idtError;
      // Routing handled by the root auth listener.
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      setError(err?.message ?? 'Google sign-in failed.');
    }
  };

  if (sentTo) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
          <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 60, paddingBottom: 40 }}>
            <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            <View style={{ height: 32 }} />
            <ChapterLabel>One more thing</ChapterLabel>
            <View style={{ height: 16 }} />
            <Display size="small" style={{ fontSize: 30 }}>
              Check your <Text style={italicStyle}>inbox</Text>.
            </Display>
            <View style={{ height: 22 }} />
            <Body serif>
              We've sent a confirmation link to {sentTo}. Tap it to continue.
            </Body>
            <View style={{ height: 24 }} />
            <View style={{ opacity: 0.7 }}>
              <TextLink label="Resend →" onPress={resend} />
            </View>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 60, paddingBottom: 40, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />

          <View style={{ height: 32 }} />
          <ChapterLabel>First time here</ChapterLabel>
          <View style={{ height: 16 }} />
          <Display size="default" style={{ fontSize: 38 }}>
            <Text style={italicStyle}>Begin</Text>
            {'\n'}a quiet habit.
          </Display>

          <View style={{ height: 42 }} />

          <Text
            style={{
              fontFamily: 'Inter_500Medium',
              fontSize: 10,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              color: Palette.ink3,
            }}
          >
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={Palette.ink4}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={{
              fontSize: 18,
              fontFamily: 'Inter_400Regular',
              color: Palette.ink,
              borderBottomWidth: 1,
              borderBottomColor: Palette.rule,
              paddingVertical: 10,
              marginTop: 6,
            }}
          />

          <View style={{ height: 24 }} />

          <Text
            style={{
              fontFamily: 'Inter_500Medium',
              fontSize: 10,
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              color: Palette.ink3,
            }}
          >
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            placeholder="••••••••"
            placeholderTextColor={Palette.ink4}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              fontSize: 18,
              fontFamily: 'Inter_400Regular',
              color: Palette.ink,
              borderBottomWidth: 1,
              borderBottomColor: Palette.rule,
              paddingVertical: 10,
              marginTop: 6,
            }}
          />
          {passwordFocused && (
            <Text style={[Type.body, { fontSize: 11, color: Palette.ink3, marginTop: 8 }]}>
              At least 8 characters
            </Text>
          )}

          <View style={{ flex: 1 }} />

          {error && (
            <Text style={{ marginBottom: 18, color: Palette.danger, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
              {error}
            </Text>
          )}

          <PrimaryButton
            label={submitting ? 'Creating account…' : 'Create account →'}
            onPress={submit}
            disabled={!canSubmit}
          />

          <View style={{ height: 22 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Rule length="short" />
            <Text
              style={{
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle: 'italic',
                fontSize: 14,
                color: Palette.ink3,
              }}
            >
              or
            </Text>
            <Rule length="short" />
          </View>
          <View style={{ height: 22 }} />
          <GoogleSignInButton onPress={handleGoogleSignIn} disabled={submitting} />

          <View style={{ height: 28 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            <TextLink label="Already a reader? → sign in" onPress={() => router.push('/(auth)/login')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
