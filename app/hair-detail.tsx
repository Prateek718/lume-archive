// HairDetailScreen — Analysis + Routine tabs for the hair care plan.
// Translated from design/source/screens-detail.jsx:227-289. Has two states:
//   A) no hair_profile yet — empty state with CTA to /(hair-setup)/length
//   B) profile + recs present — Analysis (chips, advice, concerns) + Routine.

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
import { hasValidHairProfile } from '../lib/hair';
import type {
  HairProfile,
  HairRecommendations,
  HairRoutineStep,
  Recommendations,
  User,
} from '../types';

type Tab = 'Analysis' | 'Routine';

interface ScanRow {
  id:               string;
  recommendations:  Recommendations | null;
}

type UserContext = Pick<User, 'care_categories' | 'hair_profile' | 'hair_recommendations'>;

// ─── Helpers ────────────────────────────────────────────────────────────────────

const HAIR_CADENCE_LABEL: Record<string, string> = {
  every_wash: 'Wash day',
  weekly:     'Weekly',
  monthly:    'Monthly',
};

const HAIR_CATEGORY_MINUTES: Record<string, string> = {
  hair_shampoo:           '3 min',
  hair_conditioner:       '2 min',
  hair_oil:               '10 min',
  hair_serum:             '1 min',
  hair_mask:              '8 min',
  scalp_serum:            '1 min',
  leave_in_conditioner:   '1 min',
};

// Bucket label for the "Twice a week" / "Weekly" chapter heading. Driven
// primarily by the user's wash frequency, since cadence is "every_wash".
function washHeading(freq: HairProfile['wash_frequency'] | undefined): string {
  switch (freq) {
    case 'daily':            return 'Daily';
    case 'every_2_3_days':   return 'Every wash';
    case 'once_a_week':      return 'Weekly';
    case 'less_than_weekly': return 'When you wash';
    default:                 return 'Every wash';
  }
}

function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function stepMinutes(step: HairRoutineStep): string {
  if (step.category && HAIR_CATEGORY_MINUTES[step.category]) return HAIR_CATEGORY_MINUTES[step.category];
  return '2 min';
}

function stepTitle(step: HairRoutineStep): string {
  return step.product?.trim() || step.label || 'Hair step';
}

// Simple match: pick first catalogue product in the same category. Hair
// scoring isn't run again here; the prescriptions in users.hair_recommendations
// already drove which categories Gemini wrote about.
function resolveProduct(step: HairRoutineStep): Product | null {
  if (!step.category) return null;
  const pool = PRODUCTS.filter(p => p.category === step.category);
  return pool[0] ?? null;
}

interface RenderedStep {
  key:          string;
  num:          string;
  when:         string;
  minutes:      string;
  title:        string;
  clinical:     string | null;
  cardProduct:  { brand: string; name: string; price: number | null } | null;
  sheetProduct: ProductDetailSheetProduct | null;
}

