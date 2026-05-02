// RecommendationsScreen — the post-observation hub. One area card per care
// category, each tappable through to the per-category detail screen. Layout
// translated verbatim from design/source/screens-auth-onboarding.jsx:260-355.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  BackButton,
  Body,
  ChapterLabel,
  Display,
  PrimaryButton,
  Rule,
} from '../components/editorial';
import { Palette } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { errorToMessage } from '../lib/errors';
import { hasValidHairProfile } from '../lib/hair';
import { getSkinConcernsDetailed } from '../lib/scanData';
import { fetchLatestScanId, formatLongDate } from '../lib/profileData';
import { useScan } from '../hooks/useScan';
import type { SectionKey, SectionState } from '../services/scanService';
import type {
  HairProfile,
  HairRecommendations,
  MakeupRecommendation,
  Recommendations,
  SkinConcernObservation,
  User,
} from '../types';

type CareCategory = 'skin' | 'hair' | 'beard' | 'makeup';

interface AreaCard {
  cat:   CareCategory;
  label: string;      // "Skin" | "Hair" | "Beard" | "Makeup"
  focus: string;      // 2-3 word description
  note:  string;      // italic meta line
  top:   string | null;
}

interface ScanRow {
  id:                      string;
  recommendations:         Recommendations | null;
  skin_concerns_detailed?: SkinConcernObservation[] | null;
  beard_density?:          string | null;
  skin_undertone?:         string | null;
  skin_tone?:              string | null;
  created_at?:             string;
}

type UserContext = Pick<User, 'care_categories' | 'hair_profile' | 'hair_recommendations'> & {
  makeup_recommendations?: MakeupRecommendation | null;
};

// ─── Derivation helpers ─────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = { significant: 3, moderate: 2, mild: 1 };

// Pull the "Issue X" prefix from the observation block written by the vision
// call (e.g. "Issue sixteen · cover" → "Issue sixteen"). Falls back to a
// neutral "Issue one" when the observation is missing — extremely rare since
// the observation block is required in the vision schema.
function deriveIssueLabel(scan: ScanRow | null): string {
  const obsLabel = scan?.recommendations?.observation?.issue_label;
  if (typeof obsLabel === 'string' && obsLabel.includes('·')) {
    return obsLabel.split('·')[0].trim();
  }
  return 'Issue one';
}

function topConcern(list: SkinConcernObservation[] | null | undefined): SkinConcernObservation | null {
  if (!list || list.length === 0) return null;
  return [...list].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  )[0];
}

function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function buildSkinArea(scan: ScanRow | null): AreaCard {
  const concerns = getSkinConcernsDetailed(scan);
  const top = topConcern(concerns);
  const topLabel = top?.display_label ?? (titleCase(top?.concern ?? '') || null);

  // Focus: 2-3 concept words derived from top concerns. Falls back to a
  // gentle default so the card never reads empty on a zero-concern scan.
  const concepts: string[] = [];
  const seen = new Set<string>();
  for (const c of concerns.slice(0, 3)) {
    const word = (c.display_label ?? titleCase(c.concern)).split(/[·,]/)[0].trim();
    if (word && !seen.has(word.toLowerCase())) {
      concepts.push(word.toLowerCase());
      seen.add(word.toLowerCase());
    }
  }
  const focus = concepts.length > 0
    ? concepts.slice(0, 3).join(' · ')
    : 'Balance · barrier · tone';

  // Step count for the note line.
  const steps = scan?.recommendations?.skin?.steps ?? [];
  const legacyMorning = scan?.recommendations?.skin?.routine?.morning ?? [];
  const legacyEvening = scan?.recommendations?.skin?.routine?.evening ?? [];
  const stepCount = steps.length > 0
    ? steps.length
    : legacyMorning.length + legacyEvening.length;
  const note = stepCount > 0
    ? `${stepCount === 1 ? 'One step' : `${numToWord(stepCount)} steps`}, morning and night.`
    : 'A short ritual, morning and night.';

  return {
    cat:   'skin',
    label: 'Skin',
    focus,
    note,
    top:   topLabel,
  };
}

