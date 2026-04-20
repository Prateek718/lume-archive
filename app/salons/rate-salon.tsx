// Rate a salon — search/select → new form → success.

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { MOCK_SALONS, type Salon } from '../../constants/mockSalons';
import { fetchNearbySalons } from '../../services/locationService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

type Step = 'search' | 'form' | 'success';

const SERVICE_GROUPS = [
  {
    label: 'HAIR',
    items: ['Haircut', 'Hair colour', 'Blowout', 'Hair treatment', 'Keratin', 'Extensions'],
  },
  {
    label: 'SKIN',
    items: ['Facial', 'Cleanup', 'Waxing', 'Threading', 'Bleach'],
  },
  {
    label: 'NAILS & MAKEUP',
    items: ['Manicure', 'Pedicure', 'Nail art', 'Bridal makeup', 'Party makeup'],
  },
] as const;

const DETAIL_RATINGS = [
  { key: 'rating_staff',    label: 'Staff skill' },
  { key: 'rating_hygiene',  label: 'Hygiene' },
  { key: 'rating_value',    label: 'Value for money' },
  { key: 'rating_ambience', label: 'Ambience' },
] as const;

type DetailKey = typeof DETAIL_RATINGS[number]['key'];

// ── Star components ───────────────────────────────────────────────────────────

