// Rate a salon — Step 1: search/select, Step 2: review form, Step 3: success.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { GUEST_PROFILE_KEY } from '../_layout';
import { MOCK_SALONS, type Salon } from '../../constants/mockSalons';
import { fetchNearbySalons } from '../../services/locationService';
import { StarRating } from '../../components/ui/StarRating';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

type Step = 'search' | 'form' | 'success';

const MEN_TIERS = [
  { key: 'under_200',  label: 'Under ₹200' },
  { key: '200_500',   label: '₹200 – ₹500' },
  { key: '500_1000',  label: '₹500 – ₹1,000' },
  { key: 'above_1000',label: 'Above ₹1,000' },
];
const WOMEN_TIERS = [
  { key: 'under_600',   label: 'Under ₹600' },
  { key: '600_1000',   label: '₹600 – ₹1,000' },
  { key: '1000_1500',  label: '₹1,000 – ₹1,500' },
  { key: 'above_1500', label: 'Above ₹1,500' },
];

const CAT_LABELS = [
  { key: 'ambience',     label: 'Ambience' },
  { key: 'priceValue',   label: 'Price for value' },
  { key: 'staff',        label: 'Staff behaviour' },
  { key: 'hygiene',      label: 'Hygiene' },
  { key: 'stylistSkill', label: 'Stylist skill' },
] as const;

type CatKey = typeof CAT_LABELS[number]['key'];