function renderStep(step: HairRoutineStep, idx: number): RenderedStep {
  const product = resolveProduct(step);
  const num = idx < 9 ? `0${idx + 1}` : String(idx + 1);
  const when = HAIR_CADENCE_LABEL[step.cadence ?? 'every_wash'] ?? 'Wash day';
  return {
    key:     `${step.step_id ?? 'step'}-${idx}`,
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

// Pull "Where to focus" rows from primary_concern. Severity is always 'moderate'
// here since the hair profile doesn't carry severity — it's an editorial cue,
// not a measured one.
interface HairConcernRow {
  concern: string;
  label:   string;
  note:    string;
}

const HAIR_CONCERN_COPY: Record<string, { label: string; note: string }> = {
  hair_fall:      { label: 'Hair fall',      note: 'Targeted with a scalp serum that supports the follicle without overpromising.' },
  dandruff:       { label: 'Dandruff',       note: 'Active anti-dandruff cleanser swapped in for routine wash days.' },
  frizz:          { label: 'Frizz',          note: 'Lightweight serum on damp lengths to seal the cuticle in humid weather.' },
  damage:         { label: 'Damage',         note: 'Weekly mask with bond-repair actives to rebuild structure.' },
  dullness_hair:  { label: 'Dullness',       note: 'A gentler shampoo plus weekly oiling to bring back natural shine.' },
  oily_scalp:     { label: 'Oily scalp',     note: 'Clarifying wash twice weekly to balance sebum without stripping.' },
  dry_scalp:      { label: 'Dry scalp',      note: 'Pre-wash scalp oil and a moisturising cleanser to soften.' },
  itchy_scalp:    { label: 'Itchy scalp',    note: 'Soothing wash with calming actives — avoid hot water on the scalp.' },
};

function buildHairConcernRows(profile: HairProfile | null): HairConcernRow[] {
  if (!profile?.primary_concern || profile.primary_concern.length === 0) return [];
  return profile.primary_concern.slice(0, 4).map(c => {
    const copy = HAIR_CONCERN_COPY[c];
    return {
      concern: c,
      label:   copy?.label ?? titleCase(c),
      note:    copy?.note  ?? 'A targeted step in the routine addresses this directly.',
    };
  });
}

// Derive the editorial title shown in DetailHeader. Mirrors skin-detail's
// pattern but uses the scan observation insights' hair-relevant lines, then
// falls back to a quiet default tied to the profile.
function deriveTitle(scan: ScanRow | null, profile: HairProfile | null): {
  italic: string; rest: string;
} {
  const insights = scan?.recommendations?.observation?.insights;
  // Crude but predictable: pick the insight whose body mentions scalp / hair / oil.
  const hit = insights?.find(i =>
    /(scalp|hair|oil|root|texture|wash)/i.test(`${i.headline} ${i.body}`),
  );
  if (hit?.headline) {
    return { italic: trimPunct(hit.headline) + ',', rest: 'a place to start.' };
  }
  if (profile?.scalp_type === 'oily') {
    return { italic: 'Healthy roots,', rest: 'oily mid-week.' };
  }
  if (profile?.scalp_type === 'dry') {
    return { italic: 'A thirsty scalp,', rest: 'an easy fix.' };
  }
  return { italic: 'A reading,', rest: 'one wash at a time.' };
}

function trimPunct(s: string): string {
  return s.replace(/[.!?,;:]+$/, '').trim();
}

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function HairDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scanId?: string; error?: string }>();
  const paramScanId = typeof params.scanId === 'string' ? params.scanId : null;
  const paramError  = typeof params.error  === 'string' ? params.error  : null;

  const [tab, setTab]         = useState<Tab>('Analysis');
  const [scan, setScan]       = useState<ScanRow | null>(null);
  const [user, setUser]       = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErr]    = useState<string | null>(paramError);

  const [sheetOpen, setSheetOpen]         = useState(false);
  const [sheetProduct, setSheetProduct]   = useState<ProductDetailSheetProduct | null>(null);
  const [sheetReasoning, setSheetReason]  = useState<string | null>(null);

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
          .select('care_categories, hair_profile, hair_recommendations')
          .eq('id', authUserId)
          .single();

        const scanPromise = paramScanId
          ? supabase
              .from('scans')
              .select('id, recommendations')
              .eq('id', paramScanId)
              .single()
          : supabase
              .from('scans')
              .select('id, recommendations')
              .eq('user_id', authUserId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

        const [{ data: userData, error: uErr }, { data: scanData, error: sErr }] =
          await Promise.all([userPromise, scanPromise]);
        if (cancelled) return;
        if (uErr) throw uErr;
        if (sErr) throw sErr;

        setUser(userData as UserContext);
        setScan((scanData as ScanRow | null) ?? null);
      } catch (err) {
        if (!cancelled) setErr(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [paramScanId]);

  const profile  = user?.hair_profile ?? null;
  const hairRecs: HairRecommendations | null = user?.hair_recommendations ?? null;

  const profileSet = hasValidHairProfile(profile);

  const titleParts = useMemo(() => deriveTitle(scan, profile), [scan, profile]);

  const traitChips = useMemo<string[]>(() => {
    if (!profile) return [];
    const chips: string[] = [];
    const left = [profile.texture, profile.hair_length].filter(Boolean).join(' · ');
    if (left) chips.push(left);
    if (profile.scalp_type) chips.push(`${profile.scalp_type} scalp`);
    if (profile.chemically_treated && profile.chemically_treated !== 'none') {
      chips.push(`${profile.chemically_treated.replace(/_/g, ' ')} treatment`);
    }
    return chips;
  }, [profile]);

  const concernRows = useMemo(() => buildHairConcernRows(profile), [profile]);

  const renderedSteps = useMemo<RenderedStep[]>(() => {
    const list = hairRecs?.routine ?? [];
    return [...list]
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      .map((s, i) => renderStep(s, i));
  }, [hairRecs]);

  const everyWash = renderedSteps.filter(r => r.when === 'Wash day');
  const weekly    = renderedSteps.filter(r => r.when === 'Weekly');
  const monthly   = renderedSteps.filter(r => r.when === 'Monthly');

  const openSheet = (sp: ProductDetailSheetProduct | null, reasoning: string | null) => {
    if (!sp) return;
    setSheetProduct(sp);
    setSheetReason(reasoning);
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
        ) : errorMsg && !profileSet ? (
          <FallbackState message={errorMsg} onBack={() => router.back()} />
        ) : !profileSet ? (
          <EmptyState onBack={() => router.back()} onStart={() => router.push('/(hair-setup)/length')} />
        ) : !hairRecs ? (
          <FallbackState
            message="Hair recommendations are still being generated. Try again in a moment."
            onBack={() => router.back()}
          />
        ) : (
          <>
            <ScrollView contentContainerStyle={{ paddingTop: 20, paddingBottom: 48 }}>
              <DetailHeader
                chapter="Part two · hair"
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
                    {hairRecs.advice}
                  </Body>
                  {concernRows.length > 0 && (
                    <View style={{ marginTop: 32 }}>
                      <ChapterLabel style={{ marginBottom: 14 }}>Where to focus</ChapterLabel>
                      {concernRows.map((c, i, arr) => (
                        <ConcernRow
                          key={c.concern}
                          num={i < 9 ? `0${i + 1}` : String(i + 1)}
                          label={c.label}
                          severity={2}
                          note={c.note}
                          last={i === arr.length - 1}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}

              {tab === 'Routine' && (
                <View style={{ paddingHorizontal: 32, paddingTop: 24, paddingBottom: 40 }}>
                  {hairRecs.condition_explanation && (
                    <NarratorQuote>&ldquo;{hairRecs.condition_explanation}&rdquo;</NarratorQuote>
                  )}

                  {everyWash.length > 0 && (
                    <View style={{ marginTop: 26 }}>
                      <ChapterLabel style={{ marginBottom: 14 }}>{washHeading(profile?.wash_frequency)}</ChapterLabel>
                      {everyWash.map((rs, i, arr) => (
                        <RoutineStep
                          key={rs.key}
                          num={rs.num}
                          when={rs.when}
                          minutes={rs.minutes}
                          title={rs.title}
                          product={rs.cardProduct}
                          onTap={() => openSheet(rs.sheetProduct, rs.clinical)}
                          last={i === arr.length - 1}
                        />
                      ))}
                    </View>
                  )}

                  {weekly.length > 0 && (
                    <View style={{ marginTop: 34 }}>
                      <ChapterLabel style={{ marginBottom: 14 }}>Weekly</ChapterLabel>
                      {weekly.map((rs, i, arr) => (
                        <RoutineStep
                          key={rs.key}
                          num={rs.num}
                          when={rs.when}
                          minutes={rs.minutes}
                          title={rs.title}
                          product={rs.cardProduct}
                          onTap={() => openSheet(rs.sheetProduct, rs.clinical)}
                          last={i === arr.length - 1}
                        />
                      ))}
                    </View>
                  )}

                  {monthly.length > 0 && (
                    <View style={{ marginTop: 34 }}>
                      <ChapterLabel style={{ marginBottom: 14 }}>Monthly</ChapterLabel>
                      {monthly.map((rs, i, arr) => (
                        <RoutineStep
                          key={rs.key}
                          num={rs.num}
                          when={rs.when}
                          minutes={rs.minutes}
                          title={rs.title}
                          product={rs.cardProduct}
                          onTap={() => openSheet(rs.sheetProduct, rs.clinical)}
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
            />
          </>
        )}
      </SafeAreaView>
    </>
  );
}

// ─── Empty + fallback states ───────────────────────────────────────────────────

function EmptyState({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingVertical: 8, paddingHorizontal: 28 }}>
        <BackButton onPress={onBack} style={{ marginLeft: -8 }} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 32, justifyContent: 'center' }}>
        <ChapterLabel>Part two · hair</ChapterLabel>
        <View style={{ height: 14 }} />
        <Display size="default">
          <Display size="default" italic>Hair</Display>{'\n'}awaits a profile.
        </Display>
        <View style={{ height: 22 }} />
        <Body serif size={14.5} style={{ lineHeight: 24, maxWidth: 320 }}>
          Hair needs more than a photograph. To recommend specifics — the right
          shampoo, the right cadence, styles that work with your texture and
          concern — we need a short profile. About 2 minutes.
        </Body>
        <View style={{ height: 30 }} />
        <PrimaryButton label="Set up hair profile" onPress={onStart} />
      </View>
    </View>
  );
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
        <PrimaryButton label="Back" onPress={() => router.back()} />
      </View>
    </View>
  );
}
