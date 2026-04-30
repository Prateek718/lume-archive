// MyBrandsScreen — sectioned brand picker. Filters the 58-brand catalogue
// down to archetypes that serve the user's care_categories, groups by
// archetype, and toggles selection into users.preferred_brands_v2. A brand
// is written into every sub-list (skin/hair/beard/makeup) its archetype
// serves, so scoring downstream finds the preference regardless of section.

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton, Body, ChapterLabel, Display,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import {
  ARCHETYPE_TO_CARE, getFilteredBrandsByArchetype,
  type ArchetypeGroup,
} from '../../lib/brandData';
import type { PreferredBrands } from '../../types';
import type { CategoryGroup } from '../../constants/productConstants';

const EMPTY_PREFS: PreferredBrands = { skin: [], hair: [], makeup: [], beard: [] };

function brandUnion(prefs: PreferredBrands): Set<string> {
  return new Set<string>([
    ...(prefs.skin   ?? []),
    ...(prefs.hair   ?? []),
    ...(prefs.makeup ?? []),
    ...(prefs.beard  ?? []),
  ]);
}

function withBrandToggled(
  prefs: PreferredBrands,
  brand: string,
  cares: CategoryGroup[],
  on: boolean,
): PreferredBrands {
  const next: PreferredBrands = {
    skin:   [...(prefs.skin   ?? [])],
    hair:   [...(prefs.hair   ?? [])],
    makeup: [...(prefs.makeup ?? [])],
    beard:  [...(prefs.beard  ?? [])],
  };
  for (const c of cares) {
    const list = next[c] ?? [];
    if (on && !list.includes(brand)) list.push(brand);
    if (!on) {
      const idx = list.indexOf(brand);
      if (idx >= 0) list.splice(idx, 1);
    }
    next[c] = list;
  }
  return next;
}

export default function MyBrandsScreen() {
  const router = useRouter();
  const [userId, setUserId]       = useState<string | null>(null);
  const [careCats, setCareCats]   = useState<CategoryGroup[] | null>(null);
  const [prefs, setPrefs]         = useState<PreferredBrands>(EMPTY_PREFS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth.user?.id;
      if (!id) { if (!cancelled) setCareCats([]); return; }
      const { data } = await supabase.from('users')
        .select('care_categories, preferred_brands_v2')
        .eq('id', id).single();
      if (cancelled) return;

      const row = data as {
        care_categories?: CategoryGroup[] | null;
        preferred_brands_v2?: PreferredBrands | null;
      } | null;
      setUserId(id);
      setCareCats(row?.care_categories ?? []);
      setPrefs(row?.preferred_brands_v2 ?? EMPTY_PREFS);
    })();
    return () => { cancelled = true; };
  }, []);

  const groups: ArchetypeGroup[] = useMemo(() => {
    if (!careCats) return [];
    return getFilteredBrandsByArchetype(careCats);
  }, [careCats]);

  const selected = useMemo(() => brandUnion(prefs), [prefs]);

  const toggle = async (brand: string, archetype: string) => {
    if (!userId) return;
    const cares = ARCHETYPE_TO_CARE[archetype] ?? [];
    const turnOn = !selected.has(brand);
    const prior = prefs;
    const nextPrefs = withBrandToggled(prefs, brand, cares, turnOn);
    setPrefs(nextPrefs);
    const { error } = await supabase.from('users')
      .update({ preferred_brands_v2: nextPrefs }).eq('id', userId);
    if (error) {
      console.error('[my-brands] write failed', error);
      setPrefs(prior);
    }
  };

  if (careCats === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 28, paddingVertical: 8 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <ChapterLabel>Brands you trust</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 30, lineHeight: 33 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>We&apos;ll lean</Text>
            {'\n'}toward these.
          </Display>
          <Body serif size={14} style={{ marginTop: 16, lineHeight: 22, fontStyle: 'italic' }}>
            When two products are otherwise equal, we&apos;ll lean toward a brand you&apos;ve marked as trusted.
          </Body>
        </View>

        {groups.length === 0 ? (
          <View style={{ paddingTop: 36, paddingHorizontal: 32 }}>
            <Body serif size={14} style={{ lineHeight: 22, fontStyle: 'italic', color: Palette.ink2 }}>
              No brands to show. Update your care preferences in onboarding.
            </Body>
          </View>
        ) : (
          groups.map((g, gi) => (
            <View key={g.archetype} style={{
              paddingTop: gi === 0 ? 26 : 24,
              paddingHorizontal: 32,
            }}>
              <ChapterLabel style={{ marginBottom: 12 }}>{g.archetype}</ChapterLabel>
              {g.brands.map((b, i) => {
                const on = selected.has(b);
                return (
                  <BrandRow
                    key={b}
                    name={b}
                    on={on}
                    first={i === 0}
                    last={i === g.brands.length - 1}
                    onPress={() => void toggle(b, g.archetype)}
                  />
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

interface BrandRowProps {
  name:    string;
  on:      boolean;
  first:   boolean;
  last:    boolean;
  onPress: () => void;
}

function BrandRow({ name, on, first, last, onPress }: BrandRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        paddingVertical:    16,
        borderTopWidth:     first ? 1 : 1,
        borderTopColor:     Palette.rule,
        borderBottomWidth:  last ? 1 : 0,
        borderBottomColor:  Palette.rule,
        flexDirection:      'row',
        justifyContent:     'space-between',
        alignItems:         'center',
      }}
    >
      <Text
        style={{
          fontFamily: on
            ? 'CormorantGaramond_500Medium_Italic'
            : 'CormorantGaramond_400Regular',
          fontStyle:  on ? 'italic' : 'normal',
          fontSize:   18,
          color:      Palette.ink,
        }}
      >
        {name}
      </Text>
      <View
        style={{
          width: 18, height: 18, borderRadius: 9,
          backgroundColor: on ? Palette.accent : 'transparent',
          borderWidth:     on ? 0 : 1.5,
          borderColor:     Palette.rule,
          alignItems:      'center',
          justifyContent:  'center',
        }}
      >
        {on && (
          <Svg width={10} height={8} viewBox="0 0 12 9">
            <Path
              d="M1 4.5L4.5 8L11 1"
              stroke={Palette.onScanBg}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        )}
      </View>
    </TouchableOpacity>
  );
}
