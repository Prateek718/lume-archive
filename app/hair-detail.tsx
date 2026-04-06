// Hair detail screen — Style | Care | Products tabs.
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

type Tab = 'style' | 'care' | 'products';

interface ProductItem { icon: string; name: string; why: string; tag: string; }

// ── Data helpers ───────────────────────────────────────────────────────────────

function getConditionExplanation(texture: string | null, condition: string | null): string {
  if (condition === 'dry')
    return `Dry hair has a rough, lifted cuticle layer that lets moisture escape. This is why it can feel coarse, look dull, and frizz easily — the surface cannot hold water in or reflect light smoothly.`;
  if (condition === 'oily')
    return `Your scalp produces excess sebum, which travels down the hair shaft — faster on ${texture === 'straight' ? 'straight' : 'your'} hair type. This causes roots to look flat and greasy within a day or two of washing.`;
  if (condition === 'damaged')
    return `Damaged hair has broken protein bonds inside the cortex, caused by heat, chemical treatment, or mechanical stress. Strands are structurally weakened, prone to breakage, and struggle to retain moisture.`;
  if (condition === 'thinning')
    return `Your follicles are producing finer or fewer strands — visible thinning at the parting or crown. This can be caused by hormonal changes, nutrition, stress, or genetics.`;
  if (condition === 'healthy')
    return `Your hair is in great condition — the cuticle is smooth and closed, reflecting light well and retaining moisture effectively. The goal now is maintaining what you have.`;
  return `Your hair is showing signs of imbalance. A targeted care routine will restore it to its best condition over the coming weeks.`;
}

function getWashRoutine(texture: string | null, condition: string | null): { frequency: string; steps: string[] } {
  if (texture === 'curly' || texture === 'coily') {
    return {
      frequency: '2–3 times a week',
      steps: [
        'Soak hair completely with lukewarm water for at least 60 seconds',
        'Apply sulphate-free shampoo to the scalp only — avoid mid-lengths',
        'Apply a rich conditioner from mid-shaft to ends',
        'Detangle gently with a wide-tooth comb while conditioner is in',
        'Rinse with cool water and scrunch — never rub dry',
        'Diffuse on the lowest heat setting or air-dry with a microfibre towel',
      ],
    };
  }
  if (condition === 'oily' || texture === 'straight') {
    return {
      frequency: 'Every other day',
      steps: [
        'Pre-wet hair for 30 seconds before any product',
        'Apply clarifying shampoo to the scalp and massage for 60 seconds',
        'Rinse completely — residue makes oiliness return faster',
        'Apply lightweight conditioner to ends only',
        'Rinse with cool water to tighten the cuticle',
      ],
    };
  }
  if (condition === 'dry' || condition === 'damaged') {
    return {
      frequency: 'Twice a week maximum',
      steps: [
        'Apply a light oil to dry ends 10 minutes before washing',
        'Use a gentle, sulphate-free shampoo — one pass only',
        'Apply deep conditioner from mid-length to ends',
        'Leave in for 5 minutes under a shower cap if possible',
        'Rinse with cool water — never hot',
        'Pat dry gently — rubbing causes mechanical damage',
      ],
    };
  }
  return {
    frequency: '2–3 times a week',
    steps: [
      'Pre-wet hair thoroughly before applying any product',
      'Shampoo the scalp with a gentle formula',
      'Apply conditioner from mid-lengths to ends',
      'Rinse completely with cool water',
      'Pat dry and style as usual',
    ],
  };
}

function getWeeklyTreatment(texture: string | null, condition: string | null): string {
  if (condition === 'dry' || condition === 'damaged')
    return 'Apply a deep conditioning mask from mid-length to ends. Cover with a shower cap and leave for 20 minutes — the heat amplifies absorption. Rinse thoroughly without shampooing after.';
  if (condition === 'oily')
    return 'Use a clarifying shampoo this day only. It resets scalp buildup and excess sebum without disrupting the daily routine. Follow with a light conditioner on ends only.';
  if (condition === 'thinning')
    return 'Massage a growth-stimulating oil (rosemary, peppermint, or a caffeine scalp serum) into the scalp for 5–10 minutes. Consistent weekly scalp massage measurably improves follicle circulation.';
  if (texture === 'curly' || texture === 'coily')
    return 'Do a protein treatment every 4–6 weeks to rebuild strength. Use a treatment containing hydrolysed keratin — leave for 15 minutes then rinse. Balance with a moisture mask the following week.';
  return 'Apply a nourishing hair mask to mid-lengths and ends. Focus on the most porous sections. A 10–15 minute weekly treatment maintains condition between washes.';
}

