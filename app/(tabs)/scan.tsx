// Scan tab — home → camera → processing → result
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, Animated, ActivityIndicator,
  SafeAreaView, Alert, ScrollView,
} from 'react-native';
import { useRef, useEffect, useState, useCallback } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useScan } from '../../hooks/useScan';
import { GUEST_PROFILE_KEY } from '../_layout';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import type { Scan } from '../../types';

const { width: SW, height: SH } = Dimensions.get('window');

function inferGenderFromScan(scan: Scan): string {
  if (scan.beard_density && scan.beard_density !== 'none') return 'man';
  if (scan.brow_shape) return 'woman';
  if (scan.undereye) return 'woman';
  if (scan.score_makeup !== null && scan.score_beard === null) return 'woman';
  if (scan.score_beard !== null && scan.score_makeup === null) return 'man';
  return 'man';
}

// Oval guide
const OVAL_W    = SW * 0.75;
const OVAL_H    = SH * 0.60;
const OVAL_LEFT = (SW - OVAL_W) / 2;
const OVAL_TOP  = (SH - OVAL_H) / 2;

// Arc gauge constants — 270° horseshoe, gap at bottom
const R        = 88;
const SW_STROKE = 14;
const ARC_SIZE  = (R + SW_STROKE) * 2 + 4;
const ARC_CX    = ARC_SIZE / 2;
const CIRCUM    = 2 * Math.PI * R;
const ARC_LEN   = CIRCUM * 0.75;   // 270°

// Animated SVG circle (strokeDashoffset can't use native driver)
const AnimatedCircle = Animated.createAnimatedComponent(Circle as React.ComponentType<any>);

// ─── HOME ────────────────────────────────────────────────────────────────────
function HomeScreen({ onStart, gender, onGenderChange }: {
  onStart: () => void;
  gender: string;
  onGenderChange: (g: string) => void;
}) {
  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="light" />
      <View style={s.homeInner}>
        <Text style={s.brand}>Lumé</Text>
        <Text style={s.homeTagline}>be you</Text>
        <View style={s.scanRing}>
          <View style={s.scanRingInner}>
            <Text style={s.scanRingLabel}>SCAN</Text>
          </View>
        </View>
        <Text style={s.homeHint}>
          Point your front camera at your face.{'\n'}
          We'll analyse it in under 30 seconds.
        </Text>
        <View style={{
          flexDirection: 'row',
          gap: 12,
          marginBottom: 24,
          justifyContent: 'center',
        }}>
          {(['man', 'woman'] as const).map((g) => (
            <TouchableOpacity
              key={g}
              onPress={() => onGenderChange(g)}
              style={{
                paddingHorizontal: 24,
                paddingVertical: 10,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: gender === g ? '#C9A84C' : '#2A2420',
                backgroundColor: gender === g ? 'rgba(201,168,76,0.1)' : 'transparent',
              }}
            >
              <Text style={{
                color: gender === g ? '#C9A84C' : '#8A7A6A',
                fontSize: 14,
                fontWeight: gender === g ? '600' : '400',
                textTransform: 'capitalize',
              }}>
                {g === 'man' ? '👨 Man' : '👩 Woman'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.ctaButton} onPress={onStart} activeOpacity={0.8}>
          <Text style={s.ctaText}>Scan your face</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── CAMERA ──────────────────────────────────────────────────────────────────
function CameraScreen({ onCapture, onCancel, error }: {
  onCapture: (uri: string) => void;
  onCancel:  () => void;
  error:     string | null;
}) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) onCapture(photo.uri);
    } catch {
      Alert.alert('Camera error', 'Could not take photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, onCapture]);

  if (!permission) return <View style={s.fill} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.fill}>
        <StatusBar style="light" />
        <View style={s.permissionBox}>
          <Text style={s.permissionTitle}>Camera access needed</Text>
          <Text style={s.permissionBody}>
            Lumé needs your camera to analyse your face. Your photo is processed
            immediately and never stored permanently.
          </Text>
          <TouchableOpacity style={s.ctaButton} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={s.ctaText}>Allow camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelLink} onPress={onCancel}>
            <Text style={s.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.fill}>
      <StatusBar style="light" />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
      <View style={[s.overlay, { top: 0, left: 0, right: 0, height: OVAL_TOP }]} />
      <View style={[s.overlay, { top: OVAL_TOP + OVAL_H, left: 0, right: 0, bottom: 0 }]} />
      <View style={[s.overlay, { top: OVAL_TOP, left: 0, width: OVAL_LEFT, height: OVAL_H }]} />
      <View style={[s.overlay, { top: OVAL_TOP, left: OVAL_LEFT + OVAL_W, right: 0, height: OVAL_H }]} />
      <View style={[s.ovalGuide, { top: OVAL_TOP, left: OVAL_LEFT, width: OVAL_W, height: OVAL_H }]} />
      <SafeAreaView style={s.cameraTopBar} pointerEvents="none">
        <Text style={s.cameraHint}>Position your face in the oval</Text>
      </SafeAreaView>
      <TouchableOpacity
        onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          backgroundColor: 'rgba(0,0,0,0.5)',
          borderRadius: 20,
          padding: 8,
        }}
      >
        <Text style={{ color: 'white', fontSize: 20 }}>🔄</Text>
      </TouchableOpacity>
      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}
      <SafeAreaView style={s.cameraControls}>
        <TouchableOpacity style={s.cancelLink} onPress={onCancel}>
          <Text style={s.cancelLinkText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.captureBtn, capturing && s.captureBtnDisabled]}
          onPress={handleCapture}
          activeOpacity={0.8}
          disabled={capturing}
        >
          <View style={s.captureBtnInner} />
        </TouchableOpacity>
        <View style={{ width: 60 }} />
      </SafeAreaView>
    </View>
  );
}