function buildHairArea(user: UserContext): AreaCard {
  const profile: HairProfile | null = user.hair_profile ?? null;
  const hairRecs: HairRecommendations | null = user.hair_recommendations ?? null;

  if (!hasValidHairProfile(profile)) {
    return {
      cat:   'hair',
      label: 'Hair',
      focus: 'Profile setup needed',
      note:  'Set up your hair profile to see recommendations.',
      top:   null,
    };
  }

  const bits: string[] = [];
  if (profile?.scalp_type)     bits.push(`${profile.scalp_type} scalp`);
  if (profile?.texture)        bits.push(profile.texture);
  if (profile?.primary_concern && profile.primary_concern.length > 0) {
    bits.push(profile.primary_concern[0].split('_').join(' '));
  }
  const focus = bits.length > 0 ? bits.slice(0, 3).join(' · ') : 'Scalp care · volume';

  const stepCount = hairRecs?.routine?.length ?? 0;
  const note = stepCount > 0
    ? `${numToWord(stepCount)} steps · ${profile?.wash_frequency ? washFreqLabel(profile.wash_frequency) : 'weekly rhythm'}.`
    : 'A balanced wash rhythm.';

  const top = profile?.primary_concern?.[0]
    ? titleCase(profile.primary_concern[0])
    : profile?.scalp_type
      ? `${titleCase(profile.scalp_type)} scalp`
      : null;

  return { cat: 'hair', label: 'Hair', focus, note, top };
}

function buildBeardArea(scan: ScanRow | null): AreaCard {
  const density = scan?.beard_density ?? null;
  const steps = (scan?.recommendations?.beard as { steps?: unknown[] } | null | undefined)?.steps ?? [];
  const stepCount = Array.isArray(steps) ? steps.length : 0;

  const focus = density === 'heavy' ? 'Edges · conditioning'
    : density === 'medium'         ? 'Edges · fullness'
    : density === 'light'          ? 'Fullness · patience'
    : 'Maintenance · upkeep';

  const note = stepCount > 0
    ? `${numToWord(stepCount)} steps · weekend trim.`
    : 'Light maintenance · weekend trim.';

  const top = density && density !== 'none'
    ? `${titleCase(density)}-density beard`
    : null;

  return { cat: 'beard', label: 'Beard', focus, note, top };
}

function buildMakeupArea(scan: ScanRow | null, user: UserContext | null): AreaCard {
  // Prefer the canonical user-level recs (Phase 4B.2). Fall back to the
  // legacy per-scan recs for scans created before makeup moved to user level.
  const makeup: MakeupRecommendation | null =
    user?.makeup_recommendations ?? scan?.recommendations?.makeup ?? null;
  const palette = makeup?.palette ?? null;
  const undertone = scan?.skin_undertone ?? palette?.undertone ?? null;
  const depth = palette?.depth_tier ?? null;

  const focus = palette ? 'Palette · technique'
    : undertone       ? `${undertone} undertone`
    : 'Palette · technique';

  const techniques = makeup?.techniques ?? [];
  const note = techniques.length > 0
    ? `${numToWord(techniques.length)} techniques · daily.`
    : 'A short, intentional palette.';

  const top = palette?.hero_line
    ? palette.hero_line.replace(/\.$/, '')
    : undertone
      ? `${titleCase(undertone)}${depth ? ` · ${depth.replace('_', ' ')}` : ''} tone`
      : null;

  return { cat: 'makeup', label: 'Makeup', focus, note, top };
}

