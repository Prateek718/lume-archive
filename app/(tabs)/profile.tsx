import { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { ChapterLabel, Display, Body, PrimaryButton, TextLink } from '../../components/editorial';
import { Palette } from '../../constants/theme';

export default function Profile() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setEmail(data.user?.email ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // Routing handled by the root auth listener.
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 40 }}>
        <ChapterLabel>Profile · phase seven rebuild</ChapterLabel>
        <View style={{ height: 16 }} />
        <Display size="small">Signed in</Display>
        <View style={{ height: 20 }} />
        <Body serif>{email ?? 'Loading…'}</Body>

        <View style={{ height: 40 }} />
        <PrimaryButton label="New scan" onPress={() => router.push('/scan')} />

        <View style={{ height: 24 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
          <TextLink label="Sign out →" onPress={signOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
