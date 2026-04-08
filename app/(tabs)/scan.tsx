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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useScan } from '../../hooks/useScan';
import { GUEST_PROFILE_KEY } from '../_layout';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { getTierFromScore, getCategoryPotential, getCategoryDiamonds } from '../../constants/tiers';
import type { Scan } from '../../types';

const { width: SW, height: SH } = Dimensions.get('window');

function inferGenderFromScan(scan: Scan): string {
  if (scan.beard_density && scan.beard_density !== 'none') return 'man';
  if (scan.brow_condition) return 'woman';
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

// ─── HOME ────────────────────────────────────────────────────────────────────
function HomeScreen({ onStart, gender, onGenderChange, isGuest }: {
  onStart: () => void;
  gender: string;
  onGenderChange: (g: string) => void;
  isGuest: boolean;
}) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="light" />
      <Animated.View style={[s.homeInner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={s.brand}>Lumé</Text>
        <Animated.View style={[s.scanRing, { transform: [{ scale: pulseAnim }] }]}>
          <View style={s.scanRingInner}>
            <Text style={s.scanRingLabel}>SCAN</Text>
          </View>
        </Animated.View>
        <Text style={s.homeHint}>
          Point your front camera at your face.{'\n'}
          We'll analyse it in under 30 seconds.
        </Text>
        {isGuest && (
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
        )}
        <TouchableOpacity style={s.ctaButton} onPress={onStart} activeOpacity={0.8}>
          <Text style={s.ctaText}>Scan your face</Text>
        </TouchableOpacity>
      </Animated.View>
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
      {error && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}
      <View style={s.cameraBottomBar}>
        <TouchableOpacity onPress={onCancel} style={s.cameraTextBtn}>
          <Text style={s.cameraTextBtnLabel}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCapture}
          disabled={capturing}
          activeOpacity={0.8}
          style={s.captureOuter}
        >
          <Animated.View style={[s.captureInner, capturing && { opacity: 0.5 }]} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
          style={s.cameraIconBtn}
        >
          <View style={s.flipIconCircle}>
            <Text style={s.flipIconText}>⟳</Text>
          </View>
        </TouchableOpacity>
      </View>
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

// ─── DIAMONDS ────────────────────────────────────────────────────────────────
function Diamonds({ count, total = 3 }: { count: number; total?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 9,
            height: 9,
            backgroundColor: i < count ? '#C9A84C' : '#2A2420',
            borderRadius: 2,
            transform: [{ rotate: '45deg' }],
          }}
        />
      ))}
    </View>
  );
}

