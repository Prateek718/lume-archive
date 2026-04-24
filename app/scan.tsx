// Three-phase scan screen — unified dark three-zone layout.
//
// All three phases (intro, align, analyzing) share the same structure:
//   TOP    : BackButton + ChapterLabel + Display title
//   MIDDLE : Oval guide, always centered on dark bg. CameraView + 55% dark
//            overlay are rendered ONLY in the align phase — mounted on
//            intro→align, unmounted on align→analyzing. Intro and analyzing
//            both show the oval on a solid scanBg with no camera preview.
//   BOTTOM : italic body line + phase-specific CTA
//
// useScan owns the state machine. This screen pushes a photo into it via
// start(), then watches state for success / branching screens.

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
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
      if (scan.result?.id) {
        router.replace({
          pathname: '/(scan)/observation',
          params:   { scanId: scan.result.id },
        } as never);
      } else {
        router.replace('/(scan)/complete' as never);
      }
      return;
    }
    if (scan.state === 'phase1' || scan.state === 'phase2') {
      setPhase('analyzing');
    }
  }, [scan.state, scan.result, router]);

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

  const onBack = () => {
    if (phase === 'intro') {
      router.back();
    } else if (phase === 'align') {
      setPhase('intro');
    }
    // analyzing: no back — scan is in-flight.
  };

  const onRetry = () => {
    scan.reset();
    captureLockRef.current = false;
    setPhase('intro');
  };

  // Error state gets its own full-screen layout.
  if (scan.state === 'error') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorView error={scan.error} onRetry={onRetry} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScanLayout
        phase={phase}
        permissionGranted={permission?.granted ?? false}
        cameraRef={cameraRef}
        onBack={onBack}
        onBegin={onBegin}
        onCapture={onCapture}
      />
    </>
  );
}

// ── Three-zone layout (intro / align / analyzing) ─────────────────────────

interface ScanLayoutProps {
  phase:             LocalPhase;
  permissionGranted: boolean;
  cameraRef:         React.MutableRefObject<CameraView | null>;
  onBack:            () => void;
  onBegin:           () => void;
  onCapture:         () => void;
}

function ScanLayout({
  phase,
  permissionGranted,
  cameraRef,
  onBack,
  onBegin,
  onCapture,
}: ScanLayoutProps) {
  const { width: screenWidth } = Dimensions.get('window');
  const ovalWidth  = Math.min(280, screenWidth * 0.72);
  const ovalHeight = ovalWidth * 1.32;

  const chapter =
    phase === 'intro'     ? 'First reading' :
    phase === 'align'     ? 'Hold steady'   :
                            'Reading';

  const body =
    phase === 'intro'     ? 'Find a window with soft daylight. No filter, no makeup.' :
    phase === 'align'     ? 'Eyes level \u00B7 shoulders relaxed \u00B7 three seconds.' :
                            'This takes about twenty seconds. Breathe normally.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.scanBg }}>
      {/* TOP — solid dark */}
      <View
        style={{
          paddingHorizontal: 28,
          paddingTop:        8,
          paddingBottom:     18,
          backgroundColor:   Palette.scanBg,
        }}
      >
        {phase === 'analyzing' ? (
          <View style={{ height: 30 }} />
        ) : (
          <BackButton dark onPress={onBack} style={{ marginLeft: -8 }} />
        )}
        <View style={{ paddingHorizontal: 4, marginTop: 12 }}>
          <ChapterLabel dark>{chapter}</ChapterLabel>
          <View style={{ height: 12 }} />
          <TitleForPhase phase={phase} />
        </View>
      </View>

      {/* MIDDLE — oval always; camera + overlay only during align */}
      <View style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {phase === 'align' && permissionGranted ? (
          <>
            <CameraView
              ref={cameraRef}
              facing="front"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            {/* 55% dark overlay dims camera so top/bottom text stays legible */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(28, 19, 12, 0.55)',
              }}
            />
          </>
        ) : null}

        <View
          pointerEvents="none"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width:        ovalWidth,
              height:       ovalHeight,
              borderRadius: ovalWidth / 2,
              borderWidth:  1,
              borderStyle:  'solid',
              borderColor:  'rgba(243, 239, 230, 0.5)',
              overflow:     'hidden',
            }}
          >
            {phase === 'analyzing' ? <SweepBar ovalHeight={ovalHeight} /> : null}
          </View>
        </View>
      </View>

      {/* BOTTOM — solid dark */}
      <View
        style={{
          paddingHorizontal: 32,
          paddingTop:        22,
          paddingBottom:     26,
          backgroundColor:   Palette.scanBg,
        }}
      >
        <Body
          serif
          dark
          size={14.5}
          style={{
            fontStyle:   'italic',
            textAlign:   'center',
            color:       'rgba(243, 239, 230, 0.75)',
            marginBottom: 22,
          }}
        >
          {body}
        </Body>

        {phase === 'intro'     ? <PrimaryButton dark label="I'm ready" onPress={onBegin} /> : null}
        {phase === 'align'     ? <CaptureButtonRow onCapture={onCapture} />                : null}
        {phase === 'analyzing' ? <AnalyzingDots />                                         : null}
      </View>
    </SafeAreaView>
  );
}

