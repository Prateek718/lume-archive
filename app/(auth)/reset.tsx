import { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  BackButton,
  ChapterLabel,
  Display,
  Body,
  PrimaryButton,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';

const italicStyle = {
  fontFamily: 'CormorantGaramond_500Medium_Italic',
  fontStyle: 'italic' as const,
};

export default function Reset() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const canSubmit = email.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'lume://auth/callback',
    });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
          <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 60, paddingBottom: 40 }}>
            <BackButton onPress={() => router.replace('/(auth)/login')} style={{ marginLeft: -8 }} />
            <View style={{ height: 32 }} />
            <ChapterLabel>Check your inbox</ChapterLabel>
            <View style={{ height: 16 }} />
            <Display size="small" style={{ fontSize: 30 }}>
              A link is <Text style={italicStyle}>on its way</Text>.
            </Display>
            <View style={{ height: 22 }} />
            <Body serif>
              If the email exists, you'll see a reset link shortly. Close this and check your email.
            </Body>
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
          <BackButton onPress={() => router.replace('/(auth)/login')} style={{ marginLeft: -8 }} />

          <View style={{ height: 32 }} />
          <ChapterLabel>Recover access</ChapterLabel>
          <View style={{ height: 16 }} />
          <Display size="small" style={{ fontSize: 34 }}>
            <Text style={italicStyle}>We'll send</Text>
            {'\n'}a reset link.
          </Display>

          <View style={{ height: 22 }} />
          <Body serif style={{ fontSize: 14, lineHeight: 22 }}>
            Enter the email you signed up with. A link arrives within a minute.
          </Body>

          <View style={{ height: 36 }} />

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

          <View style={{ flex: 1 }} />

          {error && (
            <Text style={{ marginBottom: 18, color: Palette.danger, fontFamily: 'Inter_400Regular', fontSize: 13 }}>
              {error}
            </Text>
          )}

          <PrimaryButton
            label={submitting ? 'Sending…' : 'Send link'}
            onPress={submit}
            disabled={!canSubmit}
          />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
