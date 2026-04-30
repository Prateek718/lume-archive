// HairProfileScreen — three quick pickers (Texture, Wash frequency, Hair
// concerns). Pre-fills from user.hair_profile when present, leaves pickers
// unset when not. Concerns is multi-select with a special "None" mode that
// clears the others. Bottom link routes into the full hair-setup flow for
// users who want to revisit length / scalp / oils / treatment too.

import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BackButton, ChapterLabel, Display, TextLink } from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import type { HairProfile } from '../../types';

// ─── Label ↔ schema mappings ───────────────────────────────────────────────

type TextureValue = NonNullable<HairProfile['texture']>;
type WashValue    = NonNullable<HairProfile['wash_frequency']>;

const TEXTURE_OPTIONS = ['Straight', 'Wavy', 'Curly', 'Coily'] as const;
type TextureLabel = typeof TEXTURE_OPTIONS[number];
const TEXTURE_LABEL_TO_VALUE: Record<TextureLabel, TextureValue> = {
  Straight: 'straight',
  Wavy:     'wavy',
  Curly:    'curly',
  Coily:    'coily',
};
const TEXTURE_VALUE_TO_LABEL: Record<TextureValue, TextureLabel> = {
  straight: 'Straight',
  wavy:     'Wavy',
  curly:    'Curly',
  coily:    'Coily',
};

const WASH_OPTIONS = ['Daily', 'Every 2 days', 'Every 3 days', 'Weekly'] as const;
type WashLabel = typeof WASH_OPTIONS[number];
// Schema buckets are coarser than the labels, so two pairs collapse into the
// same enum. Read-back picks one canonical label per bucket.
const WASH_LABEL_TO_VALUE: Record<WashLabel, WashValue> = {
  'Daily':         'daily',
  'Every 2 days':  'every_2_3_days',
  'Every 3 days':  'every_2_3_days',
  'Weekly':        'once_a_week',
};
const WASH_VALUE_TO_LABEL: Record<WashValue, WashLabel> = {
  daily:             'Daily',
  every_2_3_days:    'Every 2 days',
  once_a_week:       'Weekly',
  less_than_weekly:  'Weekly',
};

const CONCERN_OPTIONS = ['Oily scalp', 'Dry ends', 'Thinning', 'Dandruff', 'None'] as const;
type ConcernLabel = typeof CONCERN_OPTIONS[number];
const NONE_LABEL: ConcernLabel = 'None';
const CONCERN_LABEL_TO_VALUE: Record<Exclude<ConcernLabel, 'None'>, string> = {
  'Oily scalp': 'oily_scalp',
  'Dry ends':   'dry_ends',
  'Thinning':   'hair_fall',
  'Dandruff':   'dandruff',
};
const CONCERN_VALUE_TO_LABEL: Record<string, ConcernLabel> = {
  oily_scalp: 'Oily scalp',
  dry_ends:   'Dry ends',
  hair_fall:  'Thinning',
  thinning:   'Thinning',
  dandruff:   'Dandruff',
};

