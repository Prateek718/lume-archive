// Skin detail screen — Analysis | Routine | Products tabs.
// Receives scanJson and gender as navigation params.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { getProductMap } from '../services/scanService';
import { supabase } from '../lib/supabase';
import type { Scan, RoutineStep, MatchedProduct } from '../types';
import ProductPickerSheet from '../components/ProductPickerSheet';

type Tab = 'analysis' | 'routine';
type RoutineLevel = 'simple' | 'balanced' | 'full';

// ── Data helpers ───────────────────────────────────────────────────────────────

const SKIN_TYPE_EXPLANATIONS: Record<string, string> = {
  oily:        'Your skin produces more sebum than average, giving it a shiny appearance — especially across the T-zone. Pores may appear larger and you may notice congestion or blackheads around the nose.',
  dry:         'Your skin produces less oil than normal, causing it to feel tight, sometimes flaky, and prone to sensitivity. The moisture barrier needs regular reinforcement to stay comfortable.',
  combination: 'Your skin is oily through the T-zone (forehead, nose, chin) with normal to dry cheeks. Different zones need slightly different treatment — a single heavy moisturiser can worsen oiliness in the centre.',
  normal:      'Your skin is well-balanced with minimal oiliness, few blemishes, and a generally even texture. You have a solid foundation — the goal is maintaining it with a consistent routine.',
  sensitive:   'Your skin reacts easily to products, temperature changes, and environmental stress — redness, tightness, or itching are common signs. Simplicity and fragrance-free formulas are key.',
};

interface ProductItem { icon: string; name: string; why: string; tag: string; }

const CONCERN_SEVERITY: Record<string, number> = {
  acne:         4,
  oiliness:     4,
  pigmentation: 3,
  dark_circles: 3,
  dryness:      3,
  uneven_tone:  3,
};

const PRIORITY_FOCUS: Record<string, string> = {
  acne:         'Address breakouts first — they affect both skin health and confidence. A consistent cleansing and targeted spot treatment routine will deliver the most visible improvement.',
  oiliness:     'Tackle excess oil production first — controlling shine creates a cleaner base for everything else in your routine and reduces breakout risk.',
  pigmentation: 'Focus on pigmentation — sun protection is the single highest-impact change you can make. A vitamin C serum combined with SPF 50 is the most evidence-backed combination.',
  dark_circles: 'Under-eye care is your priority — consistent use of a targeted eye cream morning and night will make the most visible difference over four to six weeks.',
  dryness:      'Hydration is your starting point — a well-reinforced moisture barrier is essential before any other concerns can be addressed properly.',
  uneven_tone:  'Even skin tone first — a vitamin C serum paired with broad-spectrum SPF applied every morning is the most impactful change you can make.',
};

