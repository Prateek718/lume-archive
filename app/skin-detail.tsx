// SkinDetailScreen — Analysis + Routine tabs for the skin care plan.
// Translated from design/source/screens-detail.jsx:151-224. Reads the latest
// (or param-specified) scan for the current user from Supabase.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton, Body, ChapterLabel, Display, PrimaryButton } from '../components/editorial';
import {
  ConcernRow,
  DetailHeader,
  NarratorQuote,
  ProductDetailSheet,
  ProductDetailSheetProduct,
  RoutineStep,
  TraitChip,
} from '../components/detail';
import { Palette } from '../constants/theme';
import { PRODUCTS, Product } from '../constants/productConstants';
import { supabase } from '../lib/supabase';
import { errorToMessage } from '../lib/errors';
import { getSkinConcernsDetailed } from '../lib/scanData';
import type {
  Recommendations,
  RoutineStep as RoutineStepType,
  SkinConcernObservation,
  User,
} from '../types';

type Tab = 'Analysis' | 'Routine';

interface ScanRow {
  id:                        string;
  recommendations:           Recommendations | null;
  skin_type?:                string | null;
  skin_undertone?:           string | null;
  skin_concerns_detailed?:   SkinConcernObservation[] | null;
  fitzpatrick_scale?:        number | null;
}

type UserContext = Pick<User, 'care_categories'>;

// ─── Helpers ────────────────────────────────────────────────────────────────────

const SEVERITY_LEVEL: Record<string, 1 | 2 | 3> = {
  mild:        1,
  moderate:    2,
  significant: 3,
};

// Category → default time estimate. Keeps the "30 sec · 1 min" meta line
// meaningful even though Gemini doesn't emit a minutes field yet.
const CATEGORY_MINUTES: Record<string, string> = {
  face_cleanser:          '30 sec',
  toner:                  '15 sec',
  serum_niacinamide:      '20 sec',
  serum_hyaluronic_acid:  '20 sec',
  serum_vitamin_c:        '20 sec',
  serum_retinol:          '20 sec',
  serum_salicylic_acid:   '20 sec',
  serum_azelaic_acid:     '20 sec',
  serum_brightening:      '20 sec',
  serum_soothing:         '20 sec',
  moisturizer:            '40 sec',
  spf_sunscreen:          '1 min',
  eye_cream:              '15 sec',
  face_oil:               '30 sec',
  face_gel:               '30 sec',
  face_mask:              '10 min',
};

function stepTitle(step: RoutineStepType): string {
  const raw = step.product?.trim();
  if (raw && raw.length > 0) return raw;
  return step.label ?? 'Routine step';
}

function stepMinutes(step: RoutineStepType): string {
  if (step.category && CATEGORY_MINUTES[step.category]) return CATEGORY_MINUTES[step.category];
  return '30 sec';
}