// ── Title (per phase, reused inside ScanLayout) ───────────────────────────

function TitleForPhase({ phase }: { phase: LocalPhase }) {
  if (phase === 'intro') {
    return (
      <Display dark size="small">
        <Display dark size="small" italic>Settle in.</Display>
        {'\n'}Let&apos;s take a look.
      </Display>
    );
  }
  if (phase === 'align') {
    return (
      <Display dark size="small">
        Bring your face{'\n'}into the{' '}
        <Display dark size="small" italic>frame</Display>.
      </Display>
    );
  }
  return (
    <Display dark size="small">
      <Display dark size="small" italic>A quiet</Display>
      {'\n'}observation.
    </Display>
  );
}

// ── Capture button ───────────────────────────────────────────────────────

function CaptureButtonRow({ onCapture }: { onCapture: () => void }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <TouchableOpacity
        onPress={onCapture}
        activeOpacity={0.8}
        style={{
          width:          78,
          height:         78,
          borderRadius:   99,
          borderWidth:    2,
          borderColor:    Palette.onScanBg,
          alignItems:     'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width:           60,
            height:          60,
            borderRadius:    99,
            backgroundColor: Palette.onScanBg,
          }}
        />
      </TouchableOpacity>
    </View>
  );
}

// ── Analyzing dots ───────────────────────────────────────────────────────

function AnalyzingDots() {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;
  const dots = [a, b, c];

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {dots.map((v, i) => (
          <Animated.View
            key={i}
            style={{
              width:           8,
              height:          8,
              borderRadius:    99,
              backgroundColor: Palette.onScanBg,
              opacity:         v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform:       [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] }) }],
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ── Sweep bar (shown inside oval during analyzing) ────────────────────────

function SweepBar({ ovalHeight }: { ovalHeight: number }) {
  const translateY = useRef(new Animated.Value(20)).current;
  const opacity    = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const translateLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue:        ovalHeight - 40,
          duration:       2400,
          easing:         Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue:        20,
          duration:       0,
          useNativeDriver: true,
        }),
      ]),
    );
    const opacityLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue:        0.9,
          duration:       1200,
          easing:         Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue:        0.3,
          duration:       1200,
          easing:         Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    translateLoop.start();
    opacityLoop.start();
    return () => {
      translateLoop.stop();
      opacityLoop.stop();
    };
  }, [ovalHeight, translateY, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position:        'absolute',
        left:            0,
        right:           0,
        height:          2,
        backgroundColor: Palette.accent,
        transform:       [{ translateY }],
        opacity,
      }}
    />
  );
}

// ── Error state ──────────────────────────────────────────────────────────

function ErrorView({
  error,
  onRetry,
}: {
  error:   string | null;
  onRetry: () => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.scanBg }}>
      <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 60, paddingBottom: 30 }}>
        <ChapterLabel dark>Something went wrong</ChapterLabel>
        <View style={{ height: 16 }} />
        <Display dark>
          <Display dark italic>The reading</Display>
          {'\n'}didn&apos;t complete.
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