// ─── PROCESSING ───────────────────────────────────────────────────────────────
function ProcessingScreen({ step }: { step: string }) {
  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="light" />
      <View style={s.processingBox}>
        <Text style={s.brand}>Lumé</Text>
        <ActivityIndicator color={Colors.gold} size="large" style={{ marginVertical: Spacing.xl }} />
        <Text style={s.processingStep}>{step}</Text>
        <Text style={s.processingNote}>This takes about 20 seconds</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── RESULT ───────────────────────────────────────────────────────────────────
function ResultScreen({ scan, gender, onScanAgain }: {
  scan:        NonNullable<ReturnType<typeof useScan>['result']>;
  gender:      string;
  onScanAgain: () => void;
}) {
  const router  = useRouter();
  const score   = scan.score_overall ?? 0;

  const progress        = useRef(new Animated.Value(0)).current;
  const tierFade        = useRef(new Animated.Value(0)).current;
  const catFade         = useRef(new Animated.Value(0)).current;
  const catSlide        = useRef(new Animated.Value(24)).current;
  const [display, setDisplay] = useState(0);

  const strokeOffset = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [ARC_LEN, ARC_LEN * (1 - score / 100)],
  });

  useEffect(() => {
    // Arc + count-up over 1.8 s
    Animated.timing(progress, {
      toValue: 1, duration: 1800, useNativeDriver: false,
    }).start();
    const id = progress.addListener(({ value }) => setDisplay(Math.round(value * score)));

    // Tier label fades in after arc completes
    Animated.timing(tierFade, {
      toValue: 1, duration: 400, delay: 1900, useNativeDriver: true,
    }).start();

    // Categories slide up
    Animated.parallel([
      Animated.timing(catFade,  { toValue: 1, duration: 400, delay: 2200, useNativeDriver: true }),
      Animated.timing(catSlide, { toValue: 0, duration: 400, delay: 2200, useNativeDriver: true }),
    ]).start();

    return () => progress.removeListener(id);
  }, []);

  const categories = gender === 'woman'
    ? [
        { label: 'HAIR',   score: scan.score_hair   },
        { label: 'SKIN',   score: scan.score_skin   },
        { label: 'MAKEUP', score: scan.score_makeup },
      ]
    : [
        { label: 'HAIR',  score: scan.score_hair  },
        { label: 'SKIN',  score: scan.score_skin  },
        { label: 'BEARD', score: scan.score_beard },
      ];

  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.resultBox} showsVerticalScrollIndicator={false}>

        {/* Arc gauge */}
        <View style={s.arcWrap}>
          <Svg width={ARC_SIZE} height={ARC_SIZE}>
            {/* Track */}
            <Circle
              cx={ARC_CX} cy={ARC_CX} r={R}
              fill="none" stroke={Colors.surface2}
              strokeWidth={SW_STROKE}
              strokeDasharray={`${ARC_LEN} ${CIRCUM}`}
              strokeLinecap="round"
              transform={`rotate(135, ${ARC_CX}, ${ARC_CX})`}
            />
            {/* Animated progress */}
            <AnimatedCircle
              cx={ARC_CX} cy={ARC_CX} r={R}
              fill="none" stroke={Colors.gold}
              strokeWidth={SW_STROKE}
              strokeDasharray={`${ARC_LEN} ${CIRCUM}`}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              transform={`rotate(135, ${ARC_CX}, ${ARC_CX})`}
            />
          </Svg>
          {/* Score number centred inside arc */}
          <View style={s.arcCenter} pointerEvents="none">
            <Text style={s.arcScore}>{display}</Text>
            <Text style={s.arcLabel}>/ 100</Text>
          </View>
        </View>

        {/* Tier label */}
        <Animated.Text style={[s.tierLabel, { opacity: tierFade }]}>
          {scan.tier_label}
        </Animated.Text>

        {/* Category scores */}
        <Animated.View style={[s.catRow, { opacity: catFade, transform: [{ translateY: catSlide }] }]}>
          {categories.map(cat => (
            <View key={cat.label} style={s.catItem}>
              <Text style={s.catScore}>{cat.score ?? '—'}</Text>
              <Text style={s.catLabel}>{cat.label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Face detail pills */}
        <Animated.View style={[s.detailsRow, { opacity: catFade }]}>
          {scan.face_shape   && <View style={s.pill}><Text style={s.pillText}>{scan.face_shape} face</Text></View>}
          {scan.skin_type    && <View style={s.pill}><Text style={s.pillText}>{scan.skin_type} skin</Text></View>}
          {scan.hair_texture && <View style={s.pill}><Text style={s.pillText}>{scan.hair_texture} hair</Text></View>}
        </Animated.View>

        {/* Actions */}
        <Animated.View style={[{ width: '100%' }, { opacity: catFade }]}>
          <TouchableOpacity
            style={s.ctaButton}
            activeOpacity={0.8}
            onPress={() => {
              if (scan.id?.startsWith('guest_')) {
                router.push({ pathname: '/recommendations', params: { scanJson: JSON.stringify(scan) } });
              } else {
                router.push({ pathname: '/recommendations', params: { scanId: scan.id } });
              }
            }}
          >
            <Text style={s.ctaText}>See recommendations</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelLink} onPress={onScanAgain}>
            <Text style={s.cancelLinkText}>Scan again</Text>
          </TouchableOpacity>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function ScanScreen() {
  const { phase, processingStep, result, error, openCamera, reset, processPhoto } = useScan();
  const [gender, setGender] = useState<string>('man');

  useEffect(() => {
    const loadGender = async () => {
      const profileStr = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
      const profile = profileStr ? JSON.parse(profileStr) as { gender?: string } : { gender: 'man' };
      setGender(profile.gender ?? 'man');
    };
    loadGender();
  }, []);

  useEffect(() => {
    if (!result) return;
    const inferAndPersist = async () => {
      const inferredGender = inferGenderFromScan(result);
      setGender(inferredGender);
      const profileStr = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
      const profile = profileStr ? (JSON.parse(profileStr) as Record<string, unknown>) : {};
      await AsyncStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify({ ...profile, gender: inferredGender }));
    };
    inferAndPersist();
  }, [result]);

  const handleGenderChange = useCallback(async (g: string) => {
    setGender(g);
    const profileStr = await AsyncStorage.getItem(GUEST_PROFILE_KEY);
    const profile = profileStr ? (JSON.parse(profileStr) as Record<string, unknown>) : {};
    await AsyncStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify({ ...profile, gender: g }));
  }, []);

  const handleCapture = useCallback(
    (uri: string) => processPhoto(uri, gender),
    [processPhoto, gender],
  );

  if (phase === 'camera')     return <CameraScreen onCapture={handleCapture} onCancel={reset} error={error} />;
  if (phase === 'processing') return <ProcessingScreen step={processingStep} />;
  if (phase === 'result' && result) return <ResultScreen scan={result} gender={gender} onScanAgain={reset} />;
  return <HomeScreen onStart={openCamera} gender={gender} onGenderChange={handleGenderChange} />;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background },

  // Home
  homeInner:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  brand:        { fontFamily: Typography.serif, fontSize: Typography.size.xxxl, color: Colors.cream, letterSpacing: 2 },
  homeTagline:  { fontSize: Typography.size.sm, color: Colors.textSecondary, letterSpacing: 6, textTransform: 'uppercase', marginTop: 4, marginBottom: Spacing.xxxl },
  scanRing:     { width: 180, height: 180, borderRadius: 90, borderWidth: 2, borderColor: Colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xxxl },
  scanRingInner:{ width: 140, height: 140, borderRadius: 70, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  scanRingLabel:{ fontSize: Typography.size.xs, color: Colors.gold, letterSpacing: 6, textTransform: 'uppercase' },
  homeHint:     { fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xl },

  // Shared
  ctaButton:    { backgroundColor: Colors.gold, borderRadius: Radius.input, paddingVertical: Spacing.md, alignItems: 'center', width: '100%', marginBottom: Spacing.md },
  ctaText:      { fontSize: Typography.size.md, fontWeight: '600', color: Colors.background, letterSpacing: 0.3 },
  cancelLink:   { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelLinkText:{ fontSize: Typography.size.base, color: Colors.textSecondary },

  // Camera
  overlay:      { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  ovalGuide:    { position: 'absolute', borderRadius: 999, borderWidth: 2, borderColor: Colors.gold },
  cameraTopBar: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: Spacing.lg },
  cameraHint:   { fontSize: Typography.size.sm, color: Colors.cream, letterSpacing: 0.3, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.pill, overflow: 'hidden' },
  cameraControls:{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl },
  captureBtn:   { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: Colors.cream, alignItems: 'center', justifyContent: 'center' },
  captureBtnDisabled: { opacity: 0.5 },
  captureBtnInner:    { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.cream },
  errorBanner:  { position: 'absolute', bottom: 140, left: Spacing.lg, right: Spacing.lg, backgroundColor: Colors.danger, borderRadius: Radius.input, padding: Spacing.md },
  errorText:    { color: Colors.cream, fontSize: Typography.size.base, textAlign: 'center' },
  permissionBox:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  permissionTitle:{ fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream, marginBottom: Spacing.md, textAlign: 'center' },
  permissionBody: { fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xl },

  // Processing
  processingBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  processingStep: { fontSize: Typography.size.md, color: Colors.cream, textAlign: 'center', marginBottom: Spacing.sm },
  processingNote: { fontSize: Typography.size.sm, color: Colors.textTertiary },

  // Result
  resultBox: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl,
  },
  arcWrap: {
    width: ARC_SIZE, height: ARC_SIZE,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  arcCenter: {
    position: 'absolute', alignItems: 'center',
  },
  arcScore: {
    fontFamily: Typography.serif, fontSize: 64, color: Colors.cream, lineHeight: 68,
  },
  arcLabel: {
    fontSize: Typography.size.sm, color: Colors.textSecondary,
  },
  tierLabel: {
    fontFamily: Typography.serif, fontSize: Typography.size.xl,
    color: Colors.gold, letterSpacing: 1, marginBottom: Spacing.xl,
  },
  catRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: Spacing.xxl, marginBottom: Spacing.lg,
  },
  catItem:  { alignItems: 'center' },
  catScore: { fontFamily: Typography.serif, fontSize: Typography.size.xxl, color: Colors.cream },
  catLabel: { fontSize: Typography.size.xs, color: Colors.textSecondary, letterSpacing: 4, textTransform: 'uppercase', marginTop: 2 },
  detailsRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: Spacing.sm, marginBottom: Spacing.xl,
  },
  pill:     { backgroundColor: Colors.surface, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  pillText: { fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'capitalize' },
});
