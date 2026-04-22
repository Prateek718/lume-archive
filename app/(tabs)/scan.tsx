// Scan tab — home → camera → processing → observation → recommendations
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, Animated, ActivityIndicator,
  SafeAreaView, Alert, ScrollView,
} from 'react-native';
import { useRef, useEffect, useState, useCallback } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Ellipse, Circle, Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useScan } from '../../hooks/useScan';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { DeadTimeQuestionCard } from '../../components/DeadTimeQuestionCard';
import { HairProfileDuringVision } from '../../components/HairProfileDuringVision';
import { RescanFeedbackFlow, type RescanFeedback } from '../../components/RescanFeedbackFlow';
import type { Scan, HairProfile } from '../../types';

const { width: SW, height: SH } = Dimensions.get('window');

function firstSentence(text?: string): string {
  if (!text) return '';
  const end = text.search(/[.!?]/);
  return end === -1 ? text.trim() : text.slice(0, end + 1).trim();
}

// Oval guide
const OVAL_W    = SW * 0.75;
const OVAL_H    = SH * 0.60;
const OVAL_LEFT = (SW - OVAL_W) / 2;
const OVAL_TOP  = (SH - OVAL_H) / 2;

// ─── HOME ────────────────────────────────────────────────────────────────────
function HomeScreen({ onStart }: { onStart: () => void }) {
  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const slideAnim   = useRef(new Animated.Value(30)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const scanningRef = useRef(false);

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
      <StatusBar style="dark" />
      <Animated.View style={[s.homeInner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Text style={s.brand}>Lumé</Text>

        <Animated.View style={[s.scanRing, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={s.scanRingLabel}>SCAN</Text>
        </Animated.View>

        <Text style={s.scanInstruction}>No makeup · Natural light</Text>
        <TouchableOpacity
          style={s.ctaButton}
          onPress={() => {
            if (scanningRef.current) return;
            scanningRef.current = true;
            onStart();
            setTimeout(() => { scanningRef.current = false; }, 3000);
          }}
          activeOpacity={0.8}
        >
          <Text style={s.ctaText}>Scan your face</Text>
        </TouchableOpacity>
        <Text style={s.privacyNote}>Photo deleted after analysis · Never stored</Text>
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
        <StatusBar style="dark" />
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
      <StatusBar style="dark" />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
      <View style={[s.overlay, { top: 0, left: 0, right: 0, height: OVAL_TOP }]} />
      <View style={[s.overlay, { top: OVAL_TOP + OVAL_H, left: 0, right: 0, bottom: 0 }]} />
      <View style={[s.overlay, { top: OVAL_TOP, left: 0, width: OVAL_LEFT, height: OVAL_H }]} />
      <View style={[s.overlay, { top: OVAL_TOP, left: OVAL_LEFT + OVAL_W, right: 0, height: OVAL_H }]} />
      <View style={[s.ovalGuide, { top: OVAL_TOP, left: OVAL_LEFT, width: OVAL_W, height: OVAL_H }]} />
      <View style={s.cameraHintWrap}>
        <Text style={s.cameraHint}>Centre your face · Stay still</Text>
      </View>
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
      <StatusBar style="dark" />
      <View style={s.processingBox}>
        <Text style={s.brand}>Lumé</Text>
        <ActivityIndicator color={Colors.accent} size="large" style={{ marginVertical: Spacing.xl }} />
        <Text style={s.processingStep}>{step}</Text>
        <Text style={s.processingNote}>Your photo is deleted after analysis</Text>
      </View>
    </SafeAreaView>
  );
}

// ─── OBSERVATION ──────────────────────────────────────────────────────────────
function ObservationScreen({
  scan,
  gender,
  userId,
  onContinue,
  recsLoading,
  recsError,
  onRescanFeedback,
}: {
  scan:             Scan;
  gender:           string;
  userId:           string;
  onContinue:       () => void;
  recsLoading:      boolean;
  recsError:        boolean;
  onRescanFeedback: (feedback: RescanFeedback) => void;
}) {
  const insets   = useSafeAreaInsets();
  const concerns = (scan.skin_concerns ?? []) as string[];

  const hasOiliness          = concerns.includes('oiliness') || scan.skin_type === 'oily';
  const hasAcne              = concerns.includes('acne');
  const hasDarkCircles       = concerns.includes('dark_circles') || scan.undereye === 'dark_circles';
  const hasHyperpigmentation = concerns.includes('hyperpigmentation') || concerns.includes('uneven_texture');
  const hasDryness           = concerns.includes('dryness') || concerns.includes('dehydration');

  const [hasPreviousDelta, setHasPreviousDelta] = useState(false);
  // Rescan feedback inputs — populated once we know this is a 2nd+ scan.
  const [isRescan,       setIsRescan]       = useState(false);
  const [primaryConcern, setPrimaryConcern] = useState<string | null>(null);
  const [adherencePct,   setAdherencePct]   = useState<number | null>(null);

  useEffect(() => {
    if (!scan.id || scan.id.startsWith('local_')) return;
    (async () => {
      const { count } = await supabase
        .from('scan_deltas')
        .select('id', { count: 'exact', head: true })
        .eq('to_scan_id', scan.id!);
      setHasPreviousDelta((count ?? 0) > 0);
    })();
  }, [scan.id]);

  // Detect rescan + gather inputs for RescanFeedbackFlow.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      // Previous scan's first concern (primary) for Q1.
      const { data: prevScans } = await supabase
        .from('scans')
        .select('id, skin_concerns, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(2);

      if (cancelled) return;
      const prev = (prevScans ?? []).find(r => r.id !== scan.id);
      if (!prev) return;
      setIsRescan(true);
      const concernsArr = (prev.skin_concerns as string[] | null) ?? [];
      setPrimaryConcern(concernsArr[0] ?? null);

      // 30-day adherence % for Q2 gating.
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      const fromISO = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
      const { data: checkinRows } = await supabase
        .from('routine_checkins')
        .select('completed_at, superseded')
        .eq('user_id', userId)
        .eq('superseded', false)
        .gte('date', fromISO);
      if (cancelled) return;
      const rows = (checkinRows ?? []) as Array<{ completed_at: string | null }>;
      if (rows.length === 0) {
        setAdherencePct(null);
      } else {
        const done = rows.filter(r => r.completed_at !== null).length;
        setAdherencePct(Math.round((done / rows.length) * 100));
      }
    })();
    return () => { cancelled = true; };
  }, [userId, scan.id]);

  const concernPills = concerns.map(c => ({ label: c.replace(/_/g, ' ') }));

  const healthyPills = [
    scan.face_shape ? { label: `${scan.face_shape} face` } : null,
    scan.skin_type && !['oily', 'dry', 'sensitive'].includes(scan.skin_type)
      ? { label: `${scan.skin_type} skin` }
      : null,
  ].filter((p): p is { label: string } => p !== null);

  return (
    <View style={rs.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[rs.content, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={rs.header}>
          <Text style={rs.title}>Your skin</Text>
          <Text style={rs.date}>
            {new Date().toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </Text>
        </View>

        {/* Face zone map */}
        <View style={rs.mapCard}>
          <Svg width="180" height="210" viewBox="0 0 100 120">
            {/* Face outline */}
            <Ellipse cx="50" cy="62" rx="35" ry="46"
              fill="none" stroke={Colors.surface2} strokeWidth="1.5" />
            {/* Hairline */}
            <Path d="M20 38 Q50 18 80 38"
              fill="none" stroke={Colors.surface2} strokeWidth="1" />

            {/* T-zone overlay — oiliness / acne */}
            {(hasOiliness || hasAcne) && (
              <>
                <Ellipse cx="50" cy="36" rx="16" ry="10"
                  fill={Colors.accent} fillOpacity="0.12"
                  stroke={Colors.accent} strokeWidth="0.5" strokeOpacity="0.4" />
                <Ellipse cx="50" cy="60" rx="6" ry="10"
                  fill={Colors.accent} fillOpacity="0.08" />
                <Circle cx="50" cy="28" r="4"
                  fill={Colors.accent} fillOpacity="0.7" />
              </>
            )}

            {/* Under-eye — dark circles */}
            {hasDarkCircles && (
              <>
                <Ellipse cx="33" cy="56" rx="9" ry="4"
                  fill="#6B8CAE" fillOpacity="0.2"
                  stroke="#6B8CAE" strokeWidth="0.5" strokeOpacity="0.6" />
                <Ellipse cx="67" cy="56" rx="9" ry="4"
                  fill="#6B8CAE" fillOpacity="0.2"
                  stroke="#6B8CAE" strokeWidth="0.5" strokeOpacity="0.6" />
                <Circle cx="33" cy="56" r="3" fill="#6B8CAE" fillOpacity="0.7" />
                <Circle cx="67" cy="56" r="3" fill="#6B8CAE" fillOpacity="0.7" />
              </>
            )}

            {/* Cheeks — hyperpigmentation */}
            {hasHyperpigmentation && (
              <>
                <Ellipse cx="22" cy="68" rx="10" ry="8"
                  fill={Colors.accent} fillOpacity="0.15"
                  stroke={Colors.accent} strokeWidth="0.5" strokeOpacity="0.4" />
                <Ellipse cx="78" cy="68" rx="10" ry="8"
                  fill={Colors.accent} fillOpacity="0.15"
                  stroke={Colors.accent} strokeWidth="0.5" strokeOpacity="0.4" />
              </>
            )}

            {/* Cheeks — healthy (when no concern) */}
            {!hasHyperpigmentation && (
              <>
                <Ellipse cx="22" cy="68" rx="10" ry="8"
                  fill="#3A6B3A" fillOpacity="0.12"
                  stroke="#3A6B3A" strokeWidth="0.5" strokeOpacity="0.35" />
                <Ellipse cx="78" cy="68" rx="10" ry="8"
                  fill="#3A6B3A" fillOpacity="0.12"
                  stroke="#3A6B3A" strokeWidth="0.5" strokeOpacity="0.35" />
              </>
            )}

            {/* Eyes */}
            <Ellipse cx="33" cy="52" rx="9" ry="4"
              fill="none" stroke="#444" strokeWidth="0.8" />
            <Ellipse cx="67" cy="52" rx="9" ry="4"
              fill="none" stroke="#444" strokeWidth="0.8" />
            <Circle cx="33" cy="52" r="2" fill="#333" />
            <Circle cx="67" cy="52" r="2" fill="#333" />

            {/* Nose */}
            <Path d="M46 62 L44 76 Q50 79 56 76 L54 62"
              fill="none" stroke="#333" strokeWidth="0.8" />

            {/* Mouth */}
            <Path d="M37 90 Q50 98 63 90"
              fill="none" stroke="#444" strokeWidth="0.8" />
          </Svg>

          {/* Legend */}
          <View style={rs.legend}>
            <View style={rs.legendItem}>
              <View style={[rs.legendDot, { backgroundColor: Colors.accent }]} />
              <Text style={rs.legendText}>Concern area</Text>
            </View>
            {hasDarkCircles && (
              <View style={rs.legendItem}>
                <View style={[rs.legendDot, { backgroundColor: '#6B8CAE' }]} />
                <Text style={rs.legendText}>Dark circles</Text>
              </View>
            )}
            <View style={rs.legendItem}>
              <View style={[rs.legendDot, { backgroundColor: '#3A6B3A' }]} />
              <Text style={rs.legendText}>Healthy</Text>
            </View>
          </View>
        </View>

        {/* Gemini narrative summary */}
        <View style={rs.summaryCard}>
          <Text style={rs.summaryLabel}>WHAT WE SEE</Text>
          <Text style={rs.summaryText}>
            {firstSentence(scan.recommendations?.skin?.advice) || scan.recommendations?.skin?.summary || 'Analysis complete.'}
          </Text>
        </View>

        {/* Concern + healthy pills */}
        <View style={rs.pillsRow}>
          {concernPills.map((p, i) => (
            <View key={i} style={rs.pillConcern}>
              <Text style={rs.pillConcernText}>{p.label}</Text>
            </View>
          ))}
          {healthyPills.map((p, i) => (
            <View key={i} style={rs.pillHealthy}>
              <Text style={rs.pillHealthyText}>{p.label}</Text>
            </View>
          ))}
        </View>

        {/* Delta card — only if previous scan delta exists */}
        {hasPreviousDelta && (
          <View style={rs.deltaCard}>
            <Text style={rs.summaryLabel}>SINCE LAST SCAN</Text>
          </View>
        )}

        {/* Dead-time question — asks beard_goal while phase 2 runs in bg */}
        {recsLoading && userId ? (
          <DeadTimeQuestionCard
            userId={userId}
            beardDensity={scan.beard_density ?? null}
            gender={gender}
          />
        ) : null}

        {/* Rescan feedback — only on 2nd+ scans, only while phase 2 runs */}
        {recsLoading && userId && isRescan ? (
          <RescanFeedbackFlow
            userId={userId}
            primaryConcern={primaryConcern}
            adherencePct={adherencePct}
            onComplete={onRescanFeedback}
          />
        ) : null}

        {/* CTA */}
        {recsLoading ? (
          <View style={rs.ctaLoading}>
            <ActivityIndicator size="small" color={Colors.card} />
            <Text style={rs.ctaLoadingText}>Building your plan…</Text>
          </View>
        ) : recsError ? (
          <TouchableOpacity style={rs.ctaError} onPress={onContinue} activeOpacity={0.85}>
            <Text style={rs.ctaText}>Continue anyway →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={rs.cta} onPress={onContinue} activeOpacity={0.85}>
            <Text style={rs.ctaText}>See your care plan →</Text>
          </TouchableOpacity>
        )}

        {/* Privacy note */}
        <Text style={rs.privacyNote}>Your photo was deleted after analysis</Text>

      </ScrollView>
    </View>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function ScanScreen() {
  const {
    phase, processingStep, result, error, recsLoading, recsError,
    showHairProfile, submitHairProfile,
    isRescanResult, submitRescanFeedback,
    openCamera, reset, processPhoto, hydratePendingObservation,
  } = useScan();
  const router = useRouter();
  const [gender,           setGender]           = useState<string>('man');
  const [userId,           setUserId]           = useState<string>('');
  // True when we should collect the hair profile during the next scan's
  // phase-1 vision call — i.e., the user has never saved one yet.
  const [needsHairProfile, setNeedsHairProfile] = useState(false);

  // Load gender + hair-profile status whenever the tab comes into focus. Also
  // picks up a scan finalized by the confirm-traits flow so we land on
  // ObservationScreen instead of the home screen.
  useFocusEffect(
    useCallback(() => {
      const loadProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);
        const { data: profile } = await supabase
          .from('users')
          .select('gender, hair_profile')
          .eq('id', user.id)
          .single();
        if (profile?.gender) setGender(profile.gender as string);
        const needs = !profile?.hair_profile;
        console.log('[scan-diag] focus loadProfile — gender:', profile?.gender,
          '· hair_profile:', profile?.hair_profile,
          '· needsHairProfile→', needs);
        setNeedsHairProfile(needs);
      };
      loadProfile();
      hydratePendingObservation();
    }, [hydratePendingObservation]),
  );

  const navigateToRecs = () => {
    if (!result) return;
    if (result.id?.startsWith('local_')) {
      router.push({ pathname: '/recommendations', params: { scanJson: JSON.stringify(result) } });
      return;
    }
    // Rescan (2nd+ scan): route to the delta view instead of the prescription.
    if (isRescanResult) {
      router.push({ pathname: '/scan-delta' as never, params: { to_scan_id: result.id } });
      return;
    }
    router.push({ pathname: '/recommendations-view', params: { scanId: result.id } });
  };

  const handleCapture = useCallback(
    (uri: string) => {
      console.log('[scan-diag] handleCapture — gender:', gender,
        '· needsHairProfile:', needsHairProfile);
      return processPhoto(uri, gender, 'full_face', needsHairProfile);
    },
    [processPhoto, gender, needsHairProfile],
  );

  const handleHairProfileComplete = useCallback(
    (profile: HairProfile) => {
      submitHairProfile(profile);
      // Optimistic — so the next scan doesn't re-prompt even before the DB write lands.
      setNeedsHairProfile(false);
    },
    [submitHairProfile],
  );

  if (phase === 'camera')     return <CameraScreen onCapture={handleCapture} onCancel={reset} error={error} />;
  if (phase === 'processing') {
    console.log('[scan-diag] processing branch — showHairProfile:', showHairProfile,
      '· processingStep:', processingStep);
    if (showHairProfile) {
      console.log('[scan-diag] mounting HairProfileDuringVision');
      return (
        <HairProfileDuringVision
          gender={gender}
          visionStep={processingStep || 'Analysing your skin…'}
          onComplete={handleHairProfileComplete}
        />
      );
    }
    return <ProcessingScreen step={processingStep} />;
  }
  if (phase === 'result' && result) return <ObservationScreen scan={result} gender={gender} userId={userId} onContinue={navigateToRecs} recsLoading={recsLoading} recsError={recsError} onRescanFeedback={submitRescanFeedback} />;
  return <HomeScreen onStart={openCamera} />;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background },

  // Home
  homeInner:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  brand:         { fontFamily: Typography.serif, fontSize: 28, color: Colors.text, letterSpacing: 2 },
  scanRing:      { width: 220, height: 220, borderRadius: 110, borderWidth: 2, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg, marginTop: Spacing.xl },
  scanRingLabel:    { fontSize: 10, color: Colors.accent, letterSpacing: 1.5, textTransform: 'uppercase' },
  scanInstruction:  { fontSize: 12, color: Colors.text2, textAlign: 'center', letterSpacing: 0.3, marginTop: 8, marginBottom: 24 },

  // Shared
  ctaButton:    { backgroundColor: Colors.accent, borderRadius: Radius.input, paddingVertical: Spacing.md, alignItems: 'center', width: '100%', marginBottom: Spacing.md },
  ctaText:      { fontSize: 14, fontWeight: '600', color: Colors.textOnAccent, letterSpacing: 0.3 },
  cancelLink:   { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelLinkText:{ fontSize: 13, color: Colors.text },

  // Camera UI — high-contrast overlays on live video feed, intentionally not themed
  overlay:        { position: 'absolute', backgroundColor: Colors.overlayMedium },
  ovalGuide:      { position: 'absolute', borderRadius: 999, borderWidth: 2, borderColor: Colors.accent },
  cameraHintWrap: { position: 'absolute', bottom: 120, left: 0, right: 0, alignItems: 'center' },
  cameraHint:     { fontSize: 13, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3, textAlign: 'center' },
  cameraBottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingBottom: 48, paddingTop: 24,
    backgroundColor: 'rgba(10,10,10,0.6)',
  },
  cameraTextBtn:      { width: 72, alignItems: 'flex-start' },
  cameraTextBtnLabel: { color: Colors.accent, fontSize: 15, fontWeight: '500' },
  captureOuter: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center', justifyContent: 'center',
  },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.card },
  cameraIconBtn:  { width: 72, alignItems: 'flex-end' },
  flipIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  flipIconText: { color: Colors.textOnAccent, fontSize: 22, fontWeight: '300' },
  errorBanner:  { position: 'absolute', bottom: 160, left: Spacing.lg, right: Spacing.lg, backgroundColor: Colors.danger, borderRadius: Radius.input, padding: Spacing.md },
  errorText:    { color: Colors.text, fontSize: 13, textAlign: 'center' },
  permissionBox:{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  permissionTitle:{ fontFamily: Typography.serif, fontSize: 22, color: Colors.text, marginBottom: Spacing.md, textAlign: 'center' },
  permissionBody: { fontSize: 13, color: Colors.text, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xl },

  // Processing
  processingBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  processingStep: { fontSize: 13, color: Colors.text, textAlign: 'center', marginBottom: Spacing.sm },
  processingNote: { fontSize: 11, color: Colors.text2, textAlign: 'center', marginTop: 6 },

  // Privacy
  privacyNote: { fontSize: 10, color: Colors.text3, textAlign: 'center', marginTop: 8 },

});

// ─── OBSERVATION STYLES ───────────────────────────────────────────────────────
const rs = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom:     Spacing.xxxl,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingTop:     Spacing.lg,
    marginBottom:   Spacing.lg,
  },
  title: {
    fontFamily: Typography.serif,
    fontSize:   22,
    color:      Colors.text,
  },
  date: {
    fontSize: 12,
    color:    Colors.text2,
  },
  mapCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.lg,
    alignItems:      'center',
    marginBottom:    Spacing.md,
    minHeight:       260,
  },
  legend: {
    flexDirection:  'row',
    gap:            12,
    marginTop:      Spacing.md,
    flexWrap:       'wrap',
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  legendDot: {
    width:        7,
    height:       7,
    borderRadius: 3.5,
    opacity:      0.85,
  },
  legendText: {
    fontSize: 11,
    color:    Colors.text2,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  summaryLabel: {
    fontSize:      9,
    color:         Colors.text2,
    letterSpacing: 1.5,
    marginBottom:  Spacing.xs,
  },
  summaryText: {
    fontSize:   14,
    color:      Colors.text,
    lineHeight: 22,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
    marginBottom:  Spacing.lg,
  },
  pillConcern: {
    backgroundColor:  Colors.surface2,
    borderRadius:     Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical:  4,
  },
  pillConcernText: {
    fontSize:      11,
    color:         Colors.accent,
    textTransform: 'capitalize',
  },
  pillHealthy: {
    backgroundColor:  Colors.successPillBg,
    borderRadius:     Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical:  4,
  },
  pillHealthyText: {
    fontSize:      11,
    color:         Colors.successPillText,
    textTransform: 'capitalize',
  },
  deltaCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    marginBottom:    Spacing.md,
  },
  cta: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.input,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginBottom:    Spacing.sm,
  },
  ctaLoading: {
    backgroundColor: Colors.text2,
    borderRadius:    Radius.input,
    paddingVertical: Spacing.md,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    marginBottom:    Spacing.sm,
  },
  ctaLoadingText: {
    fontSize:   15,
    color:      Colors.card,
    fontWeight: '500',
  },
  ctaError: {
    backgroundColor: Colors.accent,
    borderRadius:    Radius.input,
    paddingVertical: Spacing.md,
    alignItems:      'center',
    marginBottom:    Spacing.sm,
  },
  ctaText: {
    fontSize:   15,
    fontWeight: '600',
    color:      Colors.background,
  },
  privacyNote: {
    fontSize:   11,
    color:      Colors.text3,
    textAlign:  'center',
    marginTop:  Spacing.xs,
  },
});