// Pick a product from the catalogue that fits a given step, matching on
// category first, then nudging by target_concern and by fuzzy name match
// against the generic descriptor Gemini emitted (e.g. "Niacinamide serum").
function resolveCatalogueProduct(step: RoutineStepType): Product | null {
  if (!step.category) return null;
  const pool = PRODUCTS.filter(p => p.category === step.category);
  if (pool.length === 0) return null;

  const targetConcern = step.target_concern ?? null;
  const descriptor = (step.product ?? '').toLowerCase();

  // Score each candidate. Higher is better.
  const scored = pool.map(p => {
    let score = 0;
    if (targetConcern && p.primary_concern_target === targetConcern) score += 100;
    if (targetConcern && p.suitable_for_concerns.includes(targetConcern)) score += 30;
    // Descriptor fuzz: any distinctive active / brand word in the descriptor
    // that shows up in the product name or actives array.
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

interface RenderedStep {
  key:              string;
  step_id:          string | null;
  when:             string;
  minutes:          string;
  title:            string;
  clinical:         string | null;
  sheetProduct:     ProductDetailSheetProduct | null;
  cardProduct:      { brand: string; name: string; price: number | null } | null;
}

function renderStep(step: RoutineStepType, slot: 'am' | 'pm', idx: number): RenderedStep {
  const product = resolveCatalogueProduct(step);
  return {
    key:     `${step.step_id ?? 'step'}-${slot}-${idx}`,
    step_id: step.step_id ?? null,
    when:    slot === 'am' ? 'Morning' : 'Night',
    minutes: stepMinutes(step),
    title:   stepTitle(step),
    clinical: step.clinical_reasoning ?? null,
    cardProduct: product
      ? { brand: product.brand, name: product.name, price: product.price_inr ?? null }
      : null,
    sheetProduct: product
      ? {
          id:            product.id,
          brand:         product.brand,
          name:          product.name,
          price:         product.price_inr ?? null,
          hero_line:     product.hero_line,
          retailer_urls: product.retailer_urls,
        }
      : null,
  };
}

function partitionSteps(steps: RoutineStepType[] | undefined): {
  morning: RoutineStepType[];
  evening: RoutineStepType[];
} {
  const morning: RoutineStepType[] = [];
  const evening: RoutineStepType[] = [];
  for (const s of steps ?? []) {
    const slots = Array.isArray(s.time_of_day) && s.time_of_day.length > 0
      ? s.time_of_day
      : ['am', 'pm'];
    if (slots.includes('am')) morning.push(s);
    if (slots.includes('pm')) evening.push(s);
  }
  // Order by step.order if available, else keep input order.
  const byOrder = (a: RoutineStepType, b: RoutineStepType) =>
    (a.order ?? 99) - (b.order ?? 99);
  morning.sort(byOrder);
  evening.sort(byOrder);
  return { morning, evening };
}

// Derive the display title for the detail header. Uses the first two insight
// headlines from the scan's observation — insight 01 (positive) reads italic,
// insight 02 (friction) reads upright. Falls back to a quiet default.
function deriveTitle(recs: Recommendations | null): { italic: string; rest: string } {
  const insights = recs?.observation?.insights;
  const first  = insights?.[0]?.headline?.trim();
  const second = insights?.[1]?.headline?.trim();
  if (first && second) {
    return { italic: trimPunct(first) + '.', rest: trimPunct(second) + '.' };
  }
  if (first) {
    return { italic: trimPunct(first) + '.', rest: 'A place to start.' };
  }
  return { italic: 'A reading,', rest: 'one part at a time.' };
}

function trimPunct(s: string): string {
  return s.replace(/[.!?,;:]+$/, '').trim();
}

function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function SkinDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scanId?: string }>();
  const paramScanId = typeof params.scanId === 'string' ? params.scanId : null;

  const [tab, setTab]         = useState<Tab>('Analysis');
  const [scan, setScan]       = useState<ScanRow | null>(null);
  const [user, setUser]       = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErr]    = useState<string | null>(null);

  const [sheetOpen, setSheetOpen]         = useState(false);
  const [sheetProduct, setSheetProduct]   = useState<ProductDetailSheetProduct | null>(null);
  const [sheetReasoning, setSheetReason]  = useState<string | null>(null);
  const [sheetStepId, setSheetStepId]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const authUserId = authData.user?.id;
        if (!authUserId) {
          if (!cancelled) { setErr('Not signed in.'); setLoading(false); }
          return;
        }

        const userQuery = supabase
          .from('users')
          .select('care_categories')
          .eq('id', authUserId)
          .single();

        const scanQuery = paramScanId
          ? supabase
              .from('scans')
              .select('id, recommendations, skin_type, skin_undertone, skin_concerns_detailed, fitzpatrick_scale')
              .eq('id', paramScanId)
              .single()
          : supabase
              .from('scans')
              .select('id, recommendations, skin_type, skin_undertone, skin_concerns_detailed, fitzpatrick_scale')
              .eq('user_id', authUserId)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

        const [{ data: userData, error: uErr }, { data: scanData, error: sErr }] =
          await Promise.all([userQuery, scanQuery]);
        if (cancelled) return;
        if (uErr) throw new Error(uErr.message ?? 'Database error');
        if (sErr) throw new Error(sErr.message ?? 'Database error');

        setUser(userData as UserContext);
        setScan(scanData as ScanRow);
      } catch (err) {
        if (!cancelled) setErr(errorToMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [paramScanId]);

  const skin = scan?.recommendations?.skin ?? null;

  const titleParts = useMemo(() => deriveTitle(scan?.recommendations ?? null), [scan]);

  const traitChips = useMemo<string[]>(() => {
    if (!scan) return [];
    const chips: string[] = [];
    if (scan.skin_type) chips.push(`${scan.skin_type} skin`);
    const wantsMakeup = user?.care_categories?.includes('makeup') ?? false;
    if (wantsMakeup && scan.skin_undertone) {
      chips.push(`${scan.skin_undertone} tone`);
    }
    return chips;
  }, [scan, user]);

  const routineSections = useMemo(() => {
    // Prefer new-schema steps. Fall back to legacy morning/evening arrays.
    const newSteps = skin?.steps;
    if (newSteps && newSteps.length > 0) {
      const { morning, evening } = partitionSteps(newSteps);
      return {
        morning: morning.map((s, i) => renderStep(s, 'am', i)),
        evening: evening.map((s, i) => renderStep(s, 'pm', i)),
      };
    }
    const legacyMorning = skin?.routine?.morning ?? [];
    const legacyEvening = skin?.routine?.evening ?? [];
    return {
      morning: legacyMorning.map((s, i) => renderStep(s, 'am', i)),
      evening: legacyEvening.map((s, i) => renderStep(s, 'pm', i)),
    };
  }, [skin]);

  const openSheet = (
    sp: ProductDetailSheetProduct | null,
    reasoning: string | null,
    stepId: string | null,
  ) => {
    if (!sp) return;
    setSheetProduct(sp);
    setSheetReason(reasoning);
    setSheetStepId(stepId);
    setSheetOpen(true);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Palette.accent} />
          </View>
        ) : errorMsg || !scan || !skin ? (
          <FallbackState message={errorMsg ?? 'Your plan is still being drafted.'} onBack={() => router.back()} />
        ) : (
          <>
            <ScrollView contentContainerStyle={{ paddingTop: 20, paddingBottom: 48 }}>
              <DetailHeader
                chapter="Part one · skin"
                title={
                  <>
                    <Text
                      style={{
                        fontFamily: 'CormorantGaramond_500Medium_Italic',
                        fontStyle:  'italic',
                      }}
                    >
                      {titleParts.italic}
                    </Text>
                    {'\n'}{titleParts.rest}
                  </>
                }
                onBack={() => router.back()}
                tab={tab}
                onTab={t => setTab(t as Tab)}
                tabs={['Analysis', 'Routine']}
              />

              {tab === 'Analysis' && (
                <View style={{ paddingHorizontal: 32, paddingTop: 24, paddingBottom: 40 }}>
                  {traitChips.length > 0 && (
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap:      'wrap',
                        gap:           8,
                        marginBottom:  22,
                      }}
                    >
                      {traitChips.map(c => <TraitChip key={c}>{c}</TraitChip>)}
                    </View>
                  )}
                  <Body serif size={14.5} style={{ lineHeight: 24 }}>
                    {skin.advice}
                  </Body>
                  {(() => {
                    const concerns = getSkinConcernsDetailed(scan);
                    if (concerns.length === 0) return null;
                    return (
                      <View style={{ marginTop: 32 }}>
                        <ChapterLabel style={{ marginBottom: 14 }}>What we saw</ChapterLabel>
                        {concerns.map((c, i, arr) => (
                          <ConcernRow
                            key={`${c.concern}-${i}`}
                            num={i < 9 ? `0${i + 1}` : String(i + 1)}
                            label={c.display_label ?? titleCase(c.concern)}
                            severity={SEVERITY_LEVEL[c.severity] ?? 1}
                            note={c.notes ?? ''}
                            last={i === arr.length - 1}
                          />
                        ))}
                      </View>
                    );
                  })()}
                </View>
              )}

              {tab === 'Routine' && (
                <View style={{ paddingHorizontal: 32, paddingTop: 24, paddingBottom: 40 }}>
                  {skin.routine_note && (
                    <NarratorQuote>&ldquo;{skin.routine_note}&rdquo;</NarratorQuote>
                  )}

                  {routineSections.morning.length > 0 && (
                    <View style={{ marginTop: 26 }}>
                      <ChapterLabel style={{ marginBottom: 14 }}>Morning</ChapterLabel>
                      {routineSections.morning.map((rs, i, arr) => (
                        <RoutineStep
                          key={rs.key}
                          num={padNum(i + 1)}
                          when={rs.when}
                          minutes={rs.minutes}
                          title={rs.title}
                          product={rs.cardProduct}
                          onTap={() => openSheet(rs.sheetProduct, rs.clinical, rs.step_id)}
                          last={i === arr.length - 1}
                        />
                      ))}
                    </View>
                  )}

                  {routineSections.evening.length > 0 && (
                    <View style={{ marginTop: 34 }}>
                      <ChapterLabel style={{ marginBottom: 14 }}>Evening</ChapterLabel>
                      {routineSections.evening.map((rs, i, arr) => (
                        <RoutineStep
                          key={rs.key}
                          num={padNum(routineSections.morning.length + i + 1)}
                          when={rs.when}
                          minutes={rs.minutes}
                          title={rs.title}
                          product={rs.cardProduct}
                          onTap={() => openSheet(rs.sheetProduct, rs.clinical, rs.step_id)}
                          last={i === arr.length - 1}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            <ProductDetailSheet
              visible={sheetOpen}
              onClose={() => setSheetOpen(false)}
              product={sheetProduct}
              clinical_reasoning={sheetReasoning}
              stepId={sheetStepId}
            />
          </>
        )}
      </SafeAreaView>
    </>
  );
}

function padNum(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function FallbackState({ message, onBack }: { message: string; onBack: () => void }) {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingVertical: 8, paddingHorizontal: 28 }}>
        <BackButton onPress={onBack} style={{ marginLeft: -8 }} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: 'center' }}>
        <ChapterLabel>A moment</ChapterLabel>
        <View style={{ height: 14 }} />
        <Display size="small">
          <Display size="small" italic>Not quite</Display>
          {'\n'}ready yet.
        </Display>
        <View style={{ height: 16 }} />
        <Body serif size={14} style={{ fontStyle: 'italic' }}>
          {message}
        </Body>
        <View style={{ height: 30 }} />
        <PrimaryButton label="Back to Routine" onPress={() => router.replace('/(tabs)/routine')} />
      </View>
    </View>
  );
}
