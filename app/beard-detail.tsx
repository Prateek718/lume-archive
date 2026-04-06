// Beard detail screen — Shape | Routine | Products tabs. Men only.
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

type Tab = 'shape' | 'routine' | 'products';

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
      { icon: '≡', name: 'Beard balm (light hold)', why: 'Even for lighter growth, balm conditions the skin underneath and trains sparse hairs to lie flat and look more intentional.', tag: 'Grooming' },
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

  const [tab, setTab] = useState<Tab>('shape');

  const faceShapeBeard = FACE_SHAPE_BEARD[scan?.face_shape ?? ''] ?? null;
  const products       = getBeardProducts(scan?.beard_density ?? null);


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
                  See {faceShapeBeard.style} photos
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── ROUTINE ── */}
        {tab === 'routine' && (
          <>
            <InfoCard title="DAILY">
              {DAILY_STEPS.map((step, i) => (
                <StepRow key={i} n={i + 1} text={step} />
              ))}
            </InfoCard>

            <InfoCard title="WEEKLY">
              {WEEKLY_STEPS.map((step, i) => (
                <StepRow key={i} n={i + 1} text={step} />
              ))}
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
            <Text style={s.openingLine}>
              Based on your{scan?.beard_density ? ` ${scan.beard_density}` : ''} beard density — these are the products and ingredients to look for.
            </Text>
            {products.map((p, i) => (
              <ProductCard key={i} {...p} iconBg="#1A2010" iconColor="#6BCB77" />
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

  pillRow:         { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pill:            { backgroundColor: Colors.goldDim, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText:        { fontSize: Typography.size.sm, color: Colors.gold, textTransform: 'capitalize' },
  pillSecondary:   { backgroundColor: '#1A1A1A' },
  pillTextSecondary: { fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'capitalize' },

  adviceText: { fontSize: Typography.size.md, color: Colors.cream, fontStyle: 'italic', lineHeight: 22 },
  bodyText:   { fontSize: Typography.size.md, color: Colors.textSecondary, lineHeight: 22 },
  highlight:  { color: Colors.cream, fontWeight: '600' },

  shapeName:     { backgroundColor: '#1A2010', borderRadius: Radius.input, paddingHorizontal: 12, paddingVertical: 8, marginBottom: Spacing.md, alignSelf: 'flex-start' },
  shapeNameText: { fontSize: Typography.size.md, color: '#6BCB77', fontWeight: '500' },


  stepRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  stepCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.goldDim, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  stepNum:    { fontSize: Typography.size.xs, color: Colors.gold, fontWeight: '700' },
  stepText:   { flex: 1, fontSize: Typography.size.md, color: Colors.textSecondary, lineHeight: 20 },

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
