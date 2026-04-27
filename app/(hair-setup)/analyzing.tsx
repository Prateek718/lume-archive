// Hair setup · terminal — fires Gemini hair recs generation, then routes
// to /hair-detail. On error, routes to /hair-detail with an error param so
// the detail screen can show its fallback state.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useHairSetup, toHairProfile } from './_layout';
import {
  Body,
  ChapterLabel,
  Display,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { generateAndSaveHairProfile } from '../../services/scanService';

const ITALIC = {
  fontFamily: 'CormorantGaramond_500Medium_Italic',
  fontStyle: 'italic' as const,
};

export default function HairAnalyzing() {
  const router = useRouter();
  const { state, reset } = useHairSetup();
  const startedRef = useRef(false);
  const [statusLine, setStatusLine] = useState('Reading your scalp pattern…');

  useEffect(() => {
    // Guard against StrictMode double-fire and any router-back re-mount.
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    const lines = [
      'Reading your scalp pattern…',
      'Matching shampoos and conditioners…',
      'Drafting a wash rhythm…',
      'Putting together a short routine…',
    ];
    let idx = 0;
    const tick = setInterval(() => {
      if (cancelled) return;
      idx = (idx + 1) % lines.length;
      setStatusLine(lines[idx]);
    }, 2400);

    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) throw new Error('Not signed in.');

        // Latest scan supplies face_shape — optional, may be null.
        const { data: scanRow } = await supabase
          .from('scans')
          .select('face_shape')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const faceShape = (scanRow?.face_shape as string | null) ?? null;

        const profile = toHairProfile(state);
        await generateAndSaveHairProfile(userId, profile, faceShape);

        if (cancelled) return;
        clearInterval(tick);
        reset();
        router.replace('/hair-detail');
      } catch (err) {
        if (cancelled) return;
        clearInterval(tick);
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[hair-setup/analyzing] failed:', msg);
        reset();
        router.replace({ pathname: '/hair-detail', params: { error: msg } });
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: 'center' }}>
          <ChapterLabel>Hair · reading</ChapterLabel>
          <View style={{ height: 14 }} />
          <Display size="large">
            We're <Display size="large" italic>studying</Display>{'\n'}your hair.
          </Display>
          <View style={{ height: 22 }} />
          <Body serif size={14.5} style={{ lineHeight: 24, maxWidth: 280 }}>
            A short pause. About ten seconds — we're matching your profile to a small,
            specific care plan.
          </Body>
          <View style={{ height: 36 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={Palette.accent} />
            <Body serif size={13} style={ITALIC}>{statusLine}</Body>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