export default function RateSalonScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ placeId?: string; name?: string; address?: string }>();

  const [isGuest,  setIsGuest]  = useState(true);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsGuest(!user);
      setChecking(false);
    });
  }, []);

  const [step, setStep]           = useState<Step>(params.placeId ? 'form' : 'search');
  const [selected, setSelected]   = useState<Salon | null>(
    params.placeId
      ? { id: params.placeId, name: params.name ?? '', address: params.address ?? '',
          city: '', latitude: 0, longitude: 0, rating: 0, reviewCount: 0, services: [], priceRange: '' }
      : null
  );

  // Search state
  const [query, setQuery]       = useState('');
  const [salons, setSalons]     = useState<Salon[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Form state
  const [overall,  setOverall]  = useState(0);
  const [cats, setCats]         = useState<Record<CatKey, number>>({
    ambience: 0, priceValue: 0, staff: 0, hygiene: 0, stylistSkill: 0,
  });
  const [priceTier, setPriceTier] = useState<string | null>(null);
  const [gender, setGender]       = useState('man');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(GUEST_PROFILE_KEY).then(raw => {
      if (raw) { const p = JSON.parse(raw) as { gender?: string }; if (p.gender) setGender(p.gender); }
    });
  }, []);

  // Load nearby salons for the search list
  useEffect(() => {
    if (step !== 'search') return;
    const load = async () => {
      setLoadingList(true);
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
          const results = await fetchNearbySalons(pos.coords.latitude, pos.coords.longitude);
          setSalons(results.length > 0 ? results : MOCK_SALONS);
        } else {
          setSalons(MOCK_SALONS);
        }
      } catch {
        setSalons(MOCK_SALONS);
      }
      setLoadingList(false);
    };
    load();
  }, [step]);

  const filtered = query.trim()
    ? salons.filter(s => s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.address.toLowerCase().includes(query.toLowerCase()))
    : salons;

  const selectSalon = useCallback((salon: Salon) => {
    setSelected(salon);
    setStep('form');
  }, []);

  const addManually = useCallback(() => {
    if (!query.trim()) return;
    const manual: Salon = {
      id:          `manual_${Date.now()}`,
      name:        query.trim(),
      address:     '',
      city:        '',
      latitude:    0,
      longitude:   0,
      rating:      0,
      reviewCount: 0,
      services:    [],
      priceRange:  '',
    };
    setSelected(manual);
    setStep('form');
  }, [query]);

  const handleSubmit = useCallback(async () => {
    if (!selected) return;
    if (overall === 0) {
      Alert.alert('Rating required', 'Please give an overall star rating before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) {
        Alert.alert('Not signed in', 'Please sign in to submit a rating.');
        setSubmitting(false);
        return;
      }

      const tierField = gender === 'woman' ? 'haircut_price_tier_women' : 'haircut_price_tier_men';
      await supabase.from('salon_ratings').insert({
        user_id:             userId,
        google_place_id:     selected.id,
        salon_name:          selected.name,
        rating_overall:      overall,
        rating_ambience:     cats.ambience      || null,
        rating_price_value:  cats.priceValue    || null,
        rating_staff:        cats.staff         || null,
        rating_hygiene:      cats.hygiene       || null,
        rating_stylist_skill:cats.stylistSkill  || null,
        [tierField]:         priceTier          || null,
      });
      setStep('success');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [selected, overall, cats, priceTier, gender]);

  const tiers = gender === 'woman' ? WOMEN_TIERS : MEN_TIERS;

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (checking) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center', paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <ActivityIndicator color={Colors.gold} size="large" />
      </View>
    );
  }

  if (isGuest) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <StatusBar style="light" />
        <Text style={{ fontFamily: Typography.serif, fontSize: 22, color: Colors.cream, marginBottom: 8, textAlign: 'center' }}>
          Sign in to rate salons
        </Text>
        <Text style={{ fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
          Your ratings help the Lumé community find great salons
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 }}
          onPress={() => router.push('/(auth)/signup')}
          activeOpacity={0.85}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.background }}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 16 }} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={{ fontSize: 14, color: Colors.textSecondary }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Search ────────────────────────────────────────────────────────────────
  if (step === 'search') {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <BackBar title="Rate a Salon" />
        <View style={s.searchBox}>
          <TextInput
            style={s.searchInput}
            placeholder="Search by name or area…"
            placeholderTextColor={Colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
            autoFocus
            returnKeyType="search"
          />
        </View>
        {loadingList ? (
          <ActivityIndicator color={Colors.gold} style={{ marginTop: Spacing.xl }} />
        ) : (
          <ScrollView contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
            {filtered.map(salon => (
              <TouchableOpacity key={salon.id} style={s.listRow} onPress={() => selectSalon(salon)} activeOpacity={0.8}>
                <View style={{ flex: 1 }}>
                  <Text style={s.listName} numberOfLines={1}>{salon.name}</Text>
                  <Text style={s.listAddr} numberOfLines={1}>{salon.address}</Text>
                </View>
                <Text style={s.listArrow}>›</Text>
              </TouchableOpacity>
            ))}
            {query.trim().length > 0 && (
              <TouchableOpacity style={s.addManualRow} onPress={addManually} activeOpacity={0.8}>
                <Text style={s.addManualText}>+ Add "{query.trim()}" as a new salon</Text>
              </TouchableOpacity>
            )}
            {filtered.length === 0 && !query.trim() && (
              <Text style={s.emptyHint}>Start typing to search for a salon.</Text>
            )}
          </ScrollView>
        )}
      </View>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <View style={[s.screen, s.successScreen, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <Text style={s.successCheck}>✓</Text>
        <Text style={s.successTitle}>Thank you!</Text>
        <Text style={s.successBody}>
          Your rating helps everyone find the best salons.
        </Text>
        <TouchableOpacity style={s.successBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={s.successBtnText}>Back to Salons</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <BackBar title="Rate a Salon" onBack={() => params.placeId ? router.back() : setStep('search')} />

      <ScrollView contentContainerStyle={s.formContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Salon header */}
        <View style={s.salonHeader}>
          <Text style={s.salonHeaderName}>{selected?.name}</Text>
          {!!selected?.address && <Text style={s.salonHeaderAddr}>{selected.address}</Text>}
        </View>

        {/* Overall rating */}
        <Text style={s.fieldLabel}>OVERALL RATING</Text>
        <View style={s.overallBox}>
          <StarRating value={overall} onChange={setOverall} size="lg" />
          {overall > 0 && <Text style={s.overallNum}>{overall}.0</Text>}
        </View>

        {/* Category ratings */}
        <Text style={s.fieldLabel}>CATEGORIES</Text>
        <View style={s.catCard}>
          {CAT_LABELS.map(({ key, label }, i) => (
            <View key={key} style={[s.catRow, i < CAT_LABELS.length - 1 && s.catRowBorder]}>
              <Text style={s.catLabel}>{label}</Text>
              <StarRating value={cats[key]} onChange={v => setCats(prev => ({ ...prev, [key]: v }))} size="sm" />
            </View>
          ))}
        </View>

        {/* Haircut price */}
        <Text style={s.fieldLabel}>HAIRCUT PRICE</Text>
        <Text style={s.fieldSub}>How much does a basic haircut cost here?</Text>
        <View style={s.tiersCard}>
          {tiers.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[s.tierRow, priceTier === key && s.tierRowActive]}
              onPress={() => setPriceTier(prev => prev === key ? null : key)}
              activeOpacity={0.8}
            >
              <View style={[s.radio, priceTier === key && s.radioActive]}>
                {priceTier === key && <View style={s.radioDot} />}
              </View>
              <Text style={[s.tierLabel, priceTier === key && s.tierLabelActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, (overall === 0 || submitting) && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={overall === 0 || submitting}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color={Colors.background} />
            : <Text style={s.submitBtnText}>Submit rating</Text>
          }
        </TouchableOpacity>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

function BackBar({ title, onBack }: { title: string; onBack?: () => void }) {
  const router = useRouter();
  return (
    <View style={bb.row}>
      <TouchableOpacity onPress={onBack ?? (() => router.back())} style={bb.btn} activeOpacity={0.7}>
        <Text style={bb.arrow}>‹</Text>
      </TouchableOpacity>
      <Text style={bb.title}>{title}</Text>
      <View style={bb.btn} />
    </View>
  );
}
const bb = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  btn:   { width: 40, alignItems: 'center' },
  arrow: { fontSize: 28, color: Colors.gold, lineHeight: 32 },
  title: { fontFamily: Typography.serif, fontSize: Typography.size.lg, color: Colors.cream },
});

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  // Search
  searchBox:   { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  searchInput: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.input, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: Typography.size.md, color: Colors.cream },
  listContent: { paddingHorizontal: Spacing.lg },
  listRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.xs },
  listName:    { fontSize: Typography.size.md, color: Colors.cream, fontWeight: '600', marginBottom: 2 },
  listAddr:    { fontSize: Typography.size.sm, color: Colors.textSecondary },
  listArrow:   { fontSize: 22, color: Colors.textTertiary, lineHeight: 26 },
  addManualRow:{ backgroundColor: Colors.surface2, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  addManualText:{ fontSize: Typography.size.base, color: Colors.gold },
  emptyHint:   { textAlign: 'center', color: Colors.textTertiary, fontSize: Typography.size.base, marginTop: Spacing.xl },

  // Form
  formContent:  { paddingHorizontal: Spacing.lg },
  salonHeader:  { paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing.lg },
  salonHeaderName: { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.cream },
  salonHeaderAddr: { fontSize: Typography.size.base, color: Colors.textSecondary, marginTop: 4 },
  fieldLabel:   { fontSize: Typography.size.xs, color: Colors.gold, letterSpacing: 6, textTransform: 'uppercase', marginBottom: Spacing.sm, marginTop: Spacing.lg },
  fieldSub:     { fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: -Spacing.xs },
  overallBox:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg },
  overallNum:   { fontFamily: Typography.serif, fontSize: Typography.size.xxl, color: Colors.gold },
  catCard:      { backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  catRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  catRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  catLabel:     { fontSize: Typography.size.base, color: Colors.cream },
  tiersCard:    { backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  tierRow:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tierRowActive:{ backgroundColor: Colors.goldDim },
  radio:        { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  radioActive:  { borderColor: Colors.gold },
  radioDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.gold },
  tierLabel:    { fontSize: Typography.size.base, color: Colors.textSecondary },
  tierLabelActive:{ color: Colors.cream },
  submitBtn:        { backgroundColor: Colors.gold, borderRadius: Radius.input, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.xl },
  submitBtnDisabled:{ opacity: 0.4 },
  submitBtnText:    { fontSize: Typography.size.md, fontWeight: '600', color: Colors.background },

  // Success
  successScreen: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  successCheck:  { fontSize: 64, color: Colors.gold, marginBottom: Spacing.lg },
  successTitle:  { fontFamily: Typography.serif, fontSize: Typography.size.xxl, color: Colors.cream, marginBottom: Spacing.sm },
  successBody:   { fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xxl },
  successBtn:    { backgroundColor: Colors.gold, borderRadius: Radius.input, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl, alignItems: 'center' },
  successBtnText:{ fontSize: Typography.size.md, fontWeight: '600', color: Colors.background },
});