function getSkinProducts(skinType: string | null, concerns: string[] | null): ProductItem[] {
  const spf: ProductItem = {
    icon: '◇',
    name: 'Broad-spectrum SPF 50',
    why: 'The highest-impact product for Indian skin — UV is the leading cause of pigmentation, premature ageing, and uneven tone regardless of skin type. Non-negotiable daily use.',
    tag: 'Protection',
  };

  const byType: Record<string, [ProductItem, ProductItem]> = {
    oily: [
      { icon: '◎', name: 'Salicylic acid cleanser (2% BHA)', why: 'BHA dissolves in oil and penetrates pores to clear congestion from inside — the best choice for oil-prone skin with blackheads.', tag: 'Cleanse' },
      { icon: '◇', name: 'Niacinamide serum (10%)', why: 'Regulates sebum production at the follicle level while minimising pores and gently evening skin tone.', tag: 'Control' },
    ],
    dry: [
      { icon: '◎', name: 'Gentle hydrating cleanser', why: 'A milky or cream cleanser that removes impurities without disturbing the moisture barrier — harsh surfactants worsen dryness.', tag: 'Cleanse' },
      { icon: '◇', name: 'Hyaluronic acid serum', why: 'Binds up to 1,000× its weight in water — apply to damp skin to draw moisture into the surface layers before your moisturiser.', tag: 'Hydration' },
    ],
    combination: [
      { icon: '◎', name: 'Salicylic acid cleanser', why: 'Controls the oily T-zone without over-drying the cheeks — a balanced cleanser for split-skin needs.', tag: 'Cleanse' },
      { icon: '◇', name: 'Lightweight gel moisturiser', why: 'Hydrates drier areas without adding shine to oily zones — texture is the most important factor for combination skin.', tag: 'Hydration' },
    ],
    sensitive: [
      { icon: '◎', name: 'Fragrance-free micellar water', why: 'Removes impurities without rubbing or harsh surfactants — essential for reactive skin that responds poorly to mechanical cleansing.', tag: 'Cleanse' },
      { icon: '◇', name: 'Centella asiatica serum', why: 'Clinically shown to calm redness, support wound healing, and strengthen the skin barrier — one of the best-tolerated actives for sensitive skin.', tag: 'Calm' },
    ],
    normal: [
      { icon: '◎', name: 'Gentle foam cleanser', why: 'Removes daily buildup without stripping — consistency matters more than ingredient intensity when skin is already balanced.', tag: 'Cleanse' },
      { icon: '◇', name: 'Ceramide moisturiser', why: 'Reinforces the natural moisture barrier, locking in hydration and protecting against environmental stress.', tag: 'Maintenance' },
    ],
  };

  const CONCERN_PRODUCTS: Record<string, ProductItem> = {
    acne:         { icon: '◆', name: 'Benzoyl peroxide spot treatment', why: 'Kills acne-causing bacteria directly at the site — apply only to active spots, not all over the face.', tag: 'Acne' },
    pigmentation: { icon: '◇', name: 'Vitamin C serum (10–15%)', why: 'Inhibits melanin production and gradually brightens existing dark spots — always follow with SPF to prevent re-darkening.', tag: 'Brightening' },
    dark_circles: { icon: '◎', name: 'Caffeine eye cream', why: 'Reduces under-eye puffiness and temporarily brightens dark circles by improving microcirculation — apply with ring finger, gently.', tag: 'Eye care' },
    uneven_tone:  { icon: '◇', name: 'Vitamin C serum (10–15%)', why: 'Brightens uneven patches and prevents new melanin formation — a morning serum under SPF is the most effective pairing.', tag: 'Brightening' },
    dryness:      { icon: '◎', name: 'Ceramide + peptide moisturiser', why: 'Ceramides seal the barrier while peptides signal the skin to produce more natural oils — the most targeted fix for persistent dryness.', tag: 'Barrier repair' },
  };

  const baseProducts = byType[skinType ?? 'normal'] ?? byType.normal;
  const firstConcern = (concerns ?? []).find(c => c in CONCERN_PRODUCTS);
  const concernProduct = firstConcern ? CONCERN_PRODUCTS[firstConcern] : null;

  if (concernProduct) {
    return [baseProducts[0], concernProduct, spf];
  }
  return [baseProducts[0], baseProducts[1], spf];
}

