// My Brands screen — user selects preferred brands per category for product recommendations.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { PRODUCTS } from '../../constants/productConstants';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { refreshRecommendations } from '../../services/scanService';
import type { PreferredBrands } from '../../types';

// ── Derive brand lists from the product catalogue ──────────────────────────────

const SKIN_CATEGORIES = [
  'face_cleanser', 'toner', 'moisturiser',
  'spf_sunscreen', 'serum_vitamin_c',
  'serum_niacinamide', 'serum_retinol',
  'eye_cream', 'face_mask', 'lip_balm',
];

const HAIR_CATEGORIES = [
  'shampoo', 'conditioner', 'hair_oil',
  'hair_mask', 'hair_serum', 'scalp_serum',
  'leave_in_conditioner',
];

const MAKEUP_CATEGORIES = [
  'foundation_fair', 'foundation_medium',
  'foundation_deep', 'kajal_eyeliner',
  'eyebrow_pencil', 'face_primer',
  'lipstick_nude', 'lipstick_red', 'lipstick_berry',
];

function getBrandsForCategories(cats: string[]): string[] {
  return [...new Set(
    PRODUCTS
      .filter(p => cats.includes(p.category))
      .map(p => p.brand),
  )].sort();
}

const SKIN_BRANDS   = getBrandsForCategories(SKIN_CATEGORIES);
const HAIR_BRANDS   = getBrandsForCategories(HAIR_CATEGORIES);
const MAKEUP_BRANDS = getBrandsForCategories(MAKEUP_CATEGORIES);

const BRAND_SECTIONS: { title: string; key: 'skin' | 'hair' | 'makeup'; brands: string[] }[] = [
  { title: 'SKINCARE', key: 'skin',   brands: SKIN_BRANDS   },
  { title: 'HAIR',     key: 'hair',   brands: HAIR_BRANDS   },
  { title: 'MAKEUP',   key: 'makeup', brands: MAKEUP_BRANDS },
];

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function MyBrandsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedBrands, setSelectedBrands] = useState<PreferredBrands>({
    skin: [], hair: [], makeup: [],
  });
  const [saving,     setSaving]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('preferred_brands_v2')
        .eq('id', user.id)
        .single();
      const row = data as { preferred_brands_v2?: PreferredBrands } | null;
      setSelectedBrands(
        row?.preferred_brands_v2 ?? { skin: [], hair: [], makeup: [] },
      );
    };
    load();
  }, []);

  const toggleBrand = (brand: string, sectionKey: 'skin' | 'hair' | 'makeup') => {
    setSelectedBrands(prev => {
      const list = prev[sectionKey];
      return {
        ...prev,
        [sectionKey]: list.includes(brand)
          ? list.filter(b => b !== brand)
          : [...list, brand],
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase
      .from('users')
      .update({ preferred_brands_v2: selectedBrands })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Could not save preferences. Please try again.');
      return;
    }
    Alert.alert(
      'Saved',
      'Brand preferences saved. Refresh your recommendations to apply the new brands?',
      [
        { text: 'Done', style: 'cancel', onPress: () => router.back() },
        {
          text: 'Refresh recommendations',
          onPress: async () => {
            setRefreshing(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const scanId = await refreshRecommendations(user.id);
                router.replace({
                  pathname: '/recommendations',
                  params: { scanId },
                });
              }
            } catch {
              Alert.alert('Error', 'Could not refresh recommendations. Please try again.');
            } finally {
              setRefreshing(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

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
        {BRAND_SECTIONS.map(section => {
          const sectionKey = section.key;
          return (
            <View key={section.title} style={s.section}>
              <Text style={s.sectionLabel}>{section.title}</Text>
              <View style={s.pillsWrap}>
                {section.brands.map(brand => {
                  const selected = selectedBrands[sectionKey].includes(brand);
                  return (
                    <TouchableOpacity
                      key={brand}
                      style={[s.pill, selected && s.pillSelected]}
                      onPress={() => toggleBrand(brand, sectionKey)}
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
          );
        })}

        <Text style={s.note}>
          Tap to select · selected brands appear first in your recommendations
        </Text>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {refreshing && (
        <View style={s.refreshOverlay}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={s.refreshText}>Refreshing recommendations…</Text>
        </View>
      )}

      <View style={[s.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color={Colors.textOnAccent} />
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
  backArrow:   { fontSize: 32, color: Colors.text, lineHeight: 40 },
  screenTitle: { fontFamily: Typography.serif, fontSize: 22, color: Colors.text },

  subtitle: {
    fontSize: 13, color: Colors.text2,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },

  section:      { marginBottom: Spacing.lg },
  sectionLabel: {
    fontSize: 10, color: Colors.text, letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: Spacing.sm,
  },
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  pill: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  pillSelected: {
    backgroundColor: Colors.accentTintMedium,
    borderColor: Colors.accentTintBorderStrong,
  },
  pillText:         { fontSize: 13, color: Colors.text },
  pillTextSelected: { color: Colors.accent },

  note: {
    fontSize: 11, color: Colors.text2, textAlign: 'center',
    marginTop: Spacing.sm, marginBottom: Spacing.sm,
  },

  footer: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  saveBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.input,
    paddingVertical: Spacing.md, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText:     { fontSize: Typography.size.md, fontWeight: '600', color: Colors.textOnAccent },

  refreshOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlayDark,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
  },
  refreshText: {
    marginTop: Spacing.md, fontSize: 14,
    color: Colors.text, fontFamily: Typography.serif,
  },
});
