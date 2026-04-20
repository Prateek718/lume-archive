// Makeup detail screen — Features | Technique | Products tabs. Women only.
// Receives scanJson and gender as navigation params.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { PRODUCTS, getProductsForBrands } from '../constants/productConstants';
import type { Product } from '../constants/productConstants';
import { logProductEvent, getProductMap } from '../services/scanService';
import { supabase } from '../lib/supabase';
import type { Scan, MatchedProduct } from '../types';
import ProductPickerSheet from '../components/ProductPickerSheet';

type Tab = 'features' | 'technique' | 'products';

function formatCategoryName(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getMakeupCategoryForStep(label: string): string {
  const map: Record<string, string> = {
    'Eyes':       'kajal_eyeliner',
    'Kajal':      'kajal_eyeliner',
    'Brows':      'eyebrow_pencil',
    'Lips':       'lipstick_nude',
    'Lip colour': 'lipstick_nude',
    'Base':       'foundation_medium',
    'Foundation': 'foundation_medium',
    'Concealer':  'concealer',
    'Cover':      'concealer',
  };
  return map[label] ?? 'kajal_eyeliner';
}

interface ProductItem { icon: string; name: string; why: string; tag: string; }

// ── Data helpers ───────────────────────────────────────────────────────────────

const BROW_EXPLANATIONS: Record<string, string> = {
  sparse:   'Your brows are naturally lighter or thinner in density, which can make the eye area appear less defined. The goal is to add the illusion of fullness using fine, hair-like strokes — not a solid filled-in block.',
  arch:     'Your brows have a natural arch, which adds lift and structure to the eye area. This is a versatile shape that suits most techniques — the priority is maintaining definition without over-shaping.',
  straight: 'Your brows are straight across with minimal arch, giving a youthful, modern appearance. A slight curve at the tail can add subtle lift without altering the natural look dramatically.',
  rounded:  'Your brows have a gentle, rounded curve that softens the face. Extending the tail very slightly creates more structure and length, which works well for most face shapes.',
};

const UNDEREYE_EXPLANATIONS: Record<string, string> = {
  dark:   'Detected under-eye hyperpigmentation — a combination of melanin deposit and thinning skin that makes blood vessels more visible. This is extremely common in South Asian skin tones and responds well to the right approach.',
  puffy:  'Detected puffiness under the eyes, caused by fluid retention or fat pad prominence. Makeup technique is more effective than heavy coverage here — the right products and placements matter more than product quantity.',
  hollow: 'Detected a hollowness or shadowing under the eyes. This requires a lighter-touch approach — heavy coverage can sit in the hollow and make it more visible, while thin-coverage illuminating products diffuse it naturally.',
  normal: 'No significant under-eye concerns were detected. Light coverage and good SPF protection will maintain this.',
};

const BROW_TECHNIQUE: Record<string, string> = {
  sparse:   'Use a micro-tip brow pencil to draw individual feather strokes in the direction of existing hair growth. Work from the front of the brow inward — never draw a solid line from arch to tail. Build density in layers. A clear brow gel set everything in place afterward.',
  arch:     'Fill lightly with an angled brush and powder shadow — this gives more natural coverage than a pencil for already-defined brows. Focus on the underside of the arch to define it without adding bulk. Comb upward with a spoolie after to soften.',
  straight: 'Keep the front third completely natural — start any product from the mid-brow onward. Use the very tip of a pencil or angled brush to create a subtle upward lift at the tail. This creates the appearance of a gentle arch without looking drawn-on.',
  rounded:  'Extend the tail of the brow very slightly beyond its natural end, angling slightly downward. Use feather strokes only — no solid lines. A touch of highlight directly under the arch bone adds definition and lift.',
};

const UNDEREYE_TECHNIQUE: Record<string, string> = {
  dark:   'Apply a peach or orange colour corrector first — this cancels out the blue-grey or purple tones. A small amount on the inner corner and darkest area is enough. Set with a very thin layer of lightweight concealer (patted, not rubbed) then set with a translucent powder using a damp sponge.',
  puffy:  'Avoid shimmery or light-reflecting shadow on the inner corner and lid — it draws attention to puffiness. Use matte shades only on the inner two-thirds of the eye. Apply concealer with a pressing motion, not dragging. A cool jade roller for 5 minutes before makeup significantly reduces morning puffiness.',
  hollow: 'Avoid heavy or full-coverage concealer — it sits in the hollow and makes shadows worse. Use a thin-coverage, slightly luminous formula patted gently only on the darkest part of the shadow. A very thin line of highlighter on the inner corner lifts the look without adding bulk.',
  normal: 'Apply a light concealer only where needed. Setting with a small amount of translucent powder prevents creasing throughout the day.',
};

function getMakeupProducts(browShape: string | null, undereye: string | null): ProductItem[] {
  const base: ProductItem = {
    icon: '◯',
    name: 'SPF-infused tinted moisturiser',
    why: 'Provides light coverage, hydration, and sun protection in one step — the most efficient daily base product. SPF is critical for preventing the hyperpigmentation that\'s common in Indian skin.',
    tag: 'Daily base',
  };

  if (browShape === 'sparse') {
    return [
      { icon: '◇', name: 'Brow serum with peptides', why: 'Peptide-based serums stimulate follicle activity to produce thicker, denser brow hairs over consistent use of 8–12 weeks.', tag: 'Growth' },
      { icon: '◆', name: 'Micro-tip brow pencil', why: 'Ultra-fine tip creates individual hair-like strokes for natural fullness — the most realistic result for sparse brows vs. a standard angled pencil.', tag: 'Definition' },
      base,
    ];
  }
  if (undereye === 'dark') {
    return [
      { icon: '◎', name: 'Caffeine eye cream', why: 'Improves microcirculation under the eye, reducing the blood pooling that contributes to dark circles — use morning and night for best results.', tag: 'Eye care' },
      { icon: '◆', name: 'Peach colour corrector', why: 'Cancels blue-grey and purple undertones before concealer — this is what makes concealer work on dark circles rather than just masking them in grey.', tag: 'Colour correction' },
      base,
    ];
  }
  if (undereye === 'puffy') {
    return [
      { icon: '≡', name: 'Cold jade roller', why: 'Constricts blood vessels and drains lymphatic fluid — 5 minutes of use before makeup reduces visible puffiness more effectively than any product.', tag: 'De-puff' },
      { icon: '◎', name: 'Caffeine + niacinamide eye gel', why: 'Caffeine reduces puffiness while niacinamide strengthens the thin under-eye skin and reduces discolouration simultaneously.', tag: 'Eye care' },
      base,
    ];
  }
  return [
    { icon: '◎', name: 'Lightweight concealer', why: 'Thin-coverage formula that blends naturally for a no-makeup finish — heavy formulas emphasise texture and settle into fine lines.', tag: 'Coverage' },
    { icon: '◇', name: 'Translucent setting powder', why: 'Sets concealer and foundation without adding more coverage or colour — prevents creasing under eyes and extends wear time.', tag: 'Setting' },
    base,
  ];
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function MakeupDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanJson } = useLocalSearchParams<{ scanJson: string }>();
  const scan = scanJson ? (JSON.parse(scanJson) as Scan) : null;
  const rec  = scan?.recommendations;

  const [tab,              setTab]             = useState<Tab>('features');
  const [preferredBrands,  setPreferredBrands]  = useState<string[]>([]);
  const [brandsLoaded,     setBrandsLoaded]     = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Product picker state
  const [pickerVisible,  setPickerVisible]  = useState(false);
  const [pickerCategory, setPickerCategory] = useState('');
  const [pickerStep,     setPickerStep]     = useState('');
  const [pickerReason,   setPickerReason]   = useState('');

  useEffect(() => {
    const loadUserPrefs = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBrandsLoaded(true); return; }
      const { data } = await supabase
        .from('users')
        .select('preferred_brands_v2')
        .eq('id', user.id)
        .single();
      const row = data as { preferred_brands_v2?: { makeup?: string[] } } | null;
      const pb = row?.preferred_brands_v2 as { makeup?: string[] } | null;
      setPreferredBrands(pb?.makeup ?? []);
      if (scan?.id) {
        getProductMap(scan.id).then(setProductMap);
      }
      setBrandsLoaded(true);
    };
    loadUserPrefs();
  }, []);

  const MAKEUP_CATEGORIES = ['foundation_fair', 'foundation_medium', 'foundation_deep', 'kajal_eyeliner', 'eyebrow_pencil', 'lipstick_nude', 'lipstick_red', 'lipstick_berry', 'lip_balm'];
  const productRecs = (rec?.products ?? []).filter(p => MAKEUP_CATEGORIES.includes(p.category));
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
    Linking.openURL(product.nykaa_url);
  };

  const makeupRecs = rec?.makeup ?? null;

  // Skin context for no-base card
  const skinConcerns         = scan?.skin_concerns ?? [];
  const hasHyperpigmentation = skinConcerns.includes('hyperpigmentation') ||
                               skinConcerns.includes('uneven_texture');
  const needsBase            = hasHyperpigmentation;

  // Product map for picker — loaded from AsyncStorage (stored during scan)
  const [productMap, setProductMap] = useState<Record<string, MatchedProduct[]>>({});

  // Routine steps for technique tab — tappable, open product picker
  const makeupRoutineSteps: { label: string; reason: string }[] = [
    ...(needsBase
      ? [{ label: 'Base', reason: 'Foundation or BB cream to even skin tone' }]
      : []),
    ...(scan?.undereye === 'dark'
      ? [{ label: 'Concealer', reason: 'Colour correct and conceal dark circles' }]
      : []),
    ...(scan?.brow_condition
      ? [{ label: 'Brows', reason: 'Define and fill brow area' }]
      : []),
    { label: 'Eyes',  reason: 'Kajal for eye definition' },
    { label: 'Lips',  reason: 'Lip colour to complete the look' },
  ];

  // The most notable feature to highlight
  const primaryFeature = scan?.brow_condition === 'sparse' ? 'brow density'
    : scan?.undereye === 'dark' ? 'under-eye pigmentation'
    : scan?.undereye === 'puffy' ? 'under-eye puffiness'
    : scan?.brow_condition ? 'brow shape'
    : null;


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
        <Text style={s.screenTitle}>Makeup</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.tabBar}>
        {(['features', 'technique', 'products'] as Tab[]).map(t => (
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
        {/* ── FEATURES ── */}
        {tab === 'features' && (
          <>
            <InfoCard title="YOUR FEATURE PROFILE">
              <View style={s.pillRow}>
                {scan?.brow_condition && (
                  <View style={s.pill}>
                    <Text style={s.pillText}>{scan.brow_condition} brows</Text>
                  </View>
                )}
                {scan?.undereye && scan.undereye !== 'normal' && (
                  <View style={[s.pill, s.pillSecondary]}>
                    <Text style={s.pillTextSecondary}>{scan.undereye} under-eye</Text>
                  </View>
                )}
              </View>
            </InfoCard>

            {scan?.brow_condition && (
              <InfoCard title="YOUR BROWS">
                <Text style={s.bodyText}>
                  {BROW_EXPLANATIONS[scan.brow_condition] ?? 'Your brow shape is unique — follow the natural growth pattern as your guide.'}
                </Text>
              </InfoCard>
            )}

            {scan?.undereye && (
              <InfoCard title="YOUR UNDER-EYE AREA">
                <Text style={s.bodyText}>
                  {UNDEREYE_EXPLANATIONS[scan.undereye] ?? 'Under-eye area appears normal — light concealer when needed is sufficient.'}
                </Text>
              </InfoCard>
            )}

            {primaryFeature && (
              <InfoCard title="KEY INSIGHT">
                <Text style={s.adviceText}>
                  "{primaryFeature === 'brow density'
                    ? 'Sparse brows respond better to technique than product quantity — three precise strokes outperform a full brow pencil stroke every time.'
                    : primaryFeature === 'under-eye pigmentation'
                    ? 'Colour correction before concealer is the single most impactful step for under-eye darkness — concealer alone cannot neutralise the undertone.'
                    : primaryFeature === 'under-eye puffiness'
                    ? 'Product is the last resort for puffiness — cold, drainage, and sleep quality make the most visible difference before makeup even begins.'
                    : 'Work with your natural features rather than against them — the most flattering makeup enhances what\'s there.'
                  }"
                </Text>
              </InfoCard>
            )}

            {scan?.brow_condition && (
              <TouchableOpacity
                onPress={() => {
                  const query = encodeURIComponent(`${scan.brow_condition} brow makeup look`);
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
                  See {scan.brow_condition} brow makeup photos
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── TECHNIQUE ── */}
        {tab === 'technique' && (
          <>
            {rec?.makeup?.advice && (
              <InfoCard title="ADVISOR NOTES">
                <Text style={s.adviceText}>"{rec.makeup.advice}"</Text>
              </InfoCard>
            )}

            {scan?.brow_condition && (
              <InfoCard title="BROW TECHNIQUE">
                <View style={s.featureLabel}>
                  <Text style={s.featureLabelText}>{scan.brow_condition} brows</Text>
                </View>
                <Text style={s.bodyText}>
                  {BROW_TECHNIQUE[scan.brow_condition] ?? 'Follow your natural brow shape as your guide — fill in gaps lightly with feather strokes and set with clear brow gel.'}
                </Text>
              </InfoCard>
            )}

            {scan?.undereye && (
              <InfoCard title="UNDER-EYE TECHNIQUE">
                <View style={s.featureLabel}>
                  <Text style={s.featureLabelText}>{scan.undereye} under-eye</Text>
                </View>
                <Text style={s.bodyText}>
                  {UNDEREYE_TECHNIQUE[scan.undereye] ?? 'Apply a light concealer only where needed, patting gently rather than rubbing. Set with translucent powder.'}
                </Text>
              </InfoCard>
            )}

            {!needsBase && (
              <View style={s.noBaseCard}>
                <Text style={s.noBaseLabel}>YOU DON'T NEED A BASE</Text>
                <Text style={s.noBaseBody}>
                  Your skin tone is even — foundation or BB cream isn't necessary. The products below enhance your features without coverage.
                </Text>
              </View>
            )}

            {makeupRoutineSteps.length > 0 && (
              <InfoCard title="YOUR ROUTINE">
                {makeupRoutineSteps.map((step, i) => {
                  const cat = getMakeupCategoryForStep(step.label);
                  const hasProducts = (productMap[cat]?.length ?? 0) > 0;
                  return (
                    <StepRow
                      key={i}
                      n={i + 1}
                      text={step.label}
                      onPress={hasProducts ? () => {
                        setPickerCategory(cat);
                        setPickerStep(step.label);
                        setPickerReason(step.reason);
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
                No product recommendations yet — rescan to get personalised picks.
              </Text>
            ) : (
              visibleCategories.map(cat => {
                const catRec = productRecs.find(p => p.category === cat);
                const product: Product | undefined =
                  PRODUCTS.find(p => p.category === cat && p.name === catRec?.name && p.brand === catRec?.brand)
                  ?? getProductsForBrands({ category: cat, preferredBrands, fallbackTier: 'budget', gender: 'women', limit: 1 })[0];
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
                              <View style={[s.matchFill, { width: `${catRec?.match_score ?? 0}%` as `${number}%` }]} />
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

  pillRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pill:              { backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText:          { fontSize: 9, color: Colors.accent, textTransform: 'capitalize' },
  pillSecondary:     { backgroundColor: Colors.surface2 },
  pillTextSecondary: { fontSize: 9, color: Colors.text2, textTransform: 'capitalize' },

  bodyText:   { fontSize: 15, color: Colors.text2, lineHeight: 22 },
  adviceText: { fontSize: 15, color: Colors.text, fontStyle: 'italic', lineHeight: 22 },

  featureLabel:     { backgroundColor: Colors.surface2, borderRadius: Radius.input, paddingHorizontal: 12, paddingVertical: 8, marginBottom: Spacing.md, alignSelf: 'flex-start' },
  featureLabelText: { fontSize: 11, color: Colors.text2, fontWeight: '500', textTransform: 'capitalize' },

  // Routine steps
  stepRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  stepCircle:  { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNum:     { fontSize: 10, color: Colors.accent, fontWeight: '700' },
  stepText:    { flex: 1, fontSize: 14, color: Colors.text2 },
  stepChevron: { fontSize: 18, color: Colors.accent, lineHeight: 22 },

  // No-base card
  noBaseCard:  { backgroundColor: Colors.successBg, borderRadius: 11, borderWidth: 1, borderColor: Colors.successBorder, padding: 12, marginBottom: 12 },
  noBaseLabel: { fontSize: 9, color: Colors.green, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  noBaseBody:  { fontSize: 12, color: Colors.successText, lineHeight: 18 },

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
