// Scan tab — home → camera → processing → result
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, Animated, ActivityIndicator,
  SafeAreaView, Alert, ScrollView, Share,
} from 'react-native';
import { useRef, useEffect, useState, useCallback } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useScan, ScanPhase } from '../../hooks/useScan';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { getTierFromScore, getCategoryPotential, getCategoryDiamonds } from '../../constants/tiers';
import { getMonthlyScansInfo, unlockBonusScan } from '../../services/scanService';
import type { Scan } from '../../types';

type ScanInfo = {
  scansThisPeriod: number;
  baseAllowed:     number;
  bonusScans:      number;
  scansAllowed:    number;
  canScan:         boolean;
  canUnlockMore:   boolean;
  periodStart:     string | null;
  daysUntilReset:  number;
};

const { width: SW, height: SH } = Dimensions.get('window');

// Oval guide
const OVAL_W    = SW * 0.75;
const OVAL_H    = SH * 0.60;
const OVAL_LEFT = (SW - OVAL_W) / 2;
const OVAL_TOP  = (SH - OVAL_H) / 2;

// ─── HOME ────────────────────────────────────────────────────────────────────
function HomeScreen({ onStart, scanInfo, onShareToUnlock, sharingBonus }: {
  onStart:         () => void;
  scanInfo:        ScanInfo | null;
  onShareToUnlock: () => void;
  sharingBonus:    boolean;
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

  const isLocked = scanInfo !== null && !scanInfo.canScan;

  return (
    <SafeAreaView style={s.fill}>
      <StatusBar style="light" />
      <Animated.View style={[s.homeInner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={s.brand}>Lumé</Text>

        <Animated.View style={[s.scanRing, isLocked && s.scanRingLocked, { transform: [{ scale: pulseAnim }] }]}>
          <View style={s.scanRingInner}>
            <Text style={[s.scanRingLabel, isLocked && s.scanRingLabelLocked]}>
              {isLocked ? 'LOCKED' : 'SCAN'}
            </Text>
          </View>
        </Animated.View>

        {/* Scan counter */}
        {scanInfo && (
          <View style={s.counterRow}>
            <Text style={s.counterText}>
              {scanInfo.scansThisPeriod}/{scanInfo.scansAllowed} scans used this period
            </Text>
            <Text style={s.counterReset}>resets in {scanInfo.daysUntilReset}d</Text>
          </View>
        )}

        {/* Bonus dots — shows up once user has unlocked at least 1 bonus */}
        {scanInfo && scanInfo.bonusScans > 0 && (
          <View style={s.bonusDotsRow}>
            <Text style={s.bonusDotsLabel}>BONUS SCANS</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <View
                  key={i}
                  style={i < scanInfo.bonusScans ? s.bonusDotFilled : s.bonusDotEmpty}
                />
              ))}
            </View>
          </View>
        )}

        {!isLocked ? (
          <>
            <Text style={s.homeHint}>
              Point your front camera at your face.{'\n'}
              We'll analyse it in under 30 seconds.
            </Text>
            <TouchableOpacity style={s.ctaButton} onPress={onStart} activeOpacity={0.8}>
              <Text style={s.ctaText}>Scan your face</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.homeHint}>
              You've used all your scans for this period.{'\n'}
              Share Lumé to unlock a bonus scan.
            </Text>
            {scanInfo.canUnlockMore ? (
              <TouchableOpacity
                style={s.ctaButton}
                onPress={onShareToUnlock}
                activeOpacity={0.8}
                disabled={sharingBonus}
              >
                {sharingBonus
                  ? <ActivityIndicator color={Colors.background} />
                  : <Text style={s.ctaText}>Share to unlock a scan</Text>
                }
              </TouchableOpacity>
            ) : (
              <View style={s.lockedNote}>
                <Text style={s.lockedNoteText}>
                  All 5 bonus scans unlocked — resets in {scanInfo.daysUntilReset} days.
                </Text>
              </View>
            )}
          </>
        )}
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
              if (scan.id?.startsWith('local_')) {
                // Failed Supabase save — pass full scan data
                router.push({
                  pathname: '/recommendations',
                  params: { scanJson: JSON.stringify(scan) },
                });
              } else {
                // Successfully saved to Supabase — fetch by ID
                router.push({
                  pathname: '/recommendations',
                  params: { scanId: scan.id },
                });
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
  const [gender, setGender]           = useState<string>('man');
  const [scanInfo, setScanInfo]       = useState<ScanInfo | null>(null);
  const [sharingBonus, setSharingBonus] = useState(false);

  const loadScanInfo = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    try {
      const info = await getMonthlyScansInfo(user.id);
      setScanInfo(info);
    } catch {
      // Non-critical — quota check failing should not block scanning
    }
  }, []);

  // Load gender + quota whenever the tab comes into focus (independent of scan flow).
  useFocusEffect(
    useCallback(() => {
      const loadGender = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from('users')
          .select('gender')
          .eq('id', user.id)
          .single();
        if (profile?.gender) setGender(profile.gender as string);
      };
      loadGender();
      loadScanInfo();
    }, [loadScanInfo]),
  );

  // After a scan completes and the user returns to home, refresh the count with
  // a 1-second delay so the Supabase write has finished before we re-query.
  const prevPhaseRef = useRef<ScanPhase>('home');
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (phase === 'home' && prev === 'result') {
      const timer = setTimeout(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const updated = await getMonthlyScansInfo(user.id);
          setScanInfo(updated);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const handleShareToUnlock = useCallback(async () => {
    setSharingBonus(true);
    try {
      await Share.share({
        message: 'Check out Lumé — AI grooming analysis for your face. It tells you exactly what to ask your stylist. https://getlume.app',
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !scanInfo?.periodStart) return;
      const result = await unlockBonusScan(user.id, scanInfo.periodStart);
      if (result.success) {
        await loadScanInfo();
      } else {
        Alert.alert('Could not unlock', 'You have already unlocked the maximum 5 bonus scans this period.');
      }
    } catch {
      // User cancelled share sheet — no-op
    } finally {
      setSharingBonus(false);
    }
  }, [scanInfo, loadScanInfo]);

  const handleCapture = useCallback(
    (uri: string) => processPhoto(uri, gender),
    [processPhoto, gender],
  );

  if (phase === 'camera')     return <CameraScreen onCapture={handleCapture} onCancel={reset} error={error} />;
  if (phase === 'processing') return <ProcessingScreen step={processingStep} />;
  if (phase === 'result' && result) return <ResultScreen scan={result} gender={gender} onScanAgain={reset} />;
  return (
    <HomeScreen
      onStart={openCamera}
      scanInfo={scanInfo}
      onShareToUnlock={handleShareToUnlock}
      sharingBonus={sharingBonus}
    />
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background },

  // Home
  homeInner:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  brand:            { fontFamily: Typography.serif, fontSize: 28, color: Colors.cream, letterSpacing: 2 },
  scanRing:         { width: 180, height: 180, borderRadius: 90, borderWidth: 2, borderColor: Colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg, marginTop: Spacing.xl },
  scanRingLocked:   { borderColor: Colors.textTertiary },
  scanRingInner:    { width: 140, height: 140, borderRadius: 70, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  scanRingLabel:    { fontSize: 10, color: Colors.gold, letterSpacing: 1.5, textTransform: 'uppercase' },
  scanRingLabelLocked: { color: Colors.textTertiary },
  homeHint:         { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xl },
  counterRow:       { alignItems: 'center', marginBottom: Spacing.sm },
  counterText:      { fontSize: 13, color: Colors.textSecondary },
  counterReset:     { fontSize: 11, color: Colors.textTertiary, marginTop: 2 },
  bonusDotsRow:     { alignItems: 'center', marginBottom: Spacing.lg, gap: Spacing.xs },
  bonusDotsLabel:   { fontSize: 9, color: Colors.gold, letterSpacing: 3, textTransform: 'uppercase' },
  bonusDotFilled:   { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gold },
  bonusDotEmpty:    { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border, borderWidth: 1, borderColor: Colors.textTertiary },
  lockedNote:       { backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, width: '100%' },
  lockedNoteText:   { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18 },

  // Shared
  ctaButton:    { backgroundColor: Colors.gold, borderRadius: Radius.input, paddingVertical: Spacing.md, alignItems: 'center', width: '100%', marginBottom: Spacing.md },
  ctaText:      { fontSize: 14, fontWeight: '600', color: Colors.background, letterSpacing: 0.3 },
  cancelLink:   { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelLinkText:{ fontSize: 13, color: Colors.textSecondary },

  // Camera
  overlay:      { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  ovalGuide:    { position: 'absolute', borderRadius: 999, borderWidth: 2, borderColor: Colors.gold },
  cameraTopBar: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: Spacing.lg },
  cameraHint:   { fontSize: 13, color: Colors.cream, letterSpacing: 0.3, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.pill, overflow: 'hidden' },
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
  errorText:    { color: Colors.cream, fontSize: 13, textAlign: 'center' },
  permissionBox:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  permissionTitle:{ fontFamily: Typography.serif, fontSize: 22, color: Colors.cream, marginBottom: Spacing.md, textAlign: 'center' },
  permissionBody: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xl },

  // Processing
  processingBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  processingStep: { fontSize: 13, color: Colors.cream, textAlign: 'center', marginBottom: Spacing.sm },
  processingNote: { fontSize: 13, color: Colors.textTertiary },

  // Result
  resultBox: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl,
  },
  iconWrap:       { width: 52, height: 52, backgroundColor: 'rgba(201,168,76,0.1)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  iconDiamond:    { width: 22, height: 22, backgroundColor: Colors.gold, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  profileLabel:   { fontSize: 10, color: Colors.textSecondary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  tierName:       { fontFamily: Typography.serif, fontSize: 38, color: Colors.cream, lineHeight: 44, marginBottom: 10 },
  tierDesc:       { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 10, marginBottom: 4, paddingHorizontal: Spacing.lg, lineHeight: 18 },
  divider:        { height: 1, backgroundColor: Colors.border, width: '100%', marginVertical: Spacing.lg },
  pillsRow:       { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.xs, marginBottom: Spacing.xl },
  focusLabel:     { fontSize: 10, color: Colors.gold, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.sm, alignSelf: 'flex-start' },
  categoriesWrap: { width: '100%', marginBottom: Spacing.xl },
  categoriesCard: { backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md },
  catRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  catRowBorder:   { borderBottomWidth: 1, borderBottomColor: Colors.border },
  catLabel:       { fontSize: 15, color: Colors.cream, marginBottom: 3 },
  catPotential:   { fontSize: 11, color: Colors.textSecondary },
  actionsWrap:    { width: '100%' },
  pill:           { backgroundColor: Colors.surface, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  pillText:       { fontSize: 9, color: Colors.textSecondary, textTransform: 'capitalize' },
});