function numToWord(n: number): string {
  const words = ['zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  return n >= 0 && n <= 10 ? words[n] : String(n);
}

function washFreqLabel(freq: string): string {
  switch (freq) {
    case 'daily':            return 'daily wash';
    case 'every_2_3_days':   return 'every 2–3 days';
    case 'once_a_week':      return 'once a week';
    case 'less_than_weekly': return 'occasional wash';
    default:                 return 'weekly rhythm';
  }
}

// ─── Screen ─────────────────────────────────────────────────────────────────────

export default function RecommendationsRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scanId?: string }>();
  const paramScanId = typeof params.scanId === 'string' ? params.scanId : null;
  const { sectionStates, regenerateSection } = useScan();

  const [scan, setScan]             = useState<ScanRow | null>(null);
  const [user, setUser]             = useState<UserContext | null>(null);
  const [latestScanId, setLatestScanId] = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const authUserId = authData.user?.id;
        if (!authUserId) {
          if (!cancelled) { setErrorMsg('Not signed in.'); setLoading(false); }
          return;
        }

        const userPromise = supabase
          .from('users')
          .select('care_categories, hair_profile, hair_recommendations, makeup_recommendations')
          .eq('id', authUserId)
          .single();

        const scanPromise = paramScanId
          ? supabase
              .from('scans')
              .select('id, recommendations, skin_concerns_detailed, beard_density, skin_undertone, skin_tone, created_at')
              .eq('id', paramScanId)
              .single()
          : supabase
              .from('scans')
              .select('id, recommendations, skin_concerns_detailed, beard_density, skin_undertone, skin_tone, created_at')
              .eq('user_id', authUserId)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

        const [
          { data: userData, error: userErr },
          { data: scanData, error: scanErr },
          latestId,
        ] = await Promise.all([userPromise, scanPromise, fetchLatestScanId(authUserId)]);

        if (cancelled) return;
        if (userErr) {
          console.error('[recommendations] user query failed:', userErr);
          throw new Error(userErr.message ?? 'Database error');
        }
        if (scanErr) {
          console.error('[recommendations] scan query failed:', scanErr);
          throw new Error(scanErr.message ?? 'Database error');
        }

        setUser(userData as UserContext);
        setScan(scanData as ScanRow);
        setLatestScanId(latestId);
      } catch (err) {
        if (!cancelled) setErrorMsg(errorToMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [paramScanId]);

  // When a section completes (or retries succeed), refetch the scan row so
  // newly-merged recommendations land in this view without a manual refresh.
  useEffect(() => {
    if (!scan?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('scans')
        .select('id, recommendations, skin_concerns_detailed, beard_density, skin_undertone, skin_tone, created_at')
        .eq('id', scan.id)
        .single();
      if (!cancelled && data) setScan(data as ScanRow);
    })();
    return () => { cancelled = true; };
  }, [sectionStates.skin, sectionStates.beard, sectionStates.makeup, scan?.id]);

  const areas = useMemo<AreaCard[]>(() => {
    if (!user) return [];
    const categories = user.care_categories ?? ['skin'];
    const list: AreaCard[] = [];
    if (categories.includes('skin'))   list.push(buildSkinArea(scan));
    if (categories.includes('hair'))   list.push(buildHairArea(user));
    // Makeup before beard when both present — editorial flow for unusual case
    // where a user somehow selected both (women normally get makeup, men beard).
    if (categories.includes('makeup')) list.push(buildMakeupArea(scan, user));
    if (categories.includes('beard'))  list.push(buildBeardArea(scan));
    return list;
  }, [user, scan]);

  const handleAreaTap = (cat: CareCategory) => {
    const query = scan?.id ? `?scanId=${encodeURIComponent(scan.id)}` : '';
    router.push(`/${cat}-detail${query}` as never);
  };

  // Historical mode: viewing a specific past scan (not the most-recent one).
  // Triggers a "READING FROM …" subhead and disables retry on failed sections —
  // we don't want users regenerating recs on an old scan from history.
  const isHistorical = !!paramScanId && !!scan?.id && !!latestScanId && scan.id !== latestScanId;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Palette.accent} />
          </View>
        ) : errorMsg || !scan || !user ? (
          <FallbackState message={errorMsg ?? 'Your plan is still being drafted.'} onBack={() => router.replace('/(tabs)/routine')} />
        ) : (
          <ScrollView contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}>
            <View style={{ paddingVertical: 8, paddingHorizontal: 28 }}>
              {/* TODO Phase 7: replace with router.back() once nav stack reliably has history. */}
              <BackButton onPress={() => router.replace('/(tabs)/routine')} style={{ marginLeft: -8 }} />
            </View>

            <View style={{ paddingTop: 24, paddingHorizontal: 32 }}>
              <ChapterLabel>{deriveIssueLabel(scan)} · your plan</ChapterLabel>
              {isHistorical && scan?.created_at && (
                <ChapterLabel style={{ marginTop: 4 }}>
                  {`Reading from ${formatLongDate(scan.created_at)}`}
                </ChapterLabel>
              )}
              <Display
                style={{
                  marginTop:     14,
                  fontSize:      38,
                  lineHeight:    41,
                  letterSpacing: -0.3,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'CormorantGaramond_500Medium_Italic',
                    fontStyle:  'italic',
                  }}
                >
                  A quiet
                </Text>
                {'\n'}assessment.
              </Display>
              <Rule length="short" tone="accent" style={{ marginTop: 22, marginBottom: 18 }} />
              <Body serif size={14.5} style={{ maxWidth: 300, lineHeight: 24 }}>
                We&apos;ve drafted a short ritual for you — one part skin, one part hair, one part
                beard. Nothing unnecessary. Read each part, then start tomorrow morning.
              </Body>
            </View>

            <View style={{ paddingTop: 32, paddingHorizontal: 32 }}>
              <ChapterLabel style={{ marginBottom: 4 }}>In this plan</ChapterLabel>
            </View>

            <View style={{ paddingTop: 4, paddingHorizontal: 32 }}>
              {areas.map((a, i) => {
                const sectionState: SectionState | null =
                  a.cat === 'skin' || a.cat === 'beard' || a.cat === 'makeup'
                    ? sectionStates[a.cat as SectionKey]
                    : null;
                return (
                  <AreaRow
                    key={a.cat}
                    num={padNum(i + 1)}
                    area={a}
                    first={i === 0}
                    last={i === areas.length - 1}
                    sectionState={sectionState}
                    onTap={() => handleAreaTap(a.cat)}
                    onRetry={
                      sectionState === 'failed' && !isHistorical
                        ? () => { void regenerateSection(a.cat as SectionKey); }
                        : undefined
                    }
                  />
                );
              })}
            </View>

            <View style={{ paddingTop: 32, paddingHorizontal: 32, paddingBottom: 40 }}>
              <View
                style={{
                  backgroundColor: Palette.bgElev,
                  paddingVertical:   20,
                  paddingHorizontal: 22,
                  borderLeftWidth:   2,
                  borderLeftColor:   Palette.accent,
                }}
              >
                <ChapterLabel>Four weeks from now</ChapterLabel>
                <Text
                  style={{
                    marginTop:  8,
                    fontFamily: 'CormorantGaramond_500Medium',
                    fontSize:   18,
                    lineHeight: 23,
                    color:      Palette.ink,
                  }}
                >
                  We&apos;ll take another look and{' '}
                  <Text
                    style={{
                      fontFamily: 'CormorantGaramond_500Medium_Italic',
                      fontStyle:  'italic',
                    }}
                  >
                    show you
                  </Text>
                  {' '}what moved.
                </Text>
              </View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

