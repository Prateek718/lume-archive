// AddFromRoutineScreen — sectioned list of products from the user's current
// routine (Skin / Hair / Beard / Makeup). Tap to toggle selection; bottom CTA
// inserts each selected product into user_kit via addProductToKitFromBuy.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import {
  BackButton, Body, ChapterLabel, Display, PrimaryButton,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { PRODUCTS, Product } from '../../constants/productConstants';
import { addProductToKitFromBuy, fetchActiveKit } from '../../services/kitService';
import type {
  HairRecommendations, MatchedProduct, Recommendations, RoutineStep, User,
} from '../../types';

type CareCategory = 'skin' | 'hair' | 'beard' | 'makeup';

interface RoutineProductRow {
  step_id:    string;
  step_label: string | null;
  category:   string | null;
  title:      string;        // brand + name (catalogue) or step title fallback
  brand:      string | null;
  name:       string;
  product:    MatchedProduct; // ready for addProductToKitFromBuy
  inKit:      boolean;        // already in active kit (read-only)
}

interface Section {
  key:   CareCategory;
  label: string;
  rows:  RoutineProductRow[];
}

const SECTION_LABELS: Record<CareCategory, string> = {
  skin:   'Skin',
  hair:   'Hair',
  beard:  'Beard',
  makeup: 'Makeup',
};