// ─── RESULT ───────────────────────────────────────────────────────────────────
function ResultScreen({ scan, gender, onScanAgain }: {
  scan:        NonNullable<ReturnType<typeof useScan>['result']>;
  gender:      string;
  onScanAgain: () => void;
}) {
  const router   = useRouter();
  const tier     = getTierFromScore(scan.score_overall ?? 0);
  const isWoman  = gender === 'woman';

  const catFade  = useRef(new Animated.Value(0)).current;
  const catSlide = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(catFade,  { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }),
      Animated.timing(catSlide, { toValue: 0, duration: 600, delay: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const categories = isWoman
    ? [
        { label: 'Hair',   score: scan.score_hair   },
        { label: 'Skin',   score: scan.score_skin   },
        { label: 'Makeup', score: scan.score_makeup },
      ]
    : [
        { label: 'Hair',  score: scan.score_hair  },
        { label: 'Skin',  score: scan.score_skin  },
        { label: 'Beard', score: scan.score_beard },
      ];

  const pills = [
    scan.face_shape   && `${scan.face_shape} face`,
    scan.hair_texture && `${scan.hair_texture} hair`,
    scan.skin_type    && `${scan.skin_type} skin`,
  ].filter(Boolean) as string[];

  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={s.resultBox}
        showsVerticalScrollIndicator={false}
      >
        {/* Diamond icon */}
        <View style={s.iconWrap}>
          <View style={s.iconDiamond} />
        </View>

        {/* Tier */}
        <Text style={s.profileLabel}>YOUR GROOMING PROFILE</Text>
        <Text style={s.tierName}>{tier.name}</Text>
        <Diamonds count={tier.diamonds} />
        <Text style={s.tierDesc}>{tier.description}</Text>

        {/* Divider */}
        <View style={s.divider} />

        {/* Pills */}
        <Animated.View style={[s.pillsRow, { opacity: catFade, transform: [{ translateY: catSlide }] }]}>
          {pills.map(p => (
            <View key={p} style={s.pill}>
              <Text style={s.pillText}>{p}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Categories */}
        <Animated.View style={[s.categoriesWrap, { opacity: catFade, transform: [{ translateY: catSlide }] }]}>
          <Text style={s.focusLabel}>AREAS TO FOCUS ON</Text>
          <View style={s.categoriesCard}>
            {categories.map((cat, idx) => (
              <View key={cat.label} style={[
                s.catRow,
                idx < categories.length - 1 && s.catRowBorder,
              ]}>
                <View>
                  <Text style={s.catLabel}>{cat.label}</Text>
                  <Text style={s.catPotential}>{getCategoryPotential(cat.score)}</Text>
                </View>
                <Diamonds count={getCategoryDiamonds(cat.score)} />
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Actions */}
        <Animated.View style={[s.actionsWrap, { opacity: catFade }]}>
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
  const [gender,  setGender]  = useState<string>('man');
  const [isGuest, setIsGuest] = useState<boolean>(true);

  useEffect(() => {
    const loadGender = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const guestMode = !session;
      setIsGuest(guestMode);

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
  return <HomeScreen onStart={openCamera} gender={gender} onGenderChange={handleGenderChange} isGuest={isGuest} />;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background },

  // Home
  homeInner:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  brand:        { fontFamily: Typography.serif, fontSize: Typography.size.xxxl, color: Colors.cream, letterSpacing: 2 },
  scanRing:     { width: 180, height: 180, borderRadius: 90, borderWidth: 2, borderColor: Colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xxxl, marginTop: Spacing.xl },
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
  cameraBottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingBottom: 48, paddingTop: 24,
    backgroundColor: 'rgba(10,10,10,0.6)',
  },
  cameraTextBtn:      { width: 72, alignItems: 'flex-start' },
  cameraTextBtnLabel: { color: '#C9A84C', fontSize: 16, fontWeight: '500' },
  captureOuter: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF' },
  cameraIconBtn:  { width: 72, alignItems: 'flex-end' },
  flipIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  flipIconText: { color: '#FFFFFF', fontSize: 22, fontWeight: '300' },
  errorBanner:  { position: 'absolute', bottom: 160, left: Spacing.lg, right: Spacing.lg, backgroundColor: Colors.danger, borderRadius: Radius.input, padding: Spacing.md },
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
  iconWrap:       { width: 52, height: 52, backgroundColor: 'rgba(201,168,76,0.1)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  iconDiamond:    { width: 22, height: 22, backgroundColor: Colors.gold, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  profileLabel:   { fontSize: 10, color: Colors.textSecondary, letterSpacing: 3, marginBottom: 8 },
  tierName:       { fontFamily: Typography.serif, fontSize: 38, color: Colors.cream, lineHeight: 44, marginBottom: 10 },
  tierDesc:       { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 10, marginBottom: 4, paddingHorizontal: Spacing.lg, lineHeight: 18 },
  divider:        { height: 1, backgroundColor: Colors.border, width: '100%', marginVertical: Spacing.lg },
  pillsRow:       { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.xs, marginBottom: Spacing.xl },
  focusLabel:     { fontSize: 10, color: Colors.gold, letterSpacing: 3, marginBottom: Spacing.sm, alignSelf: 'flex-start' },
  categoriesWrap: { width: '100%', marginBottom: Spacing.xl },
  categoriesCard: { backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  catRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  catRowBorder:   { borderBottomWidth: 1, borderBottomColor: Colors.border },
  catLabel:       { fontSize: 14, color: Colors.cream, marginBottom: 3 },
  catPotential:   { fontSize: 11, color: Colors.textSecondary },
  actionsWrap:    { width: '100%' },
  pill:           { backgroundColor: Colors.surface, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  pillText:       { fontSize: Typography.size.sm, color: Colors.textSecondary, textTransform: 'capitalize' },
});