function padNum(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

interface AreaRowProps {
  num:           string;
  area:          AreaCard;
  first:         boolean;
  last:          boolean;
  sectionState:  SectionState | null;
  onTap:         () => void;
  onRetry?:      () => void;
}

function AreaRow({ num, area, first, last, sectionState, onTap, onRetry }: AreaRowProps) {
  const isLoading = sectionState === 'loading';
  const isFailed  = sectionState === 'failed';
  const trailing  = isLoading
    ? null
    : isFailed
      ? 'retry →'
      : 'read →';

  const handlePress = () => {
    if (isLoading) return;
    if (isFailed) {
      // Failed without a retry handler (historical mode) — tap is a no-op
      // so the user can't regenerate recs on an old scan from history.
      if (onRetry) onRetry();
      return;
    }
    onTap();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={isLoading ? 1 : 0.85}
      disabled={isLoading}
      style={{
        paddingVertical:   22,
        borderTopWidth:    first ? 1 : 1,
        borderTopColor:    Palette.rule,
        borderBottomWidth: last ? 1 : 0,
        borderBottomColor: Palette.rule,
        flexDirection:     'row',
        alignItems:        'flex-start',
        gap:               18,
        opacity:           isLoading ? 0.55 : 1,
      }}
    >
      <Text
        style={{
          fontFamily:    'Inter_500Medium',
          fontSize:      11,
          letterSpacing: 1.5,
          color:         Palette.accent,
          paddingTop:    8,
        }}
      >
        {num}
      </Text>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium',
            fontSize:   26,
            lineHeight: 29,
            color:      Palette.ink,
          }}
        >
          {area.label}
        </Text>
        <Text
          style={{
            marginTop:     6,
            fontFamily:    'Inter_400Regular',
            fontSize:      12,
            letterSpacing: 0.1,
            color:         Palette.ink3,
          }}
        >
          {isLoading ? 'Drafting your plan…' : isFailed ? 'Tap to try again.' : area.focus}
        </Text>
        {!isLoading && !isFailed && (
          <>
            <Text
              style={{
                marginTop:  10,
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle:  'italic',
                fontSize:   13.5,
                lineHeight: 20,
                color:      Palette.ink2,
              }}
            >
              {area.note}
            </Text>
            {area.top && (
              <View
                style={{
                  marginTop:     12,
                  flexDirection: 'row',
                  alignItems:    'center',
                  gap:           6,
                }}
              >
                <View
                  style={{
                    width:           4,
                    height:          4,
                    borderRadius:    99,
                    backgroundColor: Palette.accent,
                  }}
                />
                <Text
                  style={{
                    fontFamily: 'Inter_400Regular',
                    fontSize:   11,
                    color:      Palette.ink3,
                  }}
                >
                  Priority ·{' '}
                  <Text style={{ color: Palette.ink2 }}>{area.top}</Text>
                </Text>
              </View>
            )}
          </>
        )}
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={Palette.accent} style={{ paddingTop: 12 }} />
      ) : (
        <Text
          style={{
            paddingTop: 10,
            fontFamily: 'CormorantGaramond_400Regular_Italic',
            fontStyle:  'italic',
            fontSize:   14,
            color:      isFailed ? Palette.accent : Palette.ink2,
          }}
        >
          {trailing}
        </Text>
      )}
    </TouchableOpacity>
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
        <Text
          style={{
            fontFamily:    'CormorantGaramond_500Medium',
            fontSize:      38,
            lineHeight:    41,
            letterSpacing: -0.3,
            color:         Palette.ink,
          }}
        >
          <Text
            style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}
          >
            Not quite
          </Text>
          {'\n'}ready yet.
        </Text>
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
