// Hair detail screen — Style | Care | Products tabs.
// Receives hairRecsJson (optional) and scanJson/gender as navigation params.
// Falls back to loading hair_recommendations from users table if param absent.

import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { PRODUCTS, getProductsForBrands, getProductNykaaUrl } from '../constants/productConstants';
import type { Product } from '../constants/productConstants';
import { logProductEvent, getProductMap } from '../services/scanService';
import { supabase } from '../lib/supabase';
import type { Scan, HairRecommendations, HairProfile, MatchedProduct } from '../types';
import ProductPickerSheet from '../components/ProductPickerSheet';

type Tab = 'style' | 'care' | 'products';
type RoutineLevel = 'simple' | 'balanced' | 'full';

const CATEGORY_LIMIT: Record<RoutineLevel, number> = { simple: 2, balanced: 4, full: 99 };

// Map routine step labels to product catalogue categories
const HAIR_STEP_TO_CATEGORY: Record<string, string> = {
  'Shampoo':              'shampoo',
  'Condition':            'conditioner',
  'Conditioner':          'conditioner',
  'Oil':                  'hair_oil',
  'Hair oil':             'hair_oil',
  'Mask':                 'hair_mask',
  'Hair mask':            'hair_mask',
  'Serum':                'hair_serum',
  'Hair serum':           'hair_serum',
  'Leave-in':             'leave_in_conditioner',
  'Leave-in conditioner': 'leave_in_conditioner',
  'Scalp serum':          'scalp_serum',
  'Scalp Serum':          'scalp_serum',
  'Sunscreen':            'sunscreen',
  'Moisturise':           'moisturiser',
};

function getHairCategoryForStep(label: string): string {
  return HAIR_STEP_TO_CATEGORY[label] ?? label.toLowerCase().replace(/\s+/g, '_');
}