function StarsLarge({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={{ fontSize: 32, color: n <= value ? Colors.accent : Colors.border, lineHeight: 40 }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function StarsSmall({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={{ fontSize: 22, color: n <= value ? Colors.accent : Colors.border, lineHeight: 28 }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RateSalonScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ placeId?: string; name?: string; address?: string }>();

  const [step, setStep]         = useState<Step>(params.placeId ? 'form' : 'search');
  const [selected, setSelected] = useState<Salon | null>(
    params.placeId
      ? {
          id:          params.placeId,
          name:        params.name ?? '',
          address:     params.address ?? '',
          city:        '',
          latitude:    0,
          longitude:   0,
          rating:      0,
          reviewCount: 0,
          services:    [],
          priceRange:  '',
        }
      : null,
  );

  // Search state
  const [query,       setQuery]       = useState('');
  const [salons,      setSalons]      = useState<Salon[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Form state
  const [overall,          setOverall]          = useState(0);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [detailRatings,    setDetailRatings]    = useState<Record<DetailKey, number>>({
    rating_staff: 0, rating_hygiene: 0, rating_value: 0, rating_ambience: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  // Load nearby salons for the search list
  useEffect(() => {
    if (step !== 'search') return;
    const load = async () => {
      setLoadingList(true);
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos     = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
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
    ? salons.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.address.toLowerCase().includes(query.toLowerCase()),
      )
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

  const toggleService = useCallback((item: string) => {
    setSelectedServices(prev => {
      const next = new Set(prev);
      if (next.has(item)) { next.delete(item); } else { next.add(item); }
      return next;
    });
  }, []);

  const setDetailRating = useCallback((key: DetailKey, value: number) => {
    setDetailRatings(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selected) return;
    if (overall === 0) {
      Alert.alert('Rating required', 'Please give an overall star rating.');
      return;
    }
    if (selectedServices.size === 0) {
      Alert.alert('Service required', 'Please select at least one service you got done.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Not signed in', 'Please sign in to submit a rating.');
        setSubmitting(false);
        return;
      }

      await supabase.from('salon_ratings').insert({
        user_id:         user.id,
        google_place_id: selected.id,
        salon_name:      selected.name,
        rating_overall:  overall,
        services_done:   Array.from(selectedServices),
        rating_staff:    detailRatings.rating_staff    || null,
        rating_hygiene:  detailRatings.rating_hygiene  || null,
        rating_value:    detailRatings.rating_value    || null,
        rating_ambience: detailRatings.rating_ambience || null,
      });
      setStep('success');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [selected, overall, selectedServices, detailRatings]);

  const canSubmit = overall > 0 && selectedServices.size > 0;

  // ── Search ────────────────────────────────────────────────────────────────
  if (step === 'search') {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <BackBar title="Rate a Salon" />
        <View style={s.searchBox}>
          <TextInput
            style={s.searchInput}
            placeholder="Search by name or area…"
            placeholderTextColor={Colors.text3}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="words"
            autoFocus
            returnKeyType="search"
          />
        </View>
        {loadingList ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
        ) : (
          <ScrollView contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
            {filtered.map(salon => (
              <TouchableOpacity
                key={salon.id}
                style={s.listRow}
                onPress={() => selectSalon(salon)}
                activeOpacity={0.8}
              >
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
        <StatusBar style="dark" />
        <Text style={s.successCheck}>✓</Text>
        <Text style={s.successTitle}>Rating submitted</Text>
        <Text style={s.successBody}>
          Thanks for helping the Lumé community find great salons.
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
      <StatusBar style="dark" />
      <BackBar
        title="Rate a Salon"
        onBack={() => (params.placeId ? router.back() : setStep('search'))}
      />

      <ScrollView
        contentContainerStyle={s.formContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Salon header */}
        <View style={s.salonHeader}>
          <Text style={s.salonHeaderName}>{selected?.name}</Text>
          {!!selected?.address && (
            <Text style={s.salonHeaderAddr}>{selected.address}</Text>
          )}
        </View>

        {/* ── Section 1: Overall experience ── */}
        <Text style={s.sectionLabel}>OVERALL EXPERIENCE</Text>
        <View style={s.overallBox}>
          <StarsLarge value={overall} onChange={setOverall} />
        </View>

        {/* ── Section 2: Services done ── */}
        <Text style={s.sectionLabel}>WHAT DID YOU GET DONE?</Text>
        <Text style={s.sectionSub}>Select all that apply</Text>

        {SERVICE_GROUPS.map(group => (
          <View key={group.label} style={s.serviceGroup}>
            <Text style={s.serviceGroupLabel}>{group.label}</Text>
            <View style={s.pillsWrap}>
              {group.items.map(item => {
                const active = selectedServices.has(item);
                return (
                  <TouchableOpacity
                    key={item}
                    style={[s.pill, active && s.pillActive]}
                    onPress={() => toggleService(item)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.pillText, active && s.pillTextActive]}>{item}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {/* ── Section 3: Detail ratings ── */}
        <Text style={s.sectionLabel}>RATE THE DETAILS</Text>
        <View style={s.detailCard}>
          {DETAIL_RATINGS.map(({ key, label }, i) => (
            <View
              key={key}
              style={[s.detailRow, i < DETAIL_RATINGS.length - 1 && s.detailRowBorder]}
            >
              <Text style={s.detailLabel}>{label}</Text>
              <StarsSmall
                value={detailRatings[key]}
                onChange={v => setDetailRating(key, v)}
              />
            </View>
          ))}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, (!canSubmit || submitting) && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color={Colors.textOnAccent} />
            : <Text style={s.submitBtnText}>Submit rating</Text>
          }
        </TouchableOpacity>

        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </View>
  );
}

// ── Back bar ──────────────────────────────────────────────────────────────────
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
  arrow: { fontSize: 28, color: Colors.text, lineHeight: 32 },
  title: { fontFamily: Typography.serif, fontSize: 22, color: Colors.text },
});

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  // Search
  searchBox:    { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  searchInput:  { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: 15, color: Colors.text },
  listContent:  { paddingHorizontal: Spacing.lg },
  listRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.xs },
  listName:     { fontSize: 15, color: Colors.text, fontWeight: '600', marginBottom: 2 },
  listAddr:     { fontSize: 13, color: Colors.text2 },
  listArrow:    { fontSize: 22, color: Colors.text3, lineHeight: 26 },
  addManualRow: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  addManualText:{ fontSize: 13, color: Colors.accent },
  emptyHint:    { textAlign: 'center', color: Colors.text2, fontSize: 13, marginTop: Spacing.xl },

  // Form
  formContent:     { paddingHorizontal: Spacing.lg },
  salonHeader:     { paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing.lg },
  salonHeaderName: { fontFamily: Typography.serif, fontSize: 22, color: Colors.text },
  salonHeaderAddr: { fontSize: 13, color: Colors.text2, marginTop: 4 },

  sectionLabel: { fontSize: 10, color: Colors.text, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.xs, marginTop: Spacing.xl },
  sectionSub:   { fontSize: 13, color: Colors.text2, marginBottom: Spacing.md },

  overallBox: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.xl,
    alignItems:      'center',
  },

  // Service groups
  serviceGroup:      { marginBottom: Spacing.lg },
  serviceGroupLabel: { fontSize: 10, color: Colors.text, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.sm },
  pillsWrap:         { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  pill: {
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
    borderRadius:    999,
    paddingHorizontal: 14,
    paddingVertical:   7,
  },
  pillActive: {
    backgroundColor: Colors.accentTintMedium,
    borderColor:     Colors.accentTintBorderStrong,
  },
  pillText:       { fontSize: 13, color: Colors.text },

  pillTextActive: { color: Colors.accent, fontWeight: '600' },

  // Detail ratings
  detailCard:      { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  detailRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailLabel:     { fontSize: 15, color: Colors.text },

  // Submit
  submitBtn:         { backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.xl },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText:     { fontSize: 14, fontWeight: '600', color: Colors.textOnAccent },

  // Success
  successScreen: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  successCheck:  { fontSize: 32, color: Colors.text, marginBottom: Spacing.lg },
  successTitle:  { fontFamily: Typography.serif, fontSize: 22, color: Colors.text, marginBottom: Spacing.sm },
  successBody:   { fontSize: 13, color: Colors.text2, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xxl },
  successBtn:    { backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl, alignItems: 'center' },
  successBtnText:{ fontSize: 14, fontWeight: '600', color: Colors.textOnAccent },
});
