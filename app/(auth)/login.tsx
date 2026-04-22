import { useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '../../lib/supabase';
import {
  BackButton,
  ChapterLabel,
  Display,
  PrimaryButton,
  Rule,
  TextLink,
  GoogleSignInButton,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';

const italicStyle = {
  fontFamily: 'CormorantGaramond_500Medium_Italic',
  fontStyle: 'italic' as const,
};

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    // Routing handled by the root auth listener.
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
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      setError(err?.message ?? 'Google sign-in failed.');
    }
  };

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
          <ChapterLabel>Returning reader</ChapterLabel>
          <View style={{ height: 16 }} />
          <Display size="default" style={{ fontSize: 38 }}>
            <Text style={italicStyle}>Welcome</Text>
            {'\n'}back.
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

          <TouchableOpacity onPress={() => router.push('/(auth)/reset')} style={{ paddingVertical: 6, marginTop: 12 }}>
            <Text
              style={{
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle: 'italic',
                fontSize: 13,
                color: Palette.ink3,
              }}
            >
              Forgot your password?
            </Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          {error && (
            <Text style={{ marginBottom: 18, color: Palette.danger, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
              {error}
            </Text>
          )}

          <PrimaryButton
            label={submitting ? 'Signing in…' : 'Sign in →'}
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
            <TextLink label="Need an account? → sign up" onPress={() => router.push('/(auth)/signup')} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
