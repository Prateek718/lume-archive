// BeardDetailScreen — Shape + Routine tabs for the beard care plan.
// Translated from design/source/screens-detail.jsx:292-367. The Shape tab
// pulls a curated style from constants/beardStyles.ts (face_shape × beard_goal)
// and an optional editorial bridge sentence from the Gemini recs.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { BackButton, Body, ChapterLabel, Display, PrimaryButton } from '../components/editorial';
import {
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
import { getBeardStyle, FaceShape } from '../constants/beardStyles';
import type {
  BeardGoal,
  BeardRecommendation,
  Recommendations,
  RoutineStep as RoutineStepType,
  Scan,
} from '../types';

type Tab = 'Shape' | 'Routine';

interface ScanRow {
  id:               string;
  recommendations:  Recommendations | null;
  face_shape:       Scan['face_shape'];
  beard_density:    Scan['beard_density'];
  beard_condition:  Scan['beard_condition'];
}

interface UserContext {
  beard_goal: BeardGoal | null;
}

const BEARD_CATEGORY_MINUTES: Record<string, string> = {
  beard_wash: '30 sec',
  beard_oil:  '20 sec',
  beard_balm: '40 sec',
};

const STEP_CADENCE: Record<string, 'Daily' | 'Weekly'> = {
  // beard_wash defaults to daily even though spec says 2-3x for shorter goal;
  // section grouping is by step_id, not literal frequency.
  beard_wash: 'Daily',
  beard_oil:  'Daily',
  beard_balm: 'Daily',
};

function stepMinutes(step: RoutineStepType): string {
  if (step.category && BEARD_CATEGORY_MINUTES[step.category]) return BEARD_CATEGORY_MINUTES[step.category];
  if (step.step_id && BEARD_CATEGORY_MINUTES[step.step_id]) return BEARD_CATEGORY_MINUTES[step.step_id];
  return '30 sec';
}

function stepTitle(step: RoutineStepType): string {
  return step.product?.trim() || step.label || 'Beard step';
}

function resolveProduct(step: RoutineStepType): Product | null {
  const cat = step.category ?? step.step_id;
  if (!cat) return null;
  const pool = PRODUCTS.filter(p => p.category === cat);
  return pool[0] ?? null;
}

interface RenderedStep {
  key:          string;
  step_id:      string | null;
  num:          string;
  when:         'Daily' | 'Weekly';
  minutes:      string;
  title:        string;
  clinical:     string | null;
  cardProduct:  { brand: string; name: string; price: number | null } | null;
  sheetProduct: ProductDetailSheetProduct | null;
}

function renderStep(step: RoutineStepType, idx: number): RenderedStep {
  const product = resolveProduct(step);
  const num = idx < 9 ? `0${idx + 1}` : String(idx + 1);
  const when = STEP_CADENCE[step.step_id ?? ''] ?? 'Daily';
  return {
    key:     `${step.step_id ?? 'step'}-${idx}`,
    step_id: step.step_id ?? null,
    num,
    when,
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

function deriveTitle(scan: ScanRow | null): { italic: string; rest: string } {
  const insights = scan?.recommendations?.observation?.insights;
  const hit = insights?.find(i => /(beard|jaw|cheek|chin)/i.test(`${i.headline} ${i.body}`));
  if (hit?.headline) {
    return { italic: trimPunct(hit.headline) + '.', rest: 'a place to start.' };
  }
  if (scan?.beard_density === 'heavy') {
    return { italic: 'Plenty to shape,', rest: 'a clear plan.' };
  }
  if (scan?.beard_density === 'light' || scan?.beard_density === 'medium') {
    return { italic: 'Good bones.', rest: 'Cheeks need time.' };
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

export default function BeardDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scanId?: string }>();
  const paramScanId = typeof params.scanId === 'string' ? params.scanId : null;

  const [tab, setTab]         = useState<Tab>('Shape');
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

        const userPromise = supabase
          .from('users')
          .select('beard_goal')
          .eq('id', authUserId)
          .single();

        const scanPromise = paramScanId
          ? supabase
              .from('scans')
              .select('id, recommendations, face_shape, beard_density, beard_condition')
              .eq('id', paramScanId)
              .single()
          : supabase
              .from('scans')
              .select('id, recommendations, face_shape, beard_density, beard_condition')
              .eq('user_id', authUserId)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

        const [{ data: userData, error: uErr }, { data: scanData, error: sErr }] =
          await Promise.all([userPromise, scanPromise]);
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

  const beardRecs: BeardRecommendation | null = scan?.recommendations?.beard ?? null;

  const titleParts = useMemo(() => deriveTitle(scan), [scan]);

  const traitChips = useMemo<string[]>(() => {
    if (!scan) return [];
    const chips: string[] = [];
    if (scan.beard_density && scan.beard_density !== 'none') {
      chips.push(`${scan.beard_density}-density beard`);
    }
    if (scan.beard_condition) {
      chips.push(scan.beard_condition.replace(/_/g, ' '));
    }
    return chips;
  }, [scan]);

  const style = useMemo(() => {
    return getBeardStyle(
      scan?.face_shape as FaceShape | null | undefined,
      user?.beard_goal ?? null,
    );
  }, [scan, user]);

  const renderedSteps = useMemo<RenderedStep[]>(() => {
    const list = beardRecs?.steps ?? [];
    return [...list]
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      .map((s, i) => renderStep(s, i));
  }, [beardRecs]);

  // The "Clean up the edges" weekly trim isn't a Gemini step — it's an
  // editorial constant that always appears on the routine. Number it after
  // the dynamic steps so the list reads in order.
  const weeklyExtraNum = renderedSteps.length < 9
    ? `0${renderedSteps.length + 1}`
    : String(renderedSteps.length + 1);

  const dailySteps = renderedSteps.filter(r => r.when === 'Daily');

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
        ) : errorMsg || !scan || !beardRecs ? (
          <FallbackState
            message={errorMsg ?? 'Beard recommendations are still being drafted.'}
            onBack={() => router.back()}
          />
        ) : (
          <>
            <ScrollView contentContainerStyle={{ paddingTop: 20, paddingBottom: 48 }}>
              <DetailHeader
                chapter="Part three · beard"
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
                tabs={['Shape', 'Routine']}
              />

              {tab === 'Shape' && (
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
                      {traitChips.map(c => <TraitChip key={c}>{titleCase(c)}</TraitChip>)}
                    </View>
                  )}
                  <Body serif size={14.5} style={{ lineHeight: 24 }}>
                    {beardRecs.advice}
                  </Body>

                  {/* Suggested style — editorial card with a callout border */}
                  <View
                    style={{
                      marginTop:         28,
                      padding:           22,
                      borderWidth:       1,
                      borderColor:       Palette.rule,
                      backgroundColor:   Palette.bgElev,
                    }}
                  >
                    <ChapterLabel style={{ marginBottom: 10 }}>A shape that suits you</ChapterLabel>

                    {beardRecs.beard_shape_intro && (
                      <Body
                        serif
                        size={13.5}
                        style={{
                          marginBottom: 14,
                          fontStyle:    'italic',
                          color:        Palette.ink2,
                          lineHeight:   20,
                        }}
                      >
                        {beardRecs.beard_shape_intro}
                      </Body>
                    )}

                    <Display size="default" italic style={{ fontSize: 24, lineHeight: 28 }}>
                      {style.style_name}
                    </Display>

                    <Body
                      serif
                      size={13.5}
                      style={{
                        marginTop:  10,
                        fontStyle:  'italic',
                        color:      Palette.ink2,
                        lineHeight: 20,
                      }}
                    >
                      {style.description}
                    </Body>

                    <TouchableOpacity
                      activeOpacity={0.6}
                      onPress={() => {
                        const q = encodeURIComponent(style.search_query);
                        Linking.openURL(`https://www.google.com/search?q=${q}&tbm=isch`);
                      }}
                      style={{ marginTop: 14, alignSelf: 'flex-start' }}
                    >
                      <Text
                        style={{
                          fontFamily:  'CormorantGaramond_400Regular_Italic',
                          fontStyle:   'italic',
                          fontSize:    13,
                          color:       Palette.accent,
                        }}
                      >
                        See reference photos →
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ marginTop: 28 }}>
                    <ChapterLabel style={{ marginBottom: 14 }}>What to ask your barber</ChapterLabel>
                    <NarratorQuote>&ldquo;{style.barber_note}&rdquo;</NarratorQuote>
                  </View>
                </View>
              )}

              {tab === 'Routine' && (
                <View style={{ paddingHorizontal: 32, paddingTop: 24, paddingBottom: 40 }}>
                  {dailySteps.length > 0 && (
                    <View style={{ marginTop: 6 }}>
                      <ChapterLabel style={{ marginBottom: 14 }}>Daily</ChapterLabel>
                      {dailySteps.map((rs, i, arr) => (
                        <RoutineStep
                          key={rs.key}
                          num={rs.num}
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

                  <View style={{ marginTop: 34 }}>
                    <ChapterLabel style={{ marginBottom: 14 }}>Weekly</ChapterLabel>
                    <RoutineStep
                      num={weeklyExtraNum}
                      when="Weekend"
                      minutes="5 min"
                      title="Clean up the edges"
                      product={null}
                      onTap={() => {}}
                      last
                    />
                  </View>
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

function FallbackState({ message, onBack }: { message: string; onBack: () => void }) {
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
        <PrimaryButton label="Back" onPress={onBack} />
      </View>
    </View>
  );
}