// Some legacy rows store primary_concern as a single string instead of an
// array — coerce on read.
function readConcernArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  if (typeof raw === 'string' && raw.length > 0) return [raw];
  return [];
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function HairProfileScreen() {
  const router = useRouter();
  const [userId, setUserId]   = useState<string | null>(null);
  const [profile, setProfile] = useState<HairProfile | null>(null);
  const [loaded, setLoaded]   = useState(false);

  const [texture, setTexture]   = useState<TextureLabel | null>(null);
  const [wash, setWash]         = useState<WashLabel | null>(null);
  const [concerns, setConcerns] = useState<Set<ConcernLabel>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth.user?.id;
      if (!id) { if (!cancelled) setLoaded(true); return; }
      const { data } = await supabase.from('users')
        .select('hair_profile').eq('id', id).single();
      if (cancelled) return;

      const hp = (data as { hair_profile?: HairProfile | null } | null)?.hair_profile ?? null;
      setUserId(id);
      setProfile(hp);

      if (hp?.texture && TEXTURE_VALUE_TO_LABEL[hp.texture]) {
        setTexture(TEXTURE_VALUE_TO_LABEL[hp.texture]);
      }
      if (hp?.wash_frequency && WASH_VALUE_TO_LABEL[hp.wash_frequency]) {
        setWash(WASH_VALUE_TO_LABEL[hp.wash_frequency]);
      }
      const concernArr = readConcernArray(hp?.primary_concern);
      if (concernArr.length === 0 && hp != null && Array.isArray(hp.primary_concern)) {
        // Empty array means the user explicitly set "None".
        setConcerns(new Set([NONE_LABEL]));
      } else {
        const labels = concernArr
          .map(v => CONCERN_VALUE_TO_LABEL[v])
          .filter((l): l is ConcernLabel => !!l);
        setConcerns(new Set(labels));
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const writeBack = async (next: {
    texture: TextureLabel | null;
    wash:    WashLabel | null;
    concerns: Set<ConcernLabel>;
  }) => {
    if (!userId) return;

    const concernValues = next.concerns.has(NONE_LABEL)
      ? []
      : Array.from(next.concerns)
          .filter((l): l is Exclude<ConcernLabel, 'None'> => l !== NONE_LABEL)
          .map(l => CONCERN_LABEL_TO_VALUE[l]);

    const updated: HairProfile = {
      hair_length:        profile?.hair_length        ?? 'medium',
      scalp_type:         profile?.scalp_type         ?? 'normal',
      scalp_concern:      profile?.scalp_concern,
      sun_exposure:       profile?.sun_exposure,
      oils_regularly:     profile?.oils_regularly,
      chemically_treated: profile?.chemically_treated ?? 'none',
      texture:            next.texture ? TEXTURE_LABEL_TO_VALUE[next.texture] : profile?.texture,
      wash_frequency:     next.wash    ? WASH_LABEL_TO_VALUE[next.wash]       : profile?.wash_frequency,
      primary_concern:    concernValues,
    };
    const { error } = await supabase.from('users')
      .update({ hair_profile: updated }).eq('id', userId);
    if (error) {
      console.error('[hair-profile] write failed', error);
      return;
    }
    setProfile(updated);
  };

  const onTexture = (v: TextureLabel) => {
    setTexture(v);
    void writeBack({ texture: v, wash, concerns });
  };
  const onWash = (v: WashLabel) => {
    setWash(v);
    void writeBack({ texture, wash: v, concerns });
  };
  const toggleConcern = (v: ConcernLabel) => {
    const next = new Set(concerns);
    if (v === NONE_LABEL) {
      // Tapping "None" clears every other selection. Re-tapping clears it too.
      if (next.has(NONE_LABEL)) next.delete(NONE_LABEL);
      else { next.clear(); next.add(NONE_LABEL); }
    } else {
      // Picking a real concern automatically removes the "None" sentinel.
      next.delete(NONE_LABEL);
      if (next.has(v)) next.delete(v);
      else next.add(v);
    }
    setConcerns(next);
    void writeBack({ texture, wash, concerns: next });
  };

  if (!loaded) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 28, paddingVertical: 8 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <ChapterLabel>Hair profile</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>Fine tuning</Text>
            {'\n'}your routine.
          </Display>
        </View>
        <View style={{ paddingTop: 32, paddingHorizontal: 32 }}>
          <SinglePicker label="Texture"        options={TEXTURE_OPTIONS} value={texture} onChange={onTexture} />
          <SinglePicker label="Wash frequency" options={WASH_OPTIONS}    value={wash}    onChange={onWash} />
          <MultiPicker  label="Hair concerns"  options={CONCERN_OPTIONS} selected={concerns} onToggle={toggleConcern} />
        </View>

        <View style={{ alignItems: 'center', paddingTop: 32, paddingBottom: 24 }}>
          <TextLink
            label="Update full hair profile →"
            onPress={() => router.push('/(hair-setup)/length')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Pickers ───────────────────────────────────────────────────────────────

function Pill({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingVertical:   10,
        paddingHorizontal: 16,
        backgroundColor:   on ? Palette.ink : 'transparent',
        borderWidth:       on ? 0 : 1,
        borderColor:       Palette.rule,
      }}
    >
      <Text
        style={{
          fontFamily: on
            ? 'CormorantGaramond_500Medium_Italic'
            : 'CormorantGaramond_400Regular',
          fontStyle:  on ? 'italic' : 'normal',
          fontSize:   14,
          color:      on ? Palette.onScanBg : Palette.ink2,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface SinglePickerProps<T extends string> {
  label:    string;
  options:  readonly T[];
  value:    T | null;
  onChange: (next: T) => void;
}

function SinglePicker<T extends string>({ label, options, value, onChange }: SinglePickerProps<T>) {
  return (
    <View style={{ marginBottom: 30 }}>
      <ChapterLabel style={{ marginBottom: 14 }}>{label}</ChapterLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(opt => (
          <Pill key={opt} label={opt} on={value === opt} onPress={() => onChange(opt)} />
        ))}
      </View>
    </View>
  );
}

interface MultiPickerProps<T extends string> {
  label:    string;
  options:  readonly T[];
  selected: Set<T>;
  onToggle: (v: T) => void;
}

function MultiPicker<T extends string>({ label, options, selected, onToggle }: MultiPickerProps<T>) {
  return (
    <View style={{ marginBottom: 30 }}>
      <ChapterLabel style={{ marginBottom: 14 }}>{label}</ChapterLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(opt => (
          <Pill key={opt} label={opt} on={selected.has(opt)} onPress={() => onToggle(opt)} />
        ))}
      </View>
    </View>
  );
}