function formatCategoryName(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Maintenance dot colour
const MAINT_COLOR: Record<string, string> = {
  low:    Colors.green,
  medium: Colors.accent,
  high:   Colors.dangerStrong,
};

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function HairDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    hairRecsJson,
    scanJson,
    gender = 'man',
  } = useLocalSearchParams<{ hairRecsJson?: string; scanJson?: string; gender?: string }>();

  const scan = scanJson ? (JSON.parse(scanJson) as Scan) : null;

  const [hairRecs,       setHairRecs]       = useState<HairRecommendations | null>(
    hairRecsJson ? JSON.parse(hairRecsJson) as HairRecommendations : null,
  );
  const [hairProfile,    setHairProfile]    = useState<HairProfile | null>(null);
  const [loading,        setLoading]        = useState(!hairRecsJson);
  const [tab,            setTab]            = useState<Tab>('style');
  const [selectedStyle,  setSelectedStyle]  = useState<string>('');
  const [preferredBrands, setPreferredBrands] = useState<string[]>([]);
  const [routineLevel,   setRoutineLevel]   = useState<RoutineLevel>('simple');
  const [brandsLoaded,   setBrandsLoaded]   = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Product picker state
  const [pickerVisible,  setPickerVisible]  = useState(false);
  const [pickerCategory, setPickerCategory] = useState('');
  const [pickerStep,     setPickerStep]     = useState('');
  const [pickerStepId,   setPickerStepId]   = useState('');
  const [pickerReason,   setPickerReason]   = useState('');
  const [userId,         setUserId]         = useState<string | null>(null);

  useEffect(() => {
    const loadPrefs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBrandsLoaded(true); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from('users')
        .select('preferred_brands_v2, routine_level, hair_recommendations, hair_profile')
        .eq('id', user.id)
        .single();

      const row = data as {
        preferred_brands_v2?: { hair?: string[] };
        routine_level?: string;
        hair_recommendations?: HairRecommendations | null;
        hair_profile?: HairProfile | null;
      } | null;

      const pb = row?.preferred_brands_v2 as { hair?: string[] } | null;
      setPreferredBrands(pb?.hair ?? []);
      setRoutineLevel((row?.routine_level as RoutineLevel | undefined) ?? 'simple');

      if (!hairRecs && row?.hair_recommendations) {
        setHairRecs(row.hair_recommendations);
      }
      if (row?.hair_profile) {
        setHairProfile(row.hair_profile);
      }
      if (scan?.id) {
        getProductMap(scan.id).then(setProductMap);
      }
      setLoading(false);
      setBrandsLoaded(true);
    };
    loadPrefs();
  }, []);

  useEffect(() => {
    if (hairRecs?.styles?.[0] && !selectedStyle) {
      setSelectedStyle(hairRecs.styles[0]);
    }
  }, [hairRecs]);

  const productGender: 'all' | 'men' | 'women' =
    gender === 'woman' ? 'women' : gender === 'man' ? 'men' : 'all';

  const productRecs    = hairRecs?.products ?? [];
  const categoryLimit  = CATEGORY_LIMIT[routineLevel];
  const visibleCategories = [...new Set(productRecs.map(p => p.category))].slice(0, categoryLimit);

  // Product map for the picker — loaded from AsyncStorage (stored during scan)
  const [productMap, setProductMap] = useState<Record<string, MatchedProduct[]>>({});

  // Routine steps filtered by current routine level
  const visibleRoutineSteps = useMemo(() => {
    if (!hairRecs?.routine) return [];
    const levelOrder: Record<RoutineLevel, number> = { simple: 0, balanced: 1, full: 2 };
    const currentOrder = levelOrder[routineLevel];
    return hairRecs.routine
      .filter(s => levelOrder[s.level as RoutineLevel] <= currentOrder)
      .sort((a, b) => a.order - b.order);
  }, [hairRecs?.routine, routineLevel]);

  const handleBuyPress = async (product: Product, category: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && scan?.id && !scan.id.startsWith('local_')) {
      await logProductEvent({
        userId:      user.id,
        scanId:      scan.id,
        productId:   product.id,
        productName: product.name,
        brand:       product.brand,
        category,
        eventType:   'clicked_buy',
      });
    }
    const url = getProductNykaaUrl(product);
    if (url) Linking.openURL(url);
  };

  if (loading) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  if (!hairRecs) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }]}>
        <Text style={{ color: Colors.text, fontSize: 15, textAlign: 'center', marginBottom: Spacing.lg }}>
          No hair profile yet.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: Colors.accent, borderRadius: Radius.input, paddingHorizontal: 24, paddingVertical: 12 }}
          onPress={() => router.push({ pathname: '/hair-profile' as any, params: { returnTo: 'hair-detail' } })}
        >
          <Text style={{ color: Colors.textOnAccent, fontWeight: '600' }}>Set up hair profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />

      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.screenTitle}>Hair</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab pills */}
      <View style={s.tabBar}>
        {(['style', 'care', 'products'] as Tab[]).map(t => (
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
        {/* ── STYLE ── */}
        {tab === 'style' && (
          <>
            {hairRecs.advice && (
              <InfoCard title="WHAT TO ASK YOUR STYLIST">
                <Text style={s.adviceText}>"{hairRecs.advice}"</Text>
              </InfoCard>
            )}

            {/* Detailed styles — use styles_detailed if available */}
            {hairRecs.styles_detailed && hairRecs.styles_detailed.length > 0 ? (
              <InfoCard title="STYLES THAT SUIT YOU">
                {hairRecs.styles_detailed.filter(sd => !sd.avoid).map((sd, i) => {
                  const whyText = sd.why || sd.why_face_shape || sd.why_texture;
                  return (
                    <View key={`${sd.name}-${i}`} style={s.styleCard}>
                      <View style={s.styleHeader}>
                        <Text style={s.styleName}>{sd.name}</Text>
                        <View style={[s.maintDot,
                          sd.maintenance === 'low'    ? s.maintLow :
                          sd.maintenance === 'medium' ? s.maintMed : s.maintHigh
                        ]} />
                      </View>
                      {whyText ? (
                        <Text style={s.styleWhy}>{whyText}</Text>
                      ) : null}
                      {sd.climate_note ? (
                        <Text style={s.styleClimate}>{sd.climate_note}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </InfoCard>
            ) : hairRecs.styles && hairRecs.styles.length > 0 ? (
              <InfoCard title="STYLES THAT SUIT YOU">
                <View style={s.stylesRow}>
                  {hairRecs.styles.map(style => (
                    <TouchableOpacity
                      key={style}
                      style={[s.styleCardSimple, selectedStyle === style && s.styleCardSimpleActive]}
                      onPress={() => setSelectedStyle(style)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.styleNameSimple, selectedStyle === style && s.styleNameSimpleActive]} numberOfLines={3}>
                        {style}
                      </Text>
                      <View style={[s.styleLine, selectedStyle === style && s.styleLineActive]} />
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedStyle && (
                  <TouchableOpacity
                    onPress={() => {
                      const genderTerm = gender === 'woman' ? 'woman' : 'man';
                      const query = encodeURIComponent(`${selectedStyle} ${genderTerm} hairstyle`);
                      Linking.openURL(`https://www.google.com/search?q=${query}&tbm=isch`);
                    }}
                    style={s.searchBtn}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 15 }}>🔍</Text>
                    <Text style={s.searchBtnText}>See {selectedStyle} photos</Text>
                  </TouchableOpacity>
                )}
              </InfoCard>
            ) : null}
          </>
        )}

        {/* ── CARE ── */}
        {tab === 'care' && (
          <>
            {hairRecs.condition_explanation && (
              <InfoCard title="WHY YOUR HAIR NEEDS THIS">
                <Text style={s.bodyText}>{hairRecs.condition_explanation}</Text>
              </InfoCard>
            )}

            {visibleRoutineSteps.length > 0 && (
              <InfoCard title="YOUR ROUTINE">
                {visibleRoutineSteps.map((step, i) => {
                  const cat = getHairCategoryForStep(step.label);
                  const hasProducts = (productMap[cat]?.length ?? 0) > 0;
                  return (
                    <StepRow
                      key={`${step.label}-${i}`}
                      n={i + 1}
                      text={step.label}
                      cadence={step.cadence}
                      onPress={hasProducts ? () => {
                        setPickerCategory(cat);
                        setPickerStep(step.label);
                        setPickerStepId(step.step_id ?? '');
                        setPickerReason(step.product);
                        setPickerVisible(true);
                      } : undefined}
                    />
                  );
                })}
              </InfoCard>
            )}

          </>
        )}

        {/* ── PRODUCTS ── */}
        {tab === 'products' && (
          <>
            {brandsLoaded && preferredBrands.length === 0 && (
              <TouchableOpacity
                style={s.noBrandsBanner}
                onPress={() => router.push('/profile/my-brands' as never)}
                activeOpacity={0.8}
              >
                <Text style={s.noBrandsTitle}>Set your preferred brands</Text>
                <Text style={s.noBrandsSub}>We'll show products from brands you already trust</Text>
                <Text style={s.noBrandsBtnText}>Set brands →</Text>
              </TouchableOpacity>
            )}

            {productRecs.length === 0 ? (
              <Text style={s.openingLine}>
                No product picks yet — update your hair profile to get personalised recommendations.
              </Text>
            ) : (
              visibleCategories.map(cat => {
                const catRec = productRecs.find(p => p.category === cat);
                const product: Product | undefined =
                  PRODUCTS.find(p => p.category === cat && p.name === catRec?.name && p.brand === catRec?.brand)
                  ?? getProductsForBrands({ category: cat, preferredBrands, fallbackTier: 'budget', gender: productGender, limit: 1 })[0];
                const isExpanded = expandedCategory === cat;
                return (
                  <View key={cat} style={s.catTile}>
                    <TouchableOpacity
                      style={s.catHeader}
                      onPress={() => setExpandedCategory(isExpanded ? null : cat)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.catName}>{formatCategoryName(cat)}</Text>
                      <Text style={s.chevron}>{isExpanded ? '∧' : '∨'}</Text>
                    </TouchableOpacity>

                    {isExpanded && (
                      product == null ? (
                        <Text style={s.noProductsText}>No matching products found.</Text>
                      ) : (
                        <View style={s.expandedProduct}>
                          <View style={s.matchMeterWrap}>
                            <View style={s.matchMeterHeader}>
                              <Text style={s.matchLabel}>Match</Text>
                              <Text style={s.matchScore}>{catRec?.match_score ?? 0}%</Text>
                            </View>
                            <View style={s.matchTrack}>
                              <View style={[s.matchFill, { width: `${catRec?.match_score ?? 0}%` }]} />
                            </View>
                          </View>
                          {product.isPreferredBrand && (
                            <View style={s.preferredBadge}>
                              <Text style={s.preferredBadgeText}>Your brand</Text>
                            </View>
                          )}
                          <Text style={s.productName}>{product.name}</Text>
                          <Text style={s.productMeta}>
                            {product.brand} · ₹{product.price_inr.toLocaleString('en-IN')}
                          </Text>
                          {catRec?.reason ? (
                            <Text style={s.productReason}>{catRec.reason}</Text>
                          ) : null}
                          <TouchableOpacity
                            style={s.buyBtn}
                            onPress={() => handleBuyPress(product!, cat)}
                            activeOpacity={0.8}
                          >
                            <Text style={s.buyBtnText}>Buy on Nykaa</Text>
                          </TouchableOpacity>
                        </View>
                      )
                    )}
                  </View>
                );
              })
            )}

            {routineLevel === 'simple' && productRecs.length > 0 && (
              <TouchableOpacity
                style={s.upsellCard}
                onPress={() => router.push('/profile/routine-level' as never)}
                activeOpacity={0.8}
              >
                <Text style={s.upsellTitle}>Want more targeted picks?</Text>
                <Text style={s.upsellSub}>Switch to Balanced or Full routine to unlock more categories</Text>
                <Text style={s.upsellLink}>Upgrade routine →</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>

      <ProductPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        stepName={pickerStep}
        categoryName={formatCategoryName(pickerCategory)}
        reason={pickerReason}
        products={productMap[pickerCategory] ?? []}
        userId={userId ?? undefined}
        stepId={pickerStepId || undefined}
      />
    </View>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.infoCard}>
      <Text style={s.infoCardLabel}>{title}</Text>
      {children}
    </View>
  );
}

const CADENCE_LABEL: Record<string, string> = {
  every_wash: 'Every wash',
  weekly:     'Weekly',
  monthly:    'Monthly',
};

function StepRow({ n, text, cadence, onPress }: { n: number; text: string; cadence?: string; onPress?: () => void }) {
  const cadenceLabel = cadence ? CADENCE_LABEL[cadence] : undefined;
  const inner = (
    <View style={s.stepRowInner}>
      <View style={s.stepCircle}>
        <Text style={s.stepNum}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.stepText}>{text}</Text>
        {cadenceLabel ? <Text style={s.stepCadence}>{cadenceLabel}</Text> : null}
      </View>
      {onPress && <Text style={s.stepChevron}>›</Text>}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={s.stepRow} onPress={onPress} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={s.stepRow}>{inner}</View>;
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
  },
  backArrow:   { fontSize: 32, color: Colors.text, lineHeight: 40 },
  screenTitle: { fontFamily: Typography.serif, fontSize: 18, color: Colors.text },

  tabBar: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
  },
  tabPill:           { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: Colors.surface },
  tabPillActive:     { backgroundColor: Colors.accent },
  tabPillText:       { fontSize: 13, color: Colors.text2, fontWeight: '500' },
  tabPillTextActive: { color: Colors.textOnAccent, fontWeight: '600' },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },

  infoCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.sm,
  },
  infoCardLabel: {
    fontSize: 10, color: Colors.accent,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.md,
  },

  adviceText: { fontSize: 15, color: Colors.text, fontStyle: 'italic', lineHeight: 22 },
  bodyText:   { fontSize: 15, color: Colors.text2, lineHeight: 22 },

  // Detailed style cards (styles_detailed)
  styleCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.input,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12, marginBottom: 8,
  },
  styleHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  styleName:     { fontSize: 14, color: Colors.text, fontWeight: '600', flex: 1 },
  maintDot:      { width: 8, height: 8, borderRadius: 4 },
  maintLow:      { backgroundColor: MAINT_COLOR.low },
  maintMed:      { backgroundColor: MAINT_COLOR.medium },
  maintHigh:     { backgroundColor: MAINT_COLOR.high },
  styleWhy:      { fontSize: 12, color: Colors.text2, lineHeight: 17, marginTop: 2 },
  styleClimate:  { fontSize: 11, color: Colors.text3, lineHeight: 16, marginTop: 4, fontStyle: 'italic' },

  // Simple style cards (fallback — styles array)
  stylesRow:           { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  styleCardSimple:     { flex: 1, height: 80, backgroundColor: Colors.surface, borderRadius: Radius.input, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xs, gap: 6 },
  styleCardSimpleActive: { borderColor: Colors.accent },
  styleNameSimple:     { fontSize: 13, color: Colors.text2, textAlign: 'center', lineHeight: 17 },
  styleNameSimpleActive: { color: Colors.text },
  styleLine:           { width: 20, height: 1, backgroundColor: Colors.border },
  styleLineActive:     { backgroundColor: Colors.accent },

  searchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.accentTint,
  },
  searchBtnText: { color: Colors.text, fontSize: 13, fontWeight: '600' },

  // Steps
  stepRow:       { marginBottom: Spacing.md },
  stepRowInner:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  stepCircle:    { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  stepNum:       { fontSize: 10, color: Colors.accent, fontWeight: '700' },
  stepText:      { fontSize: 15, color: Colors.text2, lineHeight: 20 },
  stepCadence:   { fontSize: 11, color: Colors.text3, marginTop: 2, letterSpacing: 0.5 },
  stepChevron:   { fontSize: 18, color: Colors.text3, lineHeight: 22 },

  openingLine: { fontSize: 15, color: Colors.text, lineHeight: 22, marginBottom: Spacing.md },

  // No brands banner
  noBrandsBanner: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accentTintBorder,
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  noBrandsTitle:   { fontFamily: Typography.serif, fontSize: 18, color: Colors.text },
  noBrandsSub:     { fontSize: 13, color: Colors.text2, lineHeight: 20 },
  noBrandsBtnText: { fontSize: 13, color: Colors.accent, marginTop: 8 },

  // Collapsible category tiles
  catTile: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, marginBottom: 6, overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  catName: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  chevron: { fontSize: 13, color: Colors.text2 },

  noProductsText: { fontSize: 11, color: Colors.text3, padding: 14 },

  expandedProduct: {
    backgroundColor: Colors.accentTintLight, borderWidth: 1, borderTopWidth: 0,
    borderColor: Colors.accentTintBorder, borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10, padding: 14, marginBottom: 5,
  },
  matchMeterWrap:   { marginBottom: 0 },
  matchMeterHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  matchLabel:       { fontSize: 11, color: Colors.text2 },
  matchScore:       { fontSize: 11, color: Colors.accent, fontWeight: '500' },
  matchTrack:       { height: 3, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  matchFill:        { height: '100%', backgroundColor: Colors.accent, borderRadius: 2 },

  preferredBadge:     { alignSelf: 'flex-start', backgroundColor: Colors.accentTintStrong, borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 2, marginTop: 12, marginBottom: 3 },
  preferredBadgeText: { fontSize: 9, color: Colors.accent, fontWeight: '500' },
  productName:        { fontSize: 15, color: Colors.text, fontWeight: '500', marginTop: 12, marginBottom: 3 },
  productMeta:        { fontSize: 13, color: Colors.text2, marginBottom: 8 },
  productReason:      { fontSize: 11, color: Colors.text3, lineHeight: 17, marginBottom: 12 },

  buyBtn:     { backgroundColor: Colors.accent, borderRadius: 8, paddingVertical: 12, width: '100%', alignItems: 'center' },
  buyBtnText: { fontSize: 14, color: Colors.textOnAccent, fontWeight: '600' },

  upsellCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 14, marginTop: 4,
  },
  upsellTitle: { fontSize: 15, color: Colors.text, fontWeight: '600', marginBottom: 3 },
  upsellSub:   { fontSize: 13, color: Colors.text3, lineHeight: 18 },
  upsellLink:  { fontSize: 13, color: Colors.accent, marginTop: 8 },
});
