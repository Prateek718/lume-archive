// Dev-only pipeline verification screen. Hidden route — not linked from any
// production UI. Reach it via manual URL /gemini-test in the Expo dev menu,
// or temporarily add a TextLink from app/index.tsx during testing.
//
// REMOVE BEFORE LAUNCH.
//
// Exercises each of the three Gemini pipelines with hardcoded inputs and
// dumps raw JSON output for inspection. No product wiring, no Supabase
// persistence — just the Gemini call + parse.

import React, { useState } from 'react';
import { View, ScrollView, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import {
  ChapterLabel,
  Display,
  Body,
  Rule,
  PrimaryButton,
  TextLink,
} from '../components/editorial';
import { Palette, Space } from '../constants/theme';
import {
  analyseWithGemini,
  getSkinRecommendations,
  getHairRecommendationsFromGemini,
  type GeminiAnalysis,
} from '../lib/gemini';
import type { HairProfile } from '../types';

// ── Test inputs ──────────────────────────────────────────────────────────────
// Founder: edit these inline before testing. The vision base64 is a 1×1 JPEG
// placeholder — Gemini may reject it or return nonsense. To get a meaningful
// vision result, replace SAMPLE_IMAGE_BASE64 with a real face photo encoded
// as base64 (no data: prefix). Options:
//   (a) Run `base64 -i path/to/photo.jpg` and paste the string here.
//   (b) Or, build a one-off harness that reads from expo-image-picker and
//       passes that bytes to this screen. The placeholder is fine for
//       confirming the pipeline is wired end-to-end — auth, prompt, parse,
//       usage logging. It is not fine for judging prompt quality.

const SAMPLE_IMAGE_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/8QAFAEBAAAAAAAAAAAAAAAAAAAABf/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=';

const VISION_INPUT = {
  city:            'Mumbai',
  gender:          'man',
  careCategories:  ['skin', 'hair', 'beard'],
  ageRange:        '26-35',
};

const SKIN_RECS_ANALYSIS: GeminiAnalysis = {
  face_shape:        'oval',
  skin_type:         'combination',
  skin_concerns:     ['dehydration', 'hyperpigmentation'],
  skin_concerns_detailed: [
    { concern: 'dehydration',       severity: 'moderate', zones: ['cheeks'],          notes: 'fine surface lines visible when skin moves' },
    { concern: 'hyperpigmentation', severity: 'mild',     zones: ['cheeks'],          notes: 'two post-acne marks on right cheek' },
  ],
  beard_density:     null,
  beard_condition:   null,
  brow_condition:    'well_defined',
  undereye:          'normal',
  score_skin:        72,
  fitzpatrick_scale: 4,
  skin_tone:         'Olive',
  skin_undertone:    'warm',
  confidence:        { face_shape: 0.88, skin_undertone: 0.82 },
  alternatives:      { face_shape: null, skin_undertone: null },
};

const SKIN_RECS_INPUT = {
  gender:         'woman',
  analysis:       SKIN_RECS_ANALYSIS,
  matchedProducts: [],
  careCategories: ['skin', 'hair', 'makeup'],
  ageRange:       '26-35',
  beardGoal:      null,
};

const HAIR_PROFILE: HairProfile = {
  hair_length:        'medium',
  scalp_type:         'oily',
  primary_concern:    ['dandruff'],
  texture:            'wavy',
  wash_frequency:     'every_2_3_days',
  oils_regularly:     false,
  chemically_treated: 'none',
};

const HAIR_RECS_INPUT = {
  profile:         HAIR_PROFILE,
  faceShape:       'oval',
  gender:          'woman',
  city:            'Delhi',
  budget:          'mid',
  matchedProducts: [],
};

// ── Screen ──────────────────────────────────────────────────────────────────
type Status = 'idle' | 'loading' | 'done' | 'error';

export default function GeminiTest() {
  const router = useRouter();

  const [visionStatus, setVisionStatus] = useState<Status>('idle');
  const [visionOut,    setVisionOut]    = useState<string>('');

  const [skinStatus, setSkinStatus] = useState<Status>('idle');
  const [skinOut,    setSkinOut]    = useState<string>('');

  const [hairStatus, setHairStatus] = useState<Status>('idle');
  const [hairOut,    setHairOut]    = useState<string>('');

  const runVision = async () => {
    setVisionStatus('loading');
    setVisionOut('');
    try {
      const result = await analyseWithGemini(
        SAMPLE_IMAGE_BASE64,
        VISION_INPUT.city,
        VISION_INPUT.gender,
        VISION_INPUT.careCategories,
        VISION_INPUT.ageRange,
        null,
        null,
        1,
      );
      setVisionOut(JSON.stringify(result, null, 2));
      setVisionStatus('done');
    } catch (err: unknown) {
      setVisionOut('ERROR: ' + (err instanceof Error ? err.message : String(err)));
      setVisionStatus('error');
    }
  };

  const runSkinRecs = async () => {
    setSkinStatus('loading');
    setSkinOut('');
    try {
      const result = await getSkinRecommendations(
        SKIN_RECS_INPUT.analysis,
        SKIN_RECS_INPUT.matchedProducts,
        SKIN_RECS_INPUT.ageRange,
        { scanId: null },
      );
      setSkinOut(JSON.stringify(result, null, 2));
      setSkinStatus('done');
    } catch (err: unknown) {
      setSkinOut('ERROR: ' + (err instanceof Error ? err.message : String(err)));
      setSkinStatus('error');
    }
  };

  const runHairRecs = async () => {
    setHairStatus('loading');
    setHairOut('');
    try {
      const result = await getHairRecommendationsFromGemini(
        HAIR_RECS_INPUT.profile,
        HAIR_RECS_INPUT.faceShape,
        HAIR_RECS_INPUT.gender,
        HAIR_RECS_INPUT.city,
        HAIR_RECS_INPUT.budget,
        HAIR_RECS_INPUT.matchedProducts,
        { scanId: null },
      );
      setHairOut(JSON.stringify(result, null, 2));
      setHairStatus('done');
    } catch (err: unknown) {
      setHairOut('ERROR: ' + (err instanceof Error ? err.message : String(err)));
      setHairStatus('error');
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 40, paddingBottom: 80 }}>
          <TextLink label="← back" onPress={() => router.back()} />
          <View style={{ height: Space.lg }} />

          <ChapterLabel>Dev · gemini test</ChapterLabel>
          <View style={{ height: Space.md }} />
          <Display size="small">Pipeline verification.</Display>
          <View style={{ height: Space.lg }} />
          <Body serif>
            Hidden route. Exercises Gemini pipelines with hardcoded inputs and displays raw
            output for inspection. Remove before launch.
          </Body>
          <View style={{ height: Space.xl }} />
          <Rule length="full" />
          <View style={{ height: Space.xl }} />

          <Section
            label="Vision · analyseWithGemini"
            description="Runs the vision pipeline with the placeholder image. Swap SAMPLE_IMAGE_BASE64 for a real face photo before judging prompt quality."
            buttonLabel="Run vision test"
            onPress={runVision}
            status={visionStatus}
            output={visionOut}
          />

          <Section
            label="Skin recs · getSkinRecommendations"
            description="Combination skin + moderate dehydration + mild hyperpigmentation, Fitzpatrick 4, warm undertone, woman, skin+hair+makeup selected."
            buttonLabel="Run skin recs test"
            onPress={runSkinRecs}
            status={skinStatus}
            output={skinOut}
          />

          <Section
            label="Hair recs · getHairRecommendationsFromGemini"
            description="Oily scalp, medium wavy hair, dandruff concern, every-2-3-days wash, Delhi, woman."
            buttonLabel="Run hair recs test"
            onPress={runHairRecs}
            status={hairStatus}
            output={hairOut}
          />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

interface SectionProps {
  label:       string;
  description: string;
  buttonLabel: string;
  onPress:     () => void;
  status:      Status;
  output:      string;
}

function Section({ label, description, buttonLabel, onPress, status, output }: SectionProps) {
  return (
    <View style={{ marginBottom: Space.xxl }}>
      <ChapterLabel>{label}</ChapterLabel>
      <View style={{ height: Space.sm }} />
      <Body serif>{description}</Body>
      <View style={{ height: Space.lg }} />
      <PrimaryButton
        label={status === 'loading' ? 'Running…' : buttonLabel}
        onPress={onPress}
        disabled={status === 'loading'}
      />
      <View
        style={{
          borderWidth:   1,
          borderColor:   Palette.rule,
          padding:       Space.lg,
          marginTop:     Space.md,
          minHeight:     120,
          backgroundColor: Palette.bgElev,
        }}
      >
        {status === 'idle' && (
          <Body size={12}>Press the button to run this pipeline.</Body>
        )}
        {status === 'loading' && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ActivityIndicator size="small" color={Palette.ink} />
            <View style={{ width: Space.sm }} />
            <Body size={12}>Calling Gemini…</Body>
          </View>
        )}
        {(status === 'done' || status === 'error') && (
          <Text
            selectable
            style={{
              fontFamily: 'Courier',
              fontSize:   11,
              lineHeight: 16,
              color:      status === 'error' ? Palette.danger : Palette.ink2,
            }}
          >
            {output}
          </Text>
        )}
      </View>
    </View>
  );
}
