// MakeupDetailScreen — single-screen palette + shade families.
// Translated from design/source/screens-extra-1.jsx:294-373. The "Shade IDs"
// section in the source is replaced with a "Shade families" section that
// renders the ShadeFamilyRow component over the four canonical families
// (foundation, lip, blush, concealer) — per founder direction, brand-named
// SKUs are out of scope for v1.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton, Body, ChapterLabel, Display, PrimaryButton } from '../components/editorial';
import { ShadeFamilyRow, SwatchDetailSheet, TraitChip } from '../components/detail';
import { Palette } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { errorToMessage } from '../lib/errors';
import type {
  MakeupPalette,
  MakeupRecommendation,
  MakeupSwatch,
  Recommendations,
  User,
} from '../types';

const ITALIC = {
  fontFamily: 'CormorantGaramond_500Medium_Italic',
  fontStyle: 'italic' as const,
};

const FAMILY_LABEL: Record<keyof MakeupPalette['shade_families'], string> = {
  foundation: 'Foundation',
  lip:        'Lip',
  blush:      'Blush',
  concealer:  'Concealer',
};

interface ScanRow {
  id:               string;
  recommendations:  Recommendations | null;
  skin_undertone:   string | null;
}

type UserContext = Pick<User, 'care_categories'> & {
  makeup_recommendations?: MakeupRecommendation | null;
};

// Compose the display title from palette.hero_line. Splits on the first comma
// so the first phrase reads italic ("A warm,") and the rest sits upright
// ("medium palette."). Falls back to a neutral default.
function deriveTitle(palette: MakeupPalette | null, undertone: string | null): {
  italic: string;
  rest:   string;
} {
  if (palette?.hero_line) {
    const text = palette.hero_line.replace(/\.$/, '');
    const idx = text.indexOf(',');
    if (idx > -1) {
      return {
        italic: text.slice(0, idx + 1),
        rest:   `${text.slice(idx + 1).trim()}.`,
      };
    }
    return { italic: text + ',', rest: 'palette.' };
  }
  if (undertone) {
    return {
      italic: `A ${undertone},`,
      rest:   'medium palette.',
    };
  }
  return { italic: 'A quiet,', rest: 'considered palette.' };
}

