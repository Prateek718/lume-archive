// Skin detail screen — Analysis | Routine | Products tabs.
// Receives scanJson and gender as navigation params.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { getProductsForBrands } from '../constants/productConstants';
import type { Product } from '../constants/productConstants';
import { logProductEvent } from '../services/scanService';
import { supabase } from '../lib/supabase';
import type { Scan } from '../types';

type Tab = 'analysis' | 'routine' | 'products';
type RoutineLevel = 'simple' | 'balanced' | 'full';

const CATEGORY_LIMIT: Record<RoutineLevel, number> = { simple: 2, balanced: 4, full: 99 };

function formatCategoryName(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

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

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function SkinDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanJson, gender = 'man' } = useLocalSearchParams<{ scanJson: string; gender: string }>();
  const scan = scanJson ? (JSON.parse(scanJson) as Scan) : null;
  const rec  = scan?.recommendations;

  const [tab, setTab]                   = useState<Tab>('analysis');
  const [preferredBrands, setPreferredBrands] = useState<string[]>([]);
  const [routineLevel, setRoutineLevel]   = useState<RoutineLevel>('simple');
  const [brandsLoaded, setBrandsLoaded]   = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    const loadUserPrefs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBrandsLoaded(true); return; }
      const { data } = await supabase
        .from('users')
        .select('preferred_brands, routine_level')
        .eq('id', user.id)
        .single();
      const row = data as { preferred_brands?: string[]; routine_level?: string } | null;
      setPreferredBrands(row?.preferred_brands ?? []);
      setRoutineLevel((row?.routine_level as RoutineLevel | undefined) ?? 'simple');
      setBrandsLoaded(true);
    };
    loadUserPrefs();
  }, []);

  const concerns    = (scan?.skin_concerns ?? []).filter(c => c in CONCERN_SEVERITY);
  const topConcern  = concerns.sort((a, b) => (CONCERN_SEVERITY[b] ?? 0) - (CONCERN_SEVERITY[a] ?? 0))[0];
  // Split routine steps: first half morning, second half evening
  const routine     = rec?.skin?.routine ?? [];
  const half        = Math.ceil(routine.length / 2);
  const morning     = routine.slice(0, half);
  const evening     = routine.slice(half);

  const productGender: 'all' | 'men' | 'women' =
    gender === 'woman' ? 'women' : gender === 'man' ? 'men' : 'all';

  const productRecs = rec?.skin?.products ?? [];
  const categoryLimit = CATEGORY_LIMIT[routineLevel];
  const visibleCategories = [...new Set(productRecs.map(p => p.category))].slice(0, categoryLimit);

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
    Linking.openURL(product.nykaa_url);
  };

  return (
    <View style={s.screen}>
      <StatusBar style="light" />

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
        {(['analysis', 'routine', 'products'] as Tab[]).map(t => (
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
              <InfoCard title="YOUR SKIN NEEDS">
                <Text style={s.adviceText}>"{rec.skin.advice}"</Text>
              </InfoCard>
            )}

            {morning.length > 0 && (
              <InfoCard title="MORNING ROUTINE">
                {morning.map((step, i) => (
                  <StepRow key={i} n={i + 1} text={step} />
                ))}
              </InfoCard>
            )}

            {evening.length > 0 && (
              <InfoCard title="EVENING ROUTINE">
                {evening.map((step, i) => (
                  <StepRow key={i} n={i + 1} text={step} />
                ))}
              </InfoCard>
            )}
          </>
        )}

        {/* ── PRODUCTS ── */}
        {tab === 'products' && (
          <>
            {/* No brands CTA */}
            {brandsLoaded && preferredBrands.length === 0 && (
              <TouchableOpacity
                style={s.noBrandsBanner}
                onPress={() => router.push('/profile/my-brands' as never)}
                activeOpacity={0.8}
              >
                <Text style={s.noBrandsTitle}>Set your preferred brands</Text>
                <Text style={s.noBrandsSub}>We'll show products from brands you already trust</Text>
                <Text style={s.noBrandsArrow}>›</Text>
              </TouchableOpacity>
            )}

            {productRecs.length === 0 ? (
              <Text style={s.openingLine}>
                No product recommendations yet — rescan to get personalised picks.
              </Text>
            ) : (
              visibleCategories.map(cat => {
                const catRec = productRecs.find(p => p.category === cat);
                const products = getProductsForBrands({
                  category:        cat,
                  preferredBrands,
                  fallbackTier:    'budget',
                  gender:          productGender,
                  limit:           3,
                });
                const isExpanded = expandedCategory === cat;
                return (
                  <View key={cat} style={s.catTile}>
                    <TouchableOpacity
                      style={s.catHeader}
                      onPress={() => setExpandedCategory(isExpanded ? null : cat)}
                      activeOpacity={0.8}
                    >
                      <View style={s.catHeaderLeft}>
                        <Text style={s.catName}>{formatCategoryName(cat)}</Text>
                        {catRec && (
                          <View style={s.matchBadge}>
                            <Text style={s.matchBadgeText}>{catRec.match_score}% match</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.chevron}>{isExpanded ? '∧' : '∨'}</Text>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={s.catBody}>
                        {catRec?.reason ? (
                          <Text style={s.catReason}>{catRec.reason}</Text>
                        ) : null}
                        {products.length === 0 ? (
                          <Text style={s.noProductsText}>No matching products found.</Text>
                        ) : (
                          products.map(product => (
                            <View key={product.id} style={s.productRow}>
                              <View style={s.productRowLeft}>
                                {product.isPreferredBrand && (
                                  <View style={s.preferredBadge}>
                                    <Text style={s.preferredBadgeText}>Your brand</Text>
                                  </View>
                                )}
                                <Text style={s.productRowName}>{product.name}</Text>
                                <Text style={s.productRowMeta}>
                                  {product.brand} · ₹{product.price_inr.toLocaleString('en-IN')}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={s.buyBtn}
                                onPress={() => handleBuyPress(product, cat)}
                                activeOpacity={0.8}
                              >
                                <Text style={s.buyBtnText}>Buy</Text>
                              </TouchableOpacity>
                            </View>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {/* Simple routine upsell */}
            {routineLevel === 'simple' && productRecs.length > 0 && (
              <TouchableOpacity
                style={s.upsellCard}
                onPress={() => router.push('/profile/routine-level' as never)}
                activeOpacity={0.8}
              >
                <Text style={s.upsellTitle}>Want more targeted picks?</Text>
                <Text style={s.upsellSub}>Switch to Balanced or Full routine to unlock more categories</Text>
                <Text style={s.upsellArrow}>›</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
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

function StepRow({ n, text }: { n: number; text: string }) {
  return (
    <View style={s.stepRow}>
      <View style={s.stepCircle}>
        <Text style={s.stepNum}>{n}</Text>
      </View>
      <Text style={s.stepText}>{text}</Text>
    </View>
  );
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
  backArrow:   { fontSize: 32, color: Colors.gold, lineHeight: 40 },
  screenTitle: { fontFamily: Typography.serif, fontSize: 18, color: Colors.cream },

  tabBar: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
  },
  tabPill:           { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: '#1A1A1A' },
  tabPillActive:     { backgroundColor: Colors.gold },
  tabPillText:       { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  tabPillTextActive: { color: Colors.background, fontWeight: '600' },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },

  infoCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.sm,
  },
  infoCardLabel: {
    fontSize: 10, color: Colors.gold,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.md,
  },

  skinTypePill:     { alignSelf: 'flex-start', backgroundColor: '#10182A', borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  skinTypePillText: { fontSize: 9, color: '#7EB8F7', textTransform: 'capitalize', fontWeight: '500' },

  bodyText:   { fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  adviceText: { fontSize: 15, color: Colors.cream, fontStyle: 'italic', lineHeight: 22 },

  concernRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  concernName: { fontSize: 15, color: Colors.cream, textTransform: 'capitalize' },
  dotsRow:     { flexDirection: 'row', gap: 5 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  dotFilled:   { backgroundColor: Colors.gold },

  stepRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  stepCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.goldDim, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  stepNum:    { fontSize: 10, color: Colors.gold, fontWeight: '700' },
  stepText:   { flex: 1, fontSize: 15, color: Colors.textSecondary, lineHeight: 20 },

  openingLine: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.md },

  // Collapsible category tiles
  noBrandsBanner: {
    backgroundColor: '#1A1412', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)',
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  noBrandsTitle: { fontSize: 15, color: Colors.cream, fontWeight: '600', marginBottom: 3 },
  noBrandsSub:   { fontSize: 13, color: Colors.textSecondary, lineHeight: 16 },
  noBrandsArrow: { position: 'absolute', right: 14, top: 14, fontSize: 22, color: Colors.gold },

  catTile: {
    backgroundColor: '#1A1412', borderWidth: 1, borderColor: '#2A2420',
    borderRadius: 12, marginBottom: 6, overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  catHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  catName:       { fontSize: 15, color: Colors.cream, fontWeight: '600' },
  matchBadge:    { backgroundColor: 'rgba(201,168,76,0.1)', borderRadius: Radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  matchBadgeText: { fontSize: 9, color: Colors.gold, fontWeight: '500' },
  chevron:       { fontSize: 13, color: Colors.textSecondary },

  catBody:       { borderTopWidth: 1, borderTopColor: '#2A2420', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  catReason:     { fontSize: 11, color: Colors.textSecondary, lineHeight: 16, marginBottom: 10 },
  noProductsText:{ fontSize: 11, color: Colors.textTertiary, marginBottom: 10 },

  productRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#222222',
  },
  productRowLeft:  { flex: 1 },
  preferredBadge:  { alignSelf: 'flex-start', backgroundColor: 'rgba(201,168,76,0.12)', borderRadius: Radius.pill, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 3 },
  preferredBadgeText: { fontSize: 9, color: Colors.gold, fontWeight: '500' },
  productRowName:  { fontSize: 15, color: Colors.cream, fontWeight: '500', marginBottom: 2 },
  productRowMeta:  { fontSize: 13, color: '#8A7A6A' },

  buyBtn:          { backgroundColor: Colors.gold, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, flexShrink: 0 },
  buyBtnText:      { fontSize: 14, color: Colors.background, fontWeight: '600' },

  upsellCard: {
    backgroundColor: '#1A1412', borderWidth: 1, borderColor: '#2A2420',
    borderRadius: 12, padding: 14, marginTop: 4,
  },
  upsellTitle: { fontSize: 15, color: Colors.cream, fontWeight: '600', marginBottom: 3 },
  upsellSub:   { fontSize: 13, color: Colors.textSecondary, lineHeight: 16 },
  upsellArrow: { position: 'absolute', right: 14, top: 14, fontSize: 22, color: Colors.gold },

  productCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
  },
  productIcon:     { width: 44, height: 44, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  productIconChar: { fontSize: 18 },
  productBody:     { flex: 1 },
  productName:     { fontSize: 15, color: Colors.cream, fontWeight: '600', marginBottom: 4 },
  productWhy:      { fontSize: 15, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.sm },
  productTagPill:  { alignSelf: 'flex-start', backgroundColor: '#1A1A1A', borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  productTagText:  { fontSize: Typography.size.xs, color: Colors.textSecondary },
});
