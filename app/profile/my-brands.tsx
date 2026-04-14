// My Brands screen — user selects preferred brands for product recommendations.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

const BRAND_SECTIONS: { title: string; brands: string[] }[] = [
  {
    title: 'SKINCARE',
    brands: [
      'Minimalist', 'Mamaearth', 'Plum', 'WOW Skin Science',
      'Dot & Key', 'Cetaphil', 'Neutrogena', 'Garnier', 'Nivea',
      'L\'Oréal Paris', 'Biotique', 'Himalaya', 'mCaffeine',
      'The Derma Co', 'Lakme',
    ],
  },
  {
    title: 'HAIR',
    brands: [
      'TRESemmé', 'Dove', 'Indulekha', 'Mamaearth', 'WOW Skin Science',
      'L\'Oréal Paris', 'Pantene', 'Head & Shoulders', 'Garnier',
      'Biotique', 'Himalaya', 'Matrix', 'Schwarzkopf',
    ],
  },
  {
    title: 'MAKEUP',
    brands: [
      'Lakme', 'Maybelline', 'NYX', 'Nykaa', 'Swiss Beauty',
      'Colorbar', 'Elle 18', 'Faces Canada', 'Blue Heaven',
      'Lotus Herbals', 'Chambor',
    ],
  },
];

export default function MyBrandsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('preferred_brands')
        .eq('id', user.id)
        .single();
      const row = data as { preferred_brands?: string[] } | null;
      setSelectedBrands(row?.preferred_brands ?? []);
    };
    load();
  }, []);

  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev =>
      prev.includes(brand)
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase
      .from('users')
      .update({ preferred_brands: selectedBrands })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Could not save preferences. Please try again.');
      return;
    }
    Alert.alert('Saved', 'Brand preferences saved', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.screenTitle}>My brands</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={s.subtitle}>We'll prioritise these in your recommendations</Text>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {BRAND_SECTIONS.map(section => (
          <View key={section.title} style={s.section}>
            <Text style={s.sectionLabel}>{section.title}</Text>
            <View style={s.pillsWrap}>
              {section.brands.map(brand => {
                const selected = selectedBrands.includes(brand);
                return (
                  <TouchableOpacity
                    key={brand}
                    style={[s.pill, selected && s.pillSelected]}
                    onPress={() => toggleBrand(brand)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.pillText, selected && s.pillTextSelected]}>
                      {brand}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={s.note}>
          Tap to select · selected brands appear first in your recommendations
        </Text>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color={Colors.background} />
            : <Text style={s.saveBtnText}>Save preferences</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
  },
  backArrow:   { fontSize: 32, color: Colors.gold, lineHeight: 40 },
  screenTitle: { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream },

  subtitle: {
    fontSize: 13, color: Colors.textSecondary,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },

  section:      { marginBottom: Spacing.lg },
  sectionLabel: {
    fontSize: 10, color: Colors.gold, letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: Spacing.sm,
  },
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  pill: {
    backgroundColor: '#1A1412',
    borderWidth: 1, borderColor: '#2A2420',
    borderRadius: Radius.pill,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  pillSelected: {
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderColor: 'rgba(201,168,76,0.35)',
  },
  pillText:         { fontSize: 12, color: '#4A4540' },
  pillTextSelected: { color: '#C9A84C' },

  note: {
    fontSize: 10, color: '#4A4540', textAlign: 'center',
    marginTop: Spacing.sm, marginBottom: Spacing.sm,
  },

  footer: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  saveBtn: {
    backgroundColor: Colors.gold, borderRadius: Radius.input,
    paddingVertical: Spacing.md, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText:     { fontSize: Typography.size.md, fontWeight: '600', color: Colors.background },
});
