// Three-phase scan screen.
//   intro    — cream-bg consent / what-to-expect, gates camera permission.
//   align    — dark-bg live camera with oval guide and capture button.
//   analyzing — dark-bg waiting state while Gemini phase 1 runs.
//
// useScan owns the state machine. This screen pushes a photo into it via
// start(), then watches state for success / branching screens.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  BackButton,
  Body,
  ChapterLabel,
  Display,
  PrimaryButton,
} from '../components/editorial';
import { Palette } from '../constants/theme';
import { useScan } from '../hooks/useScan';

type LocalPhase = 'intro' | 'align' | 'analyzing';

export default function Scan() {
  const router = useRouter();
  const scan = useScan();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<LocalPhase>('intro');
  const cameraRef = useRef<CameraView | null>(null);
  const captureLockRef = useRef(false);

  // Route on state change.
  useEffect(() => {
    if (scan.state === 'needs_beard_goal') {
      router.replace('/(scan)/beard-goal' as never);
      return;
    }
    if (scan.state === 'needs_trait_confirm') {
      router.replace('/(scan)/trait-confirm' as never);
      return;
    }
    if (scan.state === 'success') {
      router.replace('/(scan)/complete' as never);
      return;
    }
    if (scan.state === 'phase1' || scan.state === 'phase2') {
      setPhase('analyzing');
    }
  }, [scan.state, router]);

  const onBegin = async () => {
    if (!permission) return;
    if (!permission.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        router.replace('/(scan)/permission-denied' as never);
        return;
      }
    }
    setPhase('align');
  };

  const onCapture = async () => {
    if (captureLockRef.current) return;
    if (!cameraRef.current) return;
    captureLockRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        captureLockRef.current = false;
        return;
      }
      setPhase('analyzing');
      // useScan re-fetches gender from the users row; pass 'man' as a safe default.
      await scan.start(photo.uri, 'man');
    } catch (err) {
      console.warn('[scan] capture failed:', err);
      captureLockRef.current = false;
      setPhase('align');
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {phase === 'intro' ? (
        <IntroPhase onBegin={onBegin} onBack={() => router.back()} />
      ) : phase === 'align' ? (
        <AlignPhase
          cameraRef={cameraRef}
          onCapture={onCapture}
          onBack={() => setPhase('intro')}
        />
      ) : (
        <AnalyzingPhase error={scan.state === 'error' ? scan.error : null} onRetry={() => {
          scan.reset();
          captureLockRef.current = false;
          setPhase('intro');
        }} />
      )}
    </>
  );
}

// ── Intro ────────────────────────────────────────────────────────────────

function IntroPhase({ onBegin, onBack }: { onBegin: () => void; onBack: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingTop: 8, paddingHorizontal: 28 }}>
        <BackButton onPress={onBack} style={{ marginLeft: -8 }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 22, paddingBottom: 30 }}>
        <ChapterLabel>Your reading</ChapterLabel>
        <View style={{ height: 14 }} />
        <Display>
          <Display italic>Let's begin</Display>
          {'\n'}your first scan.
        </Display>

        <View style={{ height: 24 }} />
        <Body serif size={14.5} style={{ lineHeight: 22 }}>
          Find good natural light. Hold the phone an arm's length away. We read tone, texture
          and a handful of small things — then build a care plan around them.
        </Body>

        <View style={{ height: 30 }} />
        <View
          style={{
            backgroundColor: Palette.bgElev,
            borderLeftWidth: 2,
            borderLeftColor: Palette.accent,
            paddingVertical: 18,
            paddingHorizontal: 20,
          }}
        >
          <ChapterLabel style={{ marginBottom: 8 }}>Privacy note</ChapterLabel>
          <Body serif size={13} style={{ fontStyle: 'italic' }}>
            Your photograph never leaves your phone. Only the numbers we derive from it do.
          </Body>
        </View>

        <View style={{ flex: 1 }} />
        <PrimaryButton label="Begin →" onPress={onBegin} />
      </View>
    </SafeAreaView>
  );
}

// ── Align (camera live view) ─────────────────────────────────────────────

function AlignPhase({
  cameraRef,
  onCapture,
  onBack,
}: {
  cameraRef: React.MutableRefObject<CameraView | null>;
  onCapture: () => void;
  onBack: () => void;
}) {
  const { width: screenWidth } = Dimensions.get('window');
  const ovalWidth  = Math.min(280, screenWidth * 0.72);
  const ovalHeight = ovalWidth * 1.32;

  return (
    <View style={{ flex: 1, backgroundColor: Palette.scanBg }}>
      <CameraView
        ref={cameraRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        facing="front"
      />

      {/* Top scrim with chapter + back */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: 'rgba(28,19,12,0.55)' }}>
        <View
          style={{
            paddingHorizontal: 28,
            paddingTop: 8,
            paddingBottom: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <BackButton dark onPress={onBack} style={{ marginLeft: -8 }} />
          <ChapterLabel dark>Hold steady</ChapterLabel>
          <View style={{ width: 60 }} />
        </View>
      </SafeAreaView>

      {/* Oval guide — solid thin translucent border, sized relative to screen */}
      <View
        pointerEvents="none"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: ovalWidth,
            height: ovalHeight,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(243,239,230,0.5)',
          }}
        />
      </View>

      {/* Bottom scrim with caption + capture */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: 'rgba(28,19,12,0.55)' }}>
        <View style={{ paddingHorizontal: 32, paddingTop: 22, paddingBottom: 26, alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: 'CormorantGaramond_400Regular_Italic',
              fontStyle: 'italic',
              fontSize: 15,
              color: 'rgba(243,239,230,0.85)',
              textAlign: 'center',
              marginBottom: 22,
            }}
          >
            Center your face within the frame.
          </Text>

          <TouchableOpacity
            onPress={onCapture}
            activeOpacity={0.8}
            style={{
              width: 78,
              height: 78,
              borderRadius: 99,
              borderWidth: 2,
              borderColor: Palette.onScanBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 99,
                backgroundColor: Palette.onScanBg,
              }}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Analyzing ────────────────────────────────────────────────────────────

function AnalyzingPhase({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  // Three pulsing dots, staggered.
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    if (error) return;
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(v, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [error, dots]);

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.scanBg }}>
        <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 60, paddingBottom: 30 }}>
          <ChapterLabel dark>Something went wrong</ChapterLabel>
          <View style={{ height: 16 }} />
          <Display dark>
            <Display dark italic>The reading</Display>
            {'\n'}didn't complete.
          </Display>
          <View style={{ height: 20 }} />
          <Body serif dark size={14} style={{ fontStyle: 'italic', color: 'rgba(243,239,230,0.75)' }}>
            {error}
          </Body>
          <View style={{ flex: 1 }} />
          <PrimaryButton dark label="Try again" onPress={onRetry} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.scanBg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <ChapterLabel dark>Reading your scan</ChapterLabel>
        <View style={{ height: 18 }} />
        <Display dark size="small" style={{ textAlign: 'center' }}>
          <Display dark italic size="small">A moment,</Display>
          {'\n'}while we look closely.
        </Display>

        <View style={{ height: 36 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {dots.map((v, i) => (
            <Animated.View
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                backgroundColor: Palette.onScanBg,
                opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
                transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] }) }],
              }}
            />
          ))}
        </View>

        <View style={{ height: 28 }} />
        <ActivityIndicator color={Palette.onScanBg} style={{ opacity: 0 }} />
      </View>
    </SafeAreaView>
  );
}
