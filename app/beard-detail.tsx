// Beard detail screen — Shape | Routine | Products tabs. Men only.
// Receives scanJson and gender as navigation params.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { PRODUCTS, getProductsForBrands, getProductNykaaUrl } from '../constants/productConstants';
import type { Product } from '../constants/productConstants';
import { logProductEvent, getProductMap } from '../services/scanService';
import { supabase } from '../lib/supabase';
import type { Scan, MatchedProduct } from '../types';
import ProductPickerSheet from '../components/ProductPickerSheet';

type Tab = 'shape' | 'routine' | 'products';

function formatCategoryName(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getBeardCategoryForStep(label: string): string {
  const map: Record<string, string> = {
    'Cleanse':   'beard_wash',
    'Nourish':   'beard_oil',
    'Shape':     'beard_balm',
    'Condition': 'beard_oil',
    'Treat':     'beard_wash',
  };
  return map[label] ?? 'beard_oil';
}

interface ProductItem { icon: string; name: string; why: string; tag: string; }

// ── Data helpers ───────────────────────────────────────────────────────────────

const FACE_SHAPE_BEARD: Record<string, { style: string; description: string }> = {
  oval:    {
    style:       'Medium stubble or classic short beard',
    description: 'An oval face is the most versatile — most beard shapes work well. Medium stubble sits as the ideal default: enough definition without adding bulk or altering your proportions.',
  },
  round:   {
    style:       'Tight sides, longer on the chin',
    description: 'A round face benefits from length at the chin to create the illusion of a more oval shape. Keep the sides very tight or faded — width on the sides makes the face appear rounder.',
  },
  square:  {
    style:       'Softened edges, rounded beard shape',
    description: 'A square jaw already has strong definition. A slightly rounded, softer beard at the corners and chin balances the angularity and avoids adding more squareness.',
  },
  heart:   {
    style:       'Fuller chin beard',
    description: 'A heart-shaped face has a wider forehead and narrower chin. A fuller beard on the chin adds width at the jaw and visually balances the proportions.',
  },
  oblong:  {
    style:       'Fuller sides, minimal length on the chin',
    description: 'An oblong face is long and narrow. Width at the sides creates the illusion of a wider face — avoid adding length at the chin, which would make the face appear even longer.',
  },
  diamond: {
    style:       'Balanced medium beard',
    description: 'A diamond face has strong cheekbones. A medium, balanced beard with light volume at the chin works well — avoid over-trimming the sides as this emphasises the angular cheekbones.',
  },
};

const DAILY_STEPS = [
  'Comb your beard in the direction of growth to detangle and train direction',
  'Apply a small amount of beard balm or oil to keep skin and hair hydrated',
  'Shape any stray hairs with small scissors — only the outliers, not a full trim',
];

const WEEKLY_STEPS = [
  'Wash the beard with a dedicated beard wash — regular shampoo strips the skin oils underneath',
  'After washing, apply a deep conditioner for 2 minutes before rinsing',
  'Trim to your target length using a guard — always trim when dry (wet beard appears longer)',
  'Re-define the cheek line and neckline using a precision trimmer',
];

function getBeardProducts(density: string | null): ProductItem[] {
  if (density === 'none' || density === 'light') {
    return [
      { icon: '◇', name: 'Minoxidil beard serum', why: 'Extends the anagen (growth) phase of follicles — apply twice daily to clean, dry skin. Consistent use over 4–6 months is required to see results.', tag: 'Growth' },
      { icon: '◆', name: 'Biotin supplement (5,000 mcg)', why: 'Vitamin B7 supports keratin production. Supplementation can improve hair thickness and growth rate with consistent daily use.', tag: 'Supplement' },
      { icon: '≡', name: 'Beard balm (light hold)', why: 'Even for lighter growth, balm conditions the skin underneath and trains sparse hairs to lie flat and look more intentional.', tag: 'Care' },
    ];
  }
  return [
    { icon: '◎', name: 'Beard wash', why: 'Formulated for facial hair — gentler than regular shampoo and won\'t strip the natural oils that keep skin under the beard hydrated.', tag: 'Cleanse' },
    { icon: '◎', name: 'Beard oil (argan or jojoba)', why: 'Conditions the hair and the skin underneath. Jojoba closely mirrors the skin\'s natural sebum; argan oil adds softness and sheen.', tag: 'Condition' },
    { icon: '◆', name: 'Beard balm (medium hold)', why: 'Shapes and tames the beard throughout the day while adding a final conditioning layer. Apply to dry beard after oil.', tag: 'Style & hold' },
  ];
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function BeardDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanJson } = useLocalSearchParams<{ scanJson: string }>();
  const scan = scanJson ? (JSON.parse(scanJson) as Scan) : null;
  const rec  = scan?.recommendations;

  const [tab,              setTab]             = useState<Tab>('shape');
  const [preferredBrands,  setPreferredBrands]  = useState<string[]>([]);
  const [brandsLoaded,     setBrandsLoaded]     = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Product picker state
  const [pickerVisible,  setPickerVisible]  = useState(false);
  const [pickerCategory, setPickerCategory] = useState('');
  const [pickerStep,     setPickerStep]     = useState('');
  const [pickerStepId,   setPickerStepId]   = useState('');
  const [pickerReason,   setPickerReason]   = useState('');
  const [userId,         setUserId]         = useState<string | null>(null);

  useEffect(() => {
    const loadUserPrefs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBrandsLoaded(true); return; }
      setUserId(user.id);
      const { data } = await supabase
        .from('users')
        .select('preferred_brands_v2')
        .eq('id', user.id)
        .single();
      const row = data as { preferred_brands_v2?: { skin?: string[] } } | null;
      const pb = row?.preferred_brands_v2 as { skin?: string[] } | null;
      setPreferredBrands(pb?.skin ?? []);
      if (scan?.id) {
        getProductMap(scan.id).then(setProductMap);
      }
      setBrandsLoaded(true);
    };
    loadUserPrefs();
  }, []);

  const faceShapeBeard   = FACE_SHAPE_BEARD[scan?.face_shape ?? ''] ?? null;
  const beardRecs        = rec?.beard ?? null;
  const beardCondition   = scan?.beard_condition ?? null;

  // Product map for picker — loaded from AsyncStorage (stored during scan)
  const [productMap, setProductMap] = useState<Record<string, MatchedProduct[]>>({});

  const BEARD_CATEGORIES = ['beard_oil', 'beard_wash', 'beard_balm'];
  const productRecs = (rec?.products ?? []).filter(p => BEARD_CATEGORIES.includes(p.category));
  const visibleCategories = [...new Set(productRecs.map(p => p.category))];

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
        <Text style={s.screenTitle}>Beard</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.tabBar}>
        {(['shape', 'routine', 'products'] as Tab[]).map(t => (
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
        {/* ── SHAPE ── */}
        {tab === 'shape' && (
          <>
            <InfoCard title="YOUR BEARD PROFILE">
              <View style={s.pillRow}>
                {scan?.beard_density && (
                  <View style={s.pill}>
                    <Text style={s.pillText}>{scan.beard_density} density</Text>
                  </View>
                )}
                {scan?.face_shape && (
                  <View style={[s.pill, s.pillSecondary]}>
                    <Text style={s.pillTextSecondary}>{scan.face_shape} face</Text>
                  </View>
                )}
              </View>
            </InfoCard>

            {rec?.beard?.advice && (
              <InfoCard title="WHAT TO ASK YOUR BARBER">
                <Text style={s.adviceText}>"{rec.beard.advice}"</Text>
              </InfoCard>
            )}

            {faceShapeBeard && (
              <InfoCard title="SHAPE THAT SUITS YOUR FACE">
                <View style={s.shapeName}>
                  <Text style={s.shapeNameText}>{faceShapeBeard.style}</Text>
                </View>
                <Text style={s.bodyText}>{faceShapeBeard.description}</Text>
              </InfoCard>
            )}

            {faceShapeBeard && (
              <TouchableOpacity
                onPress={() => {
                  const query = encodeURIComponent(`${faceShapeBeard.style} beard style`);
                  Linking.openURL(`https://www.google.com/search?q=${query}&tbm=isch`);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 8,
                  marginBottom: 4,
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.accent,
                  backgroundColor: Colors.accentTint,
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 15 }}>🔍</Text>
                <Text style={{
                  color: Colors.text,
                  fontSize: 14,
                  fontWeight: '600',
                }}>
                  See {faceShapeBeard.style} photos
                </Text>
              </TouchableOpacity>
            )}

            {/* AI-generated beard style recommendations */}
            {beardRecs?.beard_styles && beardRecs.beard_styles.length > 0 && (
              <View style={s.stylesSection}>
                <Text style={s.stylesSectionTitle}>Styles for your face + beard</Text>
                {beardRecs.beard_styles
                  .filter(bs => !bs.not_recommended)
                  .map((style, i) => (
                  <View key={i} style={s.styleCard}>
                    <View style={s.styleHeader}>
                      <Text style={s.styleName}>{style.name}</Text>
                      <View style={[s.maintDot,
                        style.maintenance === 'low'    ? s.maintLow :
                        style.maintenance === 'medium' ? s.maintMed : s.maintHigh
                      ]} />
                    </View>
                    <Text style={s.styleWhy}>{style.why}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── ROUTINE ── */}
        {tab === 'routine' && (
          <>
            {beardCondition === 'patchy' && (
              <View style={s.honestCard}>
                <Text style={s.honestLabel}>THE HONEST TRUTH</Text>
                <Text style={s.honestBody}>
                  Patchiness is determined by genetics and testosterone — no oil or serum will fill gaps. We've recommended styles that work with your beard instead.
                </Text>
              </View>
            )}
            {beardCondition === 'well_groomed' && (
              <View style={s.goodCard}>
                <Text style={s.goodLabel}>LOOKING GOOD</Text>
                <Text style={s.goodBody}>
                  Your beard is well maintained. These two products keep it that way.
                </Text>
              </View>
            )}
            {beardCondition === 'untrimmed' && (
              <View style={s.honestCard}>
                <Text style={s.honestLabel}>NEEDS ATTENTION</Text>
                <Text style={s.honestBody}>
                  Your beard needs shaping. A barber visit to establish a clean line makes home maintenance much easier.
                </Text>
              </View>
            )}

            <InfoCard title="DAILY">
              {DAILY_STEPS.map((step, i) => {
                const DAILY_CATS = ['beard_oil', 'beard_oil', 'beard_balm'] as const;
                const cat = DAILY_CATS[i] ?? 'beard_oil';
                const hasProducts = (productMap[cat]?.length ?? 0) > 0;
                return (
                  <StepRow
                    key={i}
                    n={i + 1}
                    text={step}
                    onPress={hasProducts ? () => {
                      setPickerCategory(cat);
                      setPickerStep(`Step ${i + 1}`);
                      setPickerStepId(cat);
                      setPickerReason(step);
                      setPickerVisible(true);
                    } : undefined}
                  />
                );
              })}
            </InfoCard>

            <InfoCard title="WEEKLY">
              {WEEKLY_STEPS.map((step, i) => {
                const WEEKLY_CATS = ['beard_wash', 'beard_oil', 'beard_balm', 'beard_wash'] as const;
                const cat = WEEKLY_CATS[i] ?? 'beard_wash';
                const hasProducts = (productMap[cat]?.length ?? 0) > 0;
                return (
                  <StepRow
                    key={i}
                    n={i + 1}
                    text={step}
                    onPress={hasProducts ? () => {
                      setPickerCategory(cat);
                      setPickerStep(`Step ${i + 1}`);
                      setPickerStepId(cat);
                      setPickerReason(step);
                      setPickerVisible(true);
                    } : undefined}
                  />
                );
              })}
            </InfoCard>

            <InfoCard title="NECKLINE GUIDE">
              <Text style={s.bodyText}>
                <Text style={s.highlight}>Where to set your neckline: </Text>
                Place two fingers above your Adam's apple — the top of your uppermost finger is where the neckline should sit. This creates a clean, natural line that doesn't sit too high (which makes the beard look short) or too low (which merges with the neck).
              </Text>
              <Text style={[s.bodyText, { marginTop: Spacing.md }]}>
                <Text style={s.highlight}>Where to set your cheek line: </Text>
                Follow your natural hair growth. Shave only hairs that fall well below your natural cheek line. Over-shaving the cheek line makes the beard look smaller — let it sit naturally unless you have very high, uneven growth.
              </Text>
            </InfoCard>
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
                No product recommendations yet — rescan to get personalised picks.
              </Text>
            ) : (
              visibleCategories.map(cat => {
                const catRec = productRecs.find(p => p.category === cat);
                const product: Product | undefined =
                  PRODUCTS.find(p => p.category === cat && p.name === catRec?.name && p.brand === catRec?.brand)
                  ?? getProductsForBrands({ category: cat, preferredBrands, fallbackTier: 'budget', gender: 'men', limit: 1 })[0];
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

function StepRow({ n, text, onPress }: { n: number; text: string; onPress?: () => void }) {
  const inner = (
    <>
      <View style={s.stepCircle}>
        <Text style={s.stepNum}>{n}</Text>
      </View>
      <Text style={s.stepText}>{text}</Text>
      {onPress && <Text style={s.stepChevron}>›</Text>}
    </>
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

  pillRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pill:            { backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText:        { fontSize: 9, color: Colors.accent, textTransform: 'capitalize' },
  pillSecondary:   { backgroundColor: Colors.surface2 },
  pillTextSecondary: { fontSize: 9, color: Colors.text2, textTransform: 'capitalize' },

  adviceText: { fontSize: 15, color: Colors.text, fontStyle: 'italic', lineHeight: 22 },
  bodyText:   { fontSize: 15, color: Colors.text2, lineHeight: 22 },
  highlight:  { color: Colors.text, fontWeight: '600' },

  shapeName:     { backgroundColor: Colors.surface2, borderRadius: Radius.input, paddingHorizontal: 12, paddingVertical: 8, marginBottom: Spacing.md, alignSelf: 'flex-start' },
  shapeNameText: { fontSize: 15, color: Colors.text2, fontWeight: '500' },


  stepRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  stepCircle:  { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  stepNum:     { fontSize: 10, color: Colors.accent, fontWeight: '700' },
  stepText:    { flex: 1, fontSize: 15, color: Colors.text2, lineHeight: 20 },
  stepChevron: { fontSize: 18, color: Colors.accent, lineHeight: 22 },

  // Condition cards
  honestCard:  { backgroundColor: Colors.dangerBg, borderRadius: 11, borderWidth: 1, borderColor: Colors.dangerBorder, padding: 12, marginBottom: 12 },
  honestLabel: { fontSize: 9, color: Colors.accent, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  honestBody:  { fontSize: 12, color: Colors.dangerText, lineHeight: 18 },
  goodCard:    { backgroundColor: Colors.successBg, borderRadius: 11, borderWidth: 1, borderColor: Colors.successBorder, padding: 12, marginBottom: 12 },
  goodLabel:   { fontSize: 9, color: Colors.green, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  goodBody:    { fontSize: 12, color: Colors.successText, lineHeight: 18 },

  // Beard styles section
  stylesSection:      { marginTop: 8 },
  stylesSectionTitle: { fontSize: 13, fontWeight: '500', color: Colors.text, marginBottom: 8, marginTop: 4 },
  styleCard:   { backgroundColor: Colors.card, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 8 },
  styleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  styleName:   { fontSize: 13, fontWeight: '500', color: Colors.text },
  maintDot:    { width: 8, height: 8, borderRadius: 4 },
  maintLow:    { backgroundColor: Colors.green },
  maintMed:    { backgroundColor: Colors.accent },
  maintHigh:   { backgroundColor: Colors.dangerStrong },
  styleWhy:    { fontSize: 11, color: Colors.text2, lineHeight: 17 },

  openingLine: { fontSize: 15, color: Colors.text, lineHeight: 22, marginBottom: Spacing.md },

  // Collapsible category tiles
  noBrandsBanner: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accentTintBorder,
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  noBrandsTitle:   { fontFamily: Typography.serif, fontSize: 22, color: Colors.text, marginBottom: 6 },
  noBrandsSub:     { fontSize: 13, color: Colors.text2, lineHeight: 20 },
  noBrandsBtnText: { fontSize: 13, color: Colors.accent, marginTop: 8 },

  catTile: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, marginBottom: 6, overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  catName:   { fontSize: 15, color: Colors.text, fontWeight: '600' },
  catReason: { fontSize: 13, color: Colors.text3, lineHeight: 18 },
  chevron:   { fontSize: 13, color: Colors.text2 },

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