function getCategoryForStep(label: string): string {
  const map: Record<string, string> = {
    'Cleanse':    'face_cleanser',
    'Moisturise': 'moisturiser',
    'Protect':    'spf_sunscreen',
    'Brighten':   'serum_vitamin_c',
    'Balance':    'serum_niacinamide',
    'Eye care':   'eye_cream',
    'Treat':      'serum_vitamin_c',
    'Nourish':    'moisturiser',
    'Renew':      'retinol',
    'Smooth':     'aha_exfoliant',
  };
  return map[label] ?? 'face_cleanser';
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function SkinDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanJson, gender = 'man' } = useLocalSearchParams<{ scanJson: string; gender: string }>();
  const scan = scanJson ? (JSON.parse(scanJson) as Scan) : null;
  const rec  = scan?.recommendations;

  const [tab, setTab]                   = useState<Tab>('routine');
  const [routineLevel, setRoutineLevel]   = useState<RoutineLevel>('simple');

  const [pickerVisible,  setPickerVisible]  = useState(false);
  const [pickerCategory, setPickerCategory] = useState('');
  const [pickerStep,     setPickerStep]     = useState('');
  const [pickerReason,   setPickerReason]   = useState('');

  const [productMap, setProductMap] = useState<Record<string, MatchedProduct[]>>({});

  useEffect(() => {
    const loadUserPrefs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('routine_level')
        .eq('id', user.id)
        .single();
      const row = data as { routine_level?: string } | null;
      setRoutineLevel((row?.routine_level as RoutineLevel | undefined) ?? 'simple');
      if (scan?.id) {
        getProductMap(scan.id).then(setProductMap);
      }
    };
    loadUserPrefs();
  }, []);

  const concerns   = (scan?.skin_concerns ?? []).filter(c => c in CONCERN_SEVERITY);
  const topConcern = concerns.sort((a, b) => (CONCERN_SEVERITY[b] ?? 0) - (CONCERN_SEVERITY[a] ?? 0))[0];

  const morningSteps: RoutineStep[] = rec?.skin?.routine?.morning ?? [];
  const eveningSteps: RoutineStep[] = rec?.skin?.routine?.evening ?? [];

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />

      <View style={[s.topBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.screenTitle}>Skin</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.tabBar}>
        {(['analysis', 'routine'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tabPill, tab === t && s.tabPillActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabPillText, tab === t && s.tabPillTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── ANALYSIS ── */}
        {tab === 'analysis' && (
          <>
            <InfoCard title="WHAT WE FOUND">
              {scan?.skin_type && (
                <View style={[s.skinTypePill, { marginBottom: Spacing.md }]}>
                  <Text style={s.skinTypePillText}>{scan.skin_type} skin</Text>
                </View>
              )}
              <Text style={s.bodyText}>
                {SKIN_TYPE_EXPLANATIONS[scan?.skin_type ?? ''] ?? 'Your skin analysis is complete — review your routine for personalised guidance.'}
              </Text>
            </InfoCard>

            {concerns.length > 0 && (
              <InfoCard title="DETECTED CONCERNS">
                {concerns.map(concern => (
                  <View key={concern} style={s.concernRow}>
                    <Text style={s.concernName}>{concern.replace('_', ' ')}</Text>
                    <View style={s.dotsRow}>
                      {[1, 2, 3, 4, 5].map(d => (
                        <View
                          key={d}
                          style={[s.dot, d <= (CONCERN_SEVERITY[concern] ?? 0) && s.dotFilled]}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </InfoCard>
            )}

            {topConcern && (
              <InfoCard title="PRIORITY FOCUS">
                <Text style={s.bodyText}>
                  {PRIORITY_FOCUS[topConcern] ?? 'Focus on consistency — a simple, repeated routine outperforms a complex one done irregularly.'}
                </Text>
              </InfoCard>
            )}
          </>
        )}

        {/* ── ROUTINE ── */}
        {tab === 'routine' && (
          <>
            {rec?.skin?.advice && (
              <InfoCard title="YOUR SKIN NEEDS" cardStyle={s.adviceCard}>
                <Text style={s.adviceText}>
                  {rec.skin.advice.replace(/^["']|["']$/g, '')}
                </Text>
              </InfoCard>
            )}

            {morningSteps.length > 0 && (
              <InfoCard title="MORNING ROUTINE">
                {morningSteps.map((step, i) => (
                  <StepRow
                    key={i}
                    n={i + 1}
                    label={step.label}
                    product={step.product}
                    productCount={(productMap[getCategoryForStep(step.label)] ?? []).length}
                    onPress={() => {
                      const cat = getCategoryForStep(step.label);
                      setPickerCategory(cat);
                      setPickerStep(step.label);
                      setPickerReason(step.product ?? '');
                      setPickerVisible(true);
                    }}
                  />
                ))}
              </InfoCard>
            )}

            {eveningSteps.length > 0 && (
              <InfoCard title="EVENING ROUTINE">
                {eveningSteps.map((step, i) => (
                  <StepRow
                    key={i}
                    n={i + 1}
                    label={step.label}
                    product={step.product}
                    productCount={(productMap[getCategoryForStep(step.label)] ?? []).length}
                    onPress={() => {
                      const cat = getCategoryForStep(step.label);
                      setPickerCategory(cat);
                      setPickerStep(step.label);
                      setPickerReason(step.product ?? '');
                      setPickerVisible(true);
                    }}
                  />
                ))}
              </InfoCard>
            )}

          </>
        )}


        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>

      <ProductPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        stepName={pickerStep}
        categoryName={pickerCategory}
        reason={pickerReason}
        products={productMap[pickerCategory] ?? []}
      />
    </View>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function InfoCard({ title, children, cardStyle }: { title: string; children: React.ReactNode; cardStyle?: object }) {
  return (
    <View style={[s.infoCard, cardStyle]}>
      <Text style={s.infoCardLabel}>{title}</Text>
      {children}
    </View>
  );
}

function StepRow({
  n,
  label,
  product,
  productCount,
  onPress,
}: {
  n:            number;
  label:        string;
  product:      string;
  productCount: number;
  onPress?:     () => void;
}) {
  const content = (
    <View style={s.stepRow}>
      <View style={s.stepCircle}>
        <Text style={s.stepNum}>{n}</Text>
      </View>
      <View style={s.stepContent}>
        <View style={s.stepTopRow}>
          <Text style={s.stepLabel}>{label}</Text>
          <Text style={s.stepDash}> — </Text>
          <Text style={s.stepProduct}>{product}</Text>
        </View>
        {onPress && productCount > 0 && (
          <Text style={s.stepMatched}>
            {productCount} products matched to your skin
          </Text>
        )}
      </View>
      {onPress && (
        <Text style={s.stepChevron}>›</Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function ProductCard({ icon, name, why, tag, iconBg, iconColor }: ProductItem & { iconBg: string; iconColor: string }) {
  return (
    <View style={s.productCard}>
      <View style={[s.productIcon, { backgroundColor: iconBg }]}>
        <Text style={[s.productIconChar, { color: iconColor }]}>{icon}</Text>
      </View>
      <View style={s.productBody}>
        <Text style={s.productName}>{name}</Text>
        <Text style={s.productWhy}>{why}</Text>
        <View style={s.productTagPill}>
          <Text style={s.productTagText}>{tag}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
  },
  backArrow:   { fontSize: 32, color: Colors.surface, lineHeight: 40 },
  screenTitle: { fontFamily: Typography.serif, fontSize: 18, color: Colors.surface },

  tabBar: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
  },
  tabPill:           { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: Colors.surface },
  tabPillActive:     { backgroundColor: Colors.accent },
  tabPillText:       { fontSize: 13, color: Colors.text2, fontWeight: '500' },
  tabPillTextActive: { color: Colors.surface, fontWeight: '600' },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },

  infoCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.sm,
  },
  adviceCard: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
  },
  infoCardLabel: {
    fontSize: 11, color: Colors.accent,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.md,
  },

  skinTypePill:     { alignSelf: 'flex-start', backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  skinTypePillText: { fontSize: 9, color: Colors.text2, textTransform: 'capitalize', fontWeight: '500' },

  bodyText:   { fontSize: 15, color: Colors.text, lineHeight: 22 },
  adviceText: { fontSize: 15, color: Colors.text, lineHeight: 22 },

  concernRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  concernName: { fontSize: 15, color: Colors.text, textTransform: 'capitalize' },
  dotsRow:     { flexDirection: 'row', gap: 5 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotFilled:   { backgroundColor: Colors.accent },

  stepRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border2, gap: 12 },
  stepCircle:  { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNum:     { fontSize: 12, color: Colors.text2, fontWeight: '500' },
  stepContent: { flex: 1, gap: 3 },
  stepTopRow:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  stepLabel:   { fontSize: 14, color: Colors.text, fontWeight: '500' },
  stepDash:    { fontSize: 14, color: Colors.text3 },
  stepProduct: { fontSize: 14, color: Colors.text2 },
  stepMatched: { fontSize: 11, color: Colors.accent, fontWeight: '400' },
  stepChevron: { fontSize: 18, color: Colors.accent, flexShrink: 0 },


  productCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
  },
  productIcon:     { width: 44, height: 44, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  productIconChar: { fontSize: 18 },
  productBody:     { flex: 1 },
  productWhy:      { fontSize: 15, color: Colors.text2, lineHeight: 19, marginBottom: Spacing.sm },
  productTagPill:  { alignSelf: 'flex-start', backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  productTagText:  { fontSize: Typography.size.xs, color: Colors.text2 },
});