function getHairProducts(texture: string | null, condition: string | null): ProductItem[] {
  if (texture === 'curly' || texture === 'coily') {
    return [
      { icon: '◎', name: 'Curl-defining cream', why: 'Defines your curl pattern and reduces frizz by adding moisture and hold without stiffness.', tag: 'Definition' },
      { icon: '◆', name: 'Deep moisture mask', why: `${texture === 'coily' ? 'Coily' : 'Curly'} hair is naturally dry — a weekly mask restores hydration and softens the curl for easier detangling.`, tag: 'Hydration' },
      { icon: '◎', name: 'Anti-frizz oil', why: 'Seals the cuticle and tames flyaways. Apply to damp hair before styling to lock in moisture.', tag: 'Frizz control' },
    ];
  }
  if (texture === 'wavy') {
    return [
      { icon: '◎', name: 'Wave-enhancing cream', why: 'Defines your natural wave pattern and adds lightweight hold without weighing hair down.', tag: 'Definition' },
      { icon: '◇', name: 'Anti-humidity serum', why: 'Prevents humidity from frizzing out your waves — apply to mid-lengths and ends before stepping out.', tag: 'Frizz control' },
      { icon: '◎', name: 'Sulphate-free shampoo', why: 'Gentle formula that cleanses without stripping the natural oils that help wavy hair stay defined.', tag: 'Cleanse' },
    ];
  }
  if (condition === 'dry') {
    return [
      { icon: '◎', name: 'Argan oil conditioner', why: 'Rich in fatty acids that penetrate the hair shaft and restore the moisture that dry, lifted cuticles lose between washes.', tag: 'Hydration' },
      { icon: '◎', name: 'Sulphate-free shampoo', why: 'Mild formula that cleans without stripping — sulphates are too harsh for already dry hair.', tag: 'Cleanse' },
      { icon: '◇', name: 'Heat protectant spray', why: 'Dry hair is already weakened — a UV and heat shield prevents further moisture loss from styling.', tag: 'Protection' },
    ];
  }
  if (condition === 'oily') {
    return [
      { icon: '◎', name: 'Clarifying shampoo', why: 'Breaks down excess sebum and product buildup at the scalp. Use once a week to reset without over-drying.', tag: 'Scalp care' },
      { icon: '◇', name: 'Lightweight leave-in', why: 'Hydrates lengths and ends without touching the scalp — oily roots need moisture-free zones.', tag: 'Hydration' },
      { icon: '◎', name: 'Dry shampoo', why: 'Absorbs oil at the roots between washes — reduces over-washing, which can worsen oiliness over time.', tag: 'Between washes' },
    ];
  }
  if (condition === 'damaged') {
    return [
      { icon: '◆', name: 'Protein treatment mask', why: 'Rebuilds broken protein bonds inside the hair shaft. Apply to clean, damp hair once a week for 15 minutes.', tag: 'Repair' },
      { icon: '◎', name: 'Bond-repair conditioner', why: 'Targets internal hair structure to restore strength — look for bis-aminopropyl diglycol dimaleate as an active.', tag: 'Strength' },
      { icon: '◇', name: 'Split-end serum', why: 'Smooths and temporarily seals split ends while reducing further breakage from friction and heat.', tag: 'Protection' },
    ];
  }
  if (condition === 'thinning') {
    return [
      { icon: '◎', name: 'Biotin-enriched shampoo', why: 'Biotin (vitamin B7) supports keratin production — consistent use can improve hair shaft thickness over months.', tag: 'Growth' },
      { icon: '◇', name: 'Scalp stimulating serum', why: 'Increases circulation at the follicle level — look for rosemary oil, minoxidil, or caffeine as actives.', tag: 'Scalp' },
      { icon: '◎', name: 'Volumising mousse', why: 'Adds body to fine strands — apply to wet hair at the roots and blow-dry upward for maximum lift.', tag: 'Volume' },
    ];
  }
  return [
    { icon: '◎', name: 'Nourishing conditioner', why: 'Maintains hydration in healthy hair — consistency matters more than intensity at this stage.', tag: 'Maintenance' },
    { icon: '◇', name: 'UV protection spray', why: 'Sun exposure degrades keratin and fades colour — a UV shield preserves your condition.', tag: 'Protection' },
    { icon: '◆', name: 'Weekly hydrating mask', why: 'Proactive treatment to prevent dryness before it starts — easier than fixing problems later.', tag: 'Prevention' },
  ];
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function HairDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scanJson, gender = 'man' } = useLocalSearchParams<{ scanJson: string; gender: string }>();
  const scan = scanJson ? (JSON.parse(scanJson) as Scan) : null;
  const rec  = scan?.recommendations;

  const [tab,          setTab]          = useState<Tab>('style');
  const [selectedStyle, setSelectedStyle] = useState<string>(rec?.hair?.styles?.[0] ?? '');

  const profileTags = [
    scan?.hair_texture, scan?.hair_condition,
    scan?.face_shape ? `${scan.face_shape} face` : null,
  ].filter(Boolean) as string[];

  const { frequency, steps } = getWashRoutine(scan?.hair_texture ?? null, scan?.hair_condition ?? null);
  const products = getHairProducts(scan?.hair_texture ?? null, scan?.hair_condition ?? null);

  return (
    <View style={s.screen}>
      <StatusBar style="light" />

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
            <InfoCard title="YOUR HAIR PROFILE">
              <View style={s.pillRow}>
                {profileTags.map(tag => (
                  <View key={tag} style={s.pill}>
                    <Text style={s.pillText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </InfoCard>

            {rec?.hair?.advice && (
              <InfoCard title="WHAT TO ASK YOUR STYLIST">
                <Text style={s.adviceText}>"{rec.hair.advice}"</Text>
              </InfoCard>
            )}

            {rec?.hair?.styles && rec.hair.styles.length > 0 && (
              <InfoCard title="STYLES THAT SUIT YOU">
                <View style={s.stylesRow}>
                  {rec.hair.styles.map(style => (
                    <TouchableOpacity
                      key={style}
                      style={[s.styleCard, selectedStyle === style && s.styleCardActive]}
                      onPress={() => setSelectedStyle(style)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.styleName, selectedStyle === style && s.styleNameActive]} numberOfLines={3}>
                        {style}
                      </Text>
                      <View style={[s.styleLine, selectedStyle === style && s.styleLineActive]} />
                    </TouchableOpacity>
                  ))}
                </View>

                {selectedStyle && (
                  <TouchableOpacity
                    onPress={() => {
                      const query = encodeURIComponent(`${selectedStyle} hairstyle`);
                      Linking.openURL(`https://www.google.com/search?q=${query}&tbm=isch`);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      marginTop: 16,
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
                      See {selectedStyle} photos
                    </Text>
                  </TouchableOpacity>
                )}
              </InfoCard>
            )}
          </>
        )}

        {/* ── CARE ── */}
        {tab === 'care' && (
          <>
            <InfoCard title="WHY YOUR HAIR NEEDS THIS">
              <Text style={s.bodyText}>
                {getConditionExplanation(scan?.hair_texture ?? null, scan?.hair_condition ?? null)}
              </Text>
            </InfoCard>

            <InfoCard title={`WASH DAYS — ${frequency.toUpperCase()}`}>
              {steps.map((step, i) => (
                <StepRow key={i} n={i + 1} text={step} />
              ))}
            </InfoCard>

            <InfoCard title="ONCE A WEEK">
              <Text style={s.bodyText}>
                {getWeeklyTreatment(scan?.hair_texture ?? null, scan?.hair_condition ?? null)}
              </Text>
            </InfoCard>
          </>
        )}

        {/* ── PRODUCTS ── */}
        {tab === 'products' && (
          <>
            <Text style={s.openingLine}>
              Based on your{scan?.hair_texture ? ` ${scan.hair_texture}` : ''}{scan?.hair_condition ? `, ${scan.hair_condition}` : ''} hair — these are the ingredient types to look for.
            </Text>
            {products.map((p, i) => (
              <ProductCard key={i} {...p} iconBg="#2A2010" iconColor={Colors.gold} />
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
  tabPill:         { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.pill, backgroundColor: '#1A1A1A' },
  tabPillActive:   { backgroundColor: Colors.gold },
  tabPillText:     { fontSize: Typography.size.sm, color: Colors.textSecondary, fontWeight: '500' },
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

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pill:    { backgroundColor: Colors.goldDim, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText:{ fontSize: Typography.size.sm, color: Colors.gold, textTransform: 'capitalize' },

  adviceText: { fontSize: Typography.size.md, color: Colors.cream, fontStyle: 'italic', lineHeight: 22 },
  bodyText:   { fontSize: Typography.size.md, color: Colors.textSecondary, lineHeight: 22 },

  // Style cards
  stylesRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  styleCard: {
    flex: 1, height: 80, backgroundColor: Colors.surface,
    borderRadius: Radius.input, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xs, gap: 6,
  },
  styleCardActive: { borderColor: Colors.gold },
  styleName:       { fontFamily: Typography.serif, fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 17 },
  styleNameActive: { color: Colors.cream },
  styleLine:       { width: 20, height: 1, backgroundColor: Colors.border },
  styleLineActive: { backgroundColor: Colors.gold },

  // Steps
  stepRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  stepCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.goldDim, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  stepNum:    { fontSize: Typography.size.xs, color: Colors.gold, fontWeight: '700' },
  stepText:   { flex: 1, fontSize: Typography.size.md, color: Colors.textSecondary, lineHeight: 20 },

  openingLine: { fontSize: Typography.size.md, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.md },

  // Product cards
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