// Resolve a catalogue product for a given step: prefer category match, then
// nudge by target_concern, then fuzzy-match the descriptor. Mirrors the
// approach used by skin-detail.tsx so the add-from-routine list reflects
// what the detail screens prescribe.
function resolveCatalogueProduct(step: { category?: string | null; product?: string; target_concern?: string }): Product | null {
  const category = step.category;
  if (!category) return null;
  const pool = PRODUCTS.filter(p => p.category === category);
  if (pool.length === 0) return null;

  const targetConcern = step.target_concern ?? null;
  const descriptor = (step.product ?? '').toLowerCase();

  const scored = pool.map(p => {
    let score = 0;
    if (targetConcern && p.primary_concern_target === targetConcern) score += 100;
    if (targetConcern && p.suitable_for_concerns.includes(targetConcern)) score += 30;
    if (descriptor) {
      for (const active of p.actives ?? []) {
        if (descriptor.includes(active.replace(/_/g, ' '))) score += 15;
      }
      if (descriptor.includes(p.name.toLowerCase().split(' ')[0])) score += 5;
    }
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? null;
}

function toMatchedProduct(p: Product): MatchedProduct {
  return {
    id:            p.id,
    category:      p.category,
    name:          p.name,
    brand:         p.brand,
    attributes:    p.actives ?? [],
    price_inr:     p.price_inr,
    price_tier:    p.price_tier,
    actives:       p.actives,
    retailer_urls: p.retailer_urls,
  };
}

function buildRowsFromSteps(
  steps: Array<RoutineStep | { step_id: string; category?: string; product?: string; label?: string; target_concern?: string }>,
  kitStepIds: Set<string>,
): RoutineProductRow[] {
  const seen = new Set<string>();
  const out: RoutineProductRow[] = [];
  for (const s of steps) {
    if (!s.step_id || seen.has(s.step_id)) continue;
    seen.add(s.step_id);
    const cat = (s as { category?: string }).category ?? null;
    const resolved = resolveCatalogueProduct({
      category:       cat ?? undefined,
      product:        (s as { product?: string }).product,
      target_concern: (s as { target_concern?: string }).target_concern,
    });
    if (!resolved) continue;
    const stepLabel = (s as { label?: string }).label ?? null;
    out.push({
      step_id:    s.step_id,
      step_label: stepLabel,
      category:   cat,
      title:      resolved.name,
      brand:      resolved.brand,
      name:       resolved.name,
      product:    toMatchedProduct(resolved),
      inKit:      kitStepIds.has(s.step_id),
    });
  }
  return out;
}

interface LoadedData {
  userId:   string;
  sections: Section[];
}

export default function AddFromRoutineScreen() {
  const router = useRouter();
  const [data, setData]         = useState<LoadedData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) { if (!cancelled) setData({ userId: '', sections: [] }); return; }

      const [userRes, scanRes, kit] = await Promise.all([
        supabase.from('users')
          .select('care_categories, hair_recommendations')
          .eq('id', userId)
          .single(),
        supabase.from('scans')
          .select('recommendations')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        fetchActiveKit(userId),
      ]);

      const userRow = userRes.data as Pick<User, 'care_categories' | 'hair_recommendations'> | null;
      const cats = (userRow?.care_categories ?? ['skin']) as CareCategory[];
      const hairRecs: HairRecommendations | null = userRow?.hair_recommendations ?? null;
      const recs = (scanRes.data as { recommendations: Recommendations | null } | null)?.recommendations ?? null;
      const kitStepIds = new Set(
        kit.map(k => k.step_id).filter((id): id is string => !!id),
      );

      const sections: Section[] = [];
      const order: CareCategory[] = ['skin', 'hair', 'beard', 'makeup'];
      for (const cat of order) {
        if (!cats.includes(cat)) continue;
        let rows: RoutineProductRow[] = [];
        if (cat === 'skin') {
          rows = buildRowsFromSteps(recs?.skin?.steps ?? [], kitStepIds);
        } else if (cat === 'beard') {
          rows = buildRowsFromSteps(recs?.beard?.steps ?? [], kitStepIds);
        } else if (cat === 'hair') {
          rows = buildRowsFromSteps(hairRecs?.routine ?? [], kitStepIds);
        }
        // Makeup has no step-linked products today — surfaced via shade family,
        // not user_kit. Skip section if empty.
        if (rows.length > 0) sections.push({ key: cat, label: SECTION_LABELS[cat], rows });
      }

      if (!cancelled) setData({ userId, sections });
    })();
    return () => { cancelled = true; };
  }, []);

  const totalAddable = useMemo(() => {
    if (!data) return 0;
    return data.sections.reduce(
      (sum, s) => sum + s.rows.filter(r => !r.inKit).length, 0,
    );
  }, [data]);

  const toggle = (stepId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!data || submitting || selected.size === 0) return;
    setSubmitting(true);
    try {
      const flat = data.sections.flatMap(s => s.rows);
      for (const stepId of selected) {
        const row = flat.find(r => r.step_id === stepId);
        if (!row) continue;
        await addProductToKitFromBuy({
          userId:      data.userId,
          product:     row.product,
          stepId:      row.step_id,
          acquiredVia: 'already_owned',
        });
      }
      router.back();
    } catch (err) {
      console.error('[add-from-routine] submit failed', err);
      setSubmitting(false);
    }
  };

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Palette.accent} />
      </SafeAreaView>
    );
  }

  if (data.sections.length === 0) return <EmptyState onBack={() => router.back()} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 140 }}>
        <View style={{ paddingHorizontal: 28, paddingVertical: 8 }}>
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <ChapterLabel>Your kit</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>Add from</Text>
            {'\n'}your routine.
          </Display>
          <Body serif size={14} style={{ marginTop: 16, lineHeight: 22, fontStyle: 'italic', color: Palette.ink2 }}>
            Tap anything you already own.
          </Body>
        </View>

        {data.sections.map((sec) => (
          <View key={sec.key} style={{ paddingTop: 32, paddingHorizontal: 32 }}>
            <ChapterLabel style={{ marginBottom: 14 }}>{sec.label}</ChapterLabel>
            {sec.rows.map((row, i) => (
              <RoutineProductRowView
                key={row.step_id}
                row={row}
                first={i === 0}
                last={i === sec.rows.length - 1}
                checked={selected.has(row.step_id)}
                onToggle={() => toggle(row.step_id)}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Bottom CTA — count updates as user toggles; disabled at zero. */}
      {totalAddable > 0 && (
        <View
          style={{
            position:        'absolute',
            left: 0, right: 0, bottom: 0,
            paddingHorizontal: 32,
            paddingTop:        16,
            paddingBottom:     28,
            backgroundColor:   Palette.bg,
            borderTopWidth:    1,
            borderTopColor:    Palette.rule,
          }}
        >
          <PrimaryButton
            label={submitting ? 'Adding…' : `Add ${selected.size} to my kit →`}
            onPress={handleSubmit}
            disabled={selected.size === 0 || submitting}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

interface RoutineProductRowViewProps {
  row:      RoutineProductRow;
  first:    boolean;
  last:     boolean;
  checked:  boolean;
  onToggle: () => void;
}

function RoutineProductRowView({ row, first, last, checked, onToggle }: RoutineProductRowViewProps) {
  const inKit = row.inKit;
  return (
    <TouchableOpacity
      onPress={inKit ? undefined : onToggle}
      activeOpacity={inKit ? 1 : 0.85}
      style={{
        paddingVertical:    16,
        borderTopWidth:     first ? 1 : 1,
        borderTopColor:     Palette.rule,
        borderBottomWidth:  last ? 1 : 0,
        borderBottomColor:  Palette.rule,
        flexDirection:      'row',
        alignItems:         'center',
        gap:                14,
      }}
    >
      <View style={{ width: 44, height: 56, backgroundColor: Palette.accentSoft }} />
      <View style={{ flex: 1 }}>
        {!!row.brand && (
          <Text
            style={{
              fontFamily:    'Inter_500Medium',
              fontSize:      10,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color:         Palette.ink3,
            }}
          >
            {row.brand}
          </Text>
        )}
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium_Italic',
            fontStyle:  'italic',
            fontSize:   17,
            color:      Palette.ink,
            marginTop:  2,
          }}
        >
          {row.name}
        </Text>
        {!!row.step_label && (
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize:   11.5,
              color:      Palette.ink3,
              marginTop:  3,
            }}
          >
            {row.step_label}
          </Text>
        )}
      </View>
      {inKit ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            style={{
              fontFamily: 'CormorantGaramond_400Regular_Italic',
              fontStyle:  'italic',
              fontSize:   12.5,
              color:      Palette.ink3,
            }}
          >
            In your kit
          </Text>
          <View
            style={{
              width: 18, height: 18, borderRadius: 9,
              borderWidth: 1, borderColor: Palette.ink3,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Svg width={9} height={7} viewBox="0 0 12 9">
              <Path d="M1 4.5L4.5 8L11 1" stroke={Palette.ink3}
                    strokeWidth={1.6} strokeLinecap="round"
                    strokeLinejoin="round" fill="none" />
            </Svg>
          </View>
        </View>
      ) : checked ? (
        <View
          style={{
            width: 18, height: 18, borderRadius: 9,
            backgroundColor: Palette.accent,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Svg width={9} height={7} viewBox="0 0 12 9">
            <Path d="M1 4.5L4.5 8L11 1" stroke={Palette.onScanBg}
                  strokeWidth={1.8} strokeLinecap="round"
                  strokeLinejoin="round" fill="none" />
          </Svg>
        </View>
      ) : (
        <View
          style={{
            width: 18, height: 18, borderRadius: 9,
            borderWidth: 1.5, borderColor: Palette.accent,
          }}
        />
      )}
    </TouchableOpacity>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ flex: 1, padding: 32, paddingTop: 12 }}>
        <BackButton onPress={onBack} style={{ marginLeft: -8 }} />
        <View style={{ marginTop: 30 }}>
          <ChapterLabel>No routine yet</ChapterLabel>
          <Display style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}>
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>Take a reading</Text>
            {'\n'}to begin.
          </Display>
        </View>
        <Body serif size={14} style={{ marginTop: 20, lineHeight: 22, fontStyle: 'italic' }}>
          Your routine appears here once you&apos;ve been seen.
        </Body>
        <View style={{ flex: 1 }} />
        <PrimaryButton label="Take first reading →" onPress={() => router.replace('/scan')} />
      </View>
    </SafeAreaView>
  );
}
