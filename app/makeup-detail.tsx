// Makeup detail screen — Features | Technique | Products tabs. Women only.
// Receives scanJson and gender as navigation params.

import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import type { Scan } from '../types';

type Tab = 'features' | 'technique' | 'products';

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

  const [tab, setTab] = useState<Tab>('features');

  const products = getMakeupProducts(scan?.brow_shape ?? null, scan?.undereye ?? null);

  // The most notable feature to highlight
  const primaryFeature = scan?.brow_shape === 'sparse' ? 'brow density'
    : scan?.undereye === 'dark' ? 'under-eye pigmentation'
    : scan?.undereye === 'puffy' ? 'under-eye puffiness'
    : scan?.brow_shape ? 'brow shape'
    : null;


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
                {scan?.brow_shape && (
                  <View style={s.pill}>
                    <Text style={s.pillText}>{scan.brow_shape} brows</Text>
                  </View>
                )}
                {scan?.undereye && scan.undereye !== 'normal' && (
                  <View style={[s.pill, s.pillSecondary]}>
                    <Text style={s.pillTextSecondary}>{scan.undereye} under-eye</Text>
                  </View>
                )}
              </View>
            </InfoCard>

            {scan?.brow_shape && (
              <InfoCard title="YOUR BROWS">
                <Text style={s.bodyText}>
                  {BROW_EXPLANATIONS[scan.brow_shape] ?? 'Your brow shape is unique — follow the natural growth pattern as your guide.'}
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

            {scan?.brow_shape && (
              <TouchableOpacity
                onPress={() => {
                  const query = encodeURIComponent(`${scan.brow_shape} brow makeup look`);
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
                  borderColor: '#C9A84C',
                  backgroundColor: 'rgba(201,168,76,0.08)',
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 16 }}>🔍</Text>
                <Text style={{
                  color: '#C9A84C',
                  fontSize: 14,
                  fontWeight: '600',
                }}>
                  See {scan.brow_shape} brow makeup photos
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

            {scan?.brow_shape && (
              <InfoCard title="BROW TECHNIQUE">
                <View style={s.featureLabel}>
                  <Text style={s.featureLabelText}>{scan.brow_shape} brows</Text>
                </View>
                <Text style={s.bodyText}>
                  {BROW_TECHNIQUE[scan.brow_shape] ?? 'Follow your natural brow shape as your guide — fill in gaps lightly with feather strokes and set with clear brow gel.'}
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
          </>
        )}

        {/* ── PRODUCTS ── */}
        {tab === 'products' && (
          <>
            <Text style={s.openingLine}>
              Based on your{scan?.brow_shape ? ` ${scan.brow_shape} brow shape` : ' features'}{scan?.undereye && scan.undereye !== 'normal' ? ` and ${scan.undereye} under-eye` : ''} — these are the products to focus on.
            </Text>
            {products.map((p, i) => (
              <ProductCard key={i} {...p} iconBg="#1A1020" iconColor="#C47FD4" />
            ))}
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
  screenTitle: { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream },

  tabBar: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
  },
  tabPill:           { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: '#1A1A1A' },
  tabPillActive:     { backgroundColor: Colors.gold },
  tabPillText:       { fontSize: Typography.size.sm, color: Colors.textSecondary, fontWeight: '500' },
  tabPillTextActive: { color: Colors.background, fontWeight: '600' },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },

  infoCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.sm,
  },
  infoCardLabel: {
    fontSize: Typography.size.xs, color: Colors.gold,
    letterSpacing: 5, textTransform: 'uppercase', marginBottom: Spacing.md,
  },

  pillRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pill:              { backgroundColor: Colors.goldDim, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText:          { fontSize: Typography.size.sm, color: Colors.gold, textTransform: 'capitalize' },
  pillSecondary:     { backgroundColor: '#1A1A1A' },
  pillTextSecondary: { fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'capitalize' },

  bodyText:   { fontSize: Typography.size.md, color: Colors.textSecondary, lineHeight: 22 },
  adviceText: { fontSize: Typography.size.md, color: Colors.cream, fontStyle: 'italic', lineHeight: 22 },

  featureLabel:     { backgroundColor: '#1A1020', borderRadius: Radius.input, paddingHorizontal: 12, paddingVertical: 8, marginBottom: Spacing.md, alignSelf: 'flex-start' },
  featureLabelText: { fontSize: Typography.size.sm, color: '#C47FD4', fontWeight: '500', textTransform: 'capitalize' },


  openingLine: { fontSize: Typography.size.md, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.md },

  productCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.surface, borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
  },
  productIcon:     { width: 44, height: 44, borderRadius: Radius.icon, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  productIconChar: { fontSize: 20 },
  productBody:     { flex: 1 },
  productName:     { fontSize: Typography.size.md, color: Colors.cream, fontWeight: '600', marginBottom: 4 },
  productWhy:      { fontSize: Typography.size.base, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.sm },
  productTagPill:  { alignSelf: 'flex-start', backgroundColor: '#1A1A1A', borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  productTagText:  { fontSize: Typography.size.xs, color: Colors.textSecondary },
});