export default function MakeupDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scanId?: string }>();
  const paramScanId = typeof params.scanId === 'string' ? params.scanId : null;

  const [scan, setScan]                 = useState<ScanRow | null>(null);
  const [user, setUser]                 = useState<UserContext | null>(null);
  const [loading, setLoading]           = useState(true);
  const [errorMsg, setErr]              = useState<string | null>(null);
  const [selectedSwatch, setSelected]   = useState<MakeupSwatch | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const authUserId = authData.user?.id;
        if (!authUserId) {
          if (!cancelled) { setErr('Not signed in.'); setLoading(false); }
          return;
        }

        const userPromise = supabase
          .from('users')
          .select('care_categories, makeup_recommendations')
          .eq('id', authUserId)
          .single();

        const scanPromise = paramScanId
          ? supabase
              .from('scans')
              .select('id, recommendations, skin_undertone')
              .eq('id', paramScanId)
              .single()
          : supabase
              .from('scans')
              .select('id, recommendations, skin_undertone')
              .eq('user_id', authUserId)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

        const [{ data: userData, error: uErr }, { data: scanData, error: sErr }] =
          await Promise.all([userPromise, scanPromise]);
        if (cancelled) return;
        if (uErr) throw new Error(uErr.message ?? 'Database error');
        if (sErr) throw new Error(sErr.message ?? 'Database error');

        setUser(userData as UserContext);
        setScan(scanData as ScanRow);
      } catch (err) {
        if (!cancelled) setErr(errorToMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [paramScanId]);

  // Prefer the canonical user-level recs (Phase 4B.2). Fall back to the
  // legacy per-scan recs for scans created before makeup moved to user level.
  const makeup: MakeupRecommendation | null =
    user?.makeup_recommendations ?? scan?.recommendations?.makeup ?? null;
  const palette: MakeupPalette | null = makeup?.palette ?? null;

  const titleParts = useMemo(
    () => deriveTitle(palette, scan?.skin_undertone ?? null),
    [palette, scan],
  );

  const traitChips = useMemo<string[]>(() => {
    if (palette?.trait_chips && palette.trait_chips.length > 0) {
      return palette.trait_chips.slice(0, 3);
    }
    const chips: string[] = [];
    if (scan?.skin_undertone) chips.push(`${scan.skin_undertone} undertone`);
    if (palette?.depth_tier)  chips.push(`${palette.depth_tier.replace(/_/g, ' ')} depth`);
    return chips;
  }, [palette, scan]);

  const swatchSize = useMemo(() => {
    const screenWidth = Dimensions.get('window').width;
    // Padding 32 + 32 horizontal, gap 8 between 6 swatches → 5 gaps
    const usable = screenWidth - 64 - 5 * 8;
    return Math.max(36, Math.floor(usable / 6));
  }, []);

  const wantsMakeup = user?.care_categories?.includes('makeup') ?? false;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Palette.accent} />
          </View>
        ) : errorMsg ? (
          <FallbackState message={errorMsg} onBack={() => router.back()} />
        ) : !wantsMakeup || !makeup ? (
          <FallbackState
            message="Makeup is not enabled for your profile."
            onBack={() => router.back()}
          />
        ) : (
          <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 48 }}>
            <View style={{ paddingHorizontal: 28 }}>
              <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
            </View>

            <View style={{ paddingTop: 24, paddingHorizontal: 32 }}>
              <ChapterLabel>Part four · makeup</ChapterLabel>
              <Display
                style={{
                  marginTop:     14,
                  fontSize:      34,
                  lineHeight:    37,
                  letterSpacing: -0.3,
                }}
              >
                <Text style={ITALIC}>{titleParts.italic}</Text>{'\n'}{titleParts.rest}
              </Display>

              {traitChips.length > 0 && (
                <View
                  style={{
                    marginTop:     22,
                    flexDirection: 'row',
                    flexWrap:      'wrap',
                    gap:           8,
                  }}
                >
                  {traitChips.map(c => <TraitChip key={c}>{c}</TraitChip>)}
                </View>
              )}

              <Body serif size={14.5} style={{ marginTop: 24, lineHeight: 24 }}>
                {makeup.advice}
              </Body>

              {palette && palette.swatches.length > 0 && (
                <View style={{ marginTop: 30 }}>
                  <ChapterLabel style={{ marginBottom: 14 }}>Shades that flatter</ChapterLabel>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {palette.swatches.slice(0, 6).map((sw, i) => {
                      // Legacy scans (pre-2026-04-26) store swatches as bare hex strings.
                      // New scans store MakeupSwatch objects — only those are tappable.
                      const isLegacy = typeof sw === 'string';
                      const hex      = isLegacy ? sw : sw.hex;
                      const key      = `${hex}-${i}`;
                      const style = {
                        width:           swatchSize,
                        height:          swatchSize,
                        backgroundColor: hex,
                        borderWidth:     1,
                        borderColor:     'rgba(0,0,0,0.06)',
                      } as const;
                      if (isLegacy) {
                        return <View key={key} style={style} />;
                      }
                      return (
                        <TouchableOpacity
                          key={key}
                          activeOpacity={0.75}
                          onPress={() => setSelected(sw)}
                          style={style}
                        />
                      );
                    })}
                  </View>
                </View>
              )}

              {palette?.shade_families && (
                <View style={{ marginTop: 30 }}>
                  <ChapterLabel style={{ marginBottom: 14 }}>Shade families</ChapterLabel>
                  {(['foundation', 'lip', 'blush', 'concealer'] as const).map((key, i, arr) => {
                    const desc = palette.shade_families[key];
                    if (!desc) return null;
                    return (
                      <ShadeFamilyRow
                        key={key}
                        category={FAMILY_LABEL[key]}
                        description={desc}
                        last={i === arr.length - 1}
                      />
                    );
                  })}
                </View>
              )}
            </View>

            <View style={{ height: 32 }} />
          </ScrollView>
        )}

        <SwatchDetailSheet
          visible={selectedSwatch !== null}
          onClose={() => setSelected(null)}
          swatch={selectedSwatch}
        />
      </SafeAreaView>
    </>
  );
}

function FallbackState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingVertical: 8, paddingHorizontal: 28 }}>
        <BackButton onPress={onBack} style={{ marginLeft: -8 }} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: 'center' }}>
        <ChapterLabel>A moment</ChapterLabel>
        <View style={{ height: 14 }} />
        <Display size="small">
          <Display size="small" italic>Not quite</Display>
          {'\n'}ready yet.
        </Display>
        <View style={{ height: 16 }} />
        <Body serif size={14} style={{ fontStyle: 'italic' }}>
          {message}
        </Body>
        <View style={{ height: 30 }} />
        <PrimaryButton label="Back" onPress={onBack} />
      </View>
    </View>
  );
}
