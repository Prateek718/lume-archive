// Salon profile creation — 4-step flow + inline confirmation.

import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing } from '../../constants/theme';

// ── Service definitions ───────────────────────────────────────────────────────

const HAIR_SERVICES   = ['Haircut', 'Hair colour', 'Blowout', 'Hair treatment', 'Keratin', 'Extensions'] as const;
const SKIN_SERVICES   = ['Facial', 'Cleanup', 'Waxing', 'Threading', 'Bleach', 'Body waxing'] as const;
const NAILS_SERVICES  = ['Manicure', 'Pedicure', 'Nail art', 'Bridal makeup', 'Party makeup', 'Mehendi'] as const;

const PRICE_RANGES = [
  { key: 'budget',  label: 'Budget',    sub: 'Affordable pricing' },
  { key: 'mid',     label: 'Mid-range', sub: 'Moderate pricing' },
  { key: 'premium', label: 'Premium',   sub: 'High-end pricing' },
] as const;

type PriceKey = typeof PRICE_RANGES[number]['key'];

// ── Form data type ────────────────────────────────────────────────────────────

interface FormData {
  salonName:       string;
  ownerName:       string;
  phone:           string;
  city:            string;
  servicesHair:    string[];
  servicesSkin:    string[];
  servicesNails:   string[];
  priceRange:      PriceKey | null;
  bookingInterest: boolean | null;
}

// ── Helper components ─────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={si.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[si.line, i < current && si.lineActive]}
        />
      ))}
    </View>
  );
}
const si = StyleSheet.create({
  row:        { flexDirection: 'row', gap: 6, marginBottom: Spacing.lg },
  line:       { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#2A2420' },
  lineActive: { backgroundColor: '#C9A84C' },
});

function ServicePillGroup({
  label,
  items,
  selected,
  onToggle,
}: {
  label:    string;
  items:    readonly string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <View style={pg.block}>
      <Text style={pg.groupLabel}>{label}</Text>
      <View style={pg.pillsWrap}>
        {items.map(item => {
          const active = selected.includes(item);
          return (
            <TouchableOpacity
              key={item}
              style={[pg.pill, active && pg.pillActive]}
              onPress={() => onToggle(item)}
              activeOpacity={0.75}
            >
              <Text style={[pg.pillText, active && pg.pillTextActive]}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const pg = StyleSheet.create({
  block:      { marginBottom: Spacing.lg },
  groupLabel: { fontSize: 10, color: '#8A7A6A', letterSpacing: 3, textTransform: 'uppercase', marginBottom: Spacing.sm },
  pillsWrap:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill:       { backgroundColor: '#1A1412', borderWidth: 1, borderColor: '#2A2420', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  pillActive: { backgroundColor: 'rgba(201,168,76,0.12)', borderColor: 'rgba(201,168,76,0.4)' },
  pillText:       { fontSize: 13, color: '#4A4540' },
  pillTextActive: { fontSize: 13, color: '#C9A84C', fontWeight: '600' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SalonProfileCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    google_place_id: string;
    name?:           string;
    city?:           string;
  }>();

  const [step,        setStep]        = useState(1);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [createdName, setCreatedName] = useState('');
  const [phoneError,  setPhoneError]  = useState(false);

  const [form, setForm] = useState<FormData>({
    salonName:       params.name    ?? '',
    ownerName:       '',
    phone:           '',
    city:            params.city    ?? '',
    servicesHair:    [],
    servicesSkin:    [],
    servicesNails:   [],
    priceRange:      null,
    bookingInterest: null,
  });

  const setField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleService = useCallback((
    field: 'servicesHair' | 'servicesSkin' | 'servicesNails',
    item:  string,
  ) => {
    setForm(prev => {
      const arr = prev[field] as string[];
      const next = arr.includes(item)
        ? arr.filter(s => s !== item)
        : [...arr, item];
      return { ...prev, [field]: next };
    });
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────────

  const canNext1 =
    form.salonName.trim().length > 0 &&
    form.ownerName.trim().length > 0 &&
    form.phone.length === 10 &&
    form.city.trim().length > 0;

  const canNext2 =
    form.servicesHair.length > 0 ||
    form.servicesSkin.length > 0 ||
    form.servicesNails.length > 0;

  const canNext3 = form.priceRange != null;
  const canNext4 = form.bookingInterest != null;

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!canNext4) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('salon_profiles').insert({
        google_place_id:       params.google_place_id,
        salon_name:            form.salonName.trim(),
        owner_name:            form.ownerName.trim(),
        phone:                 form.phone.trim(),
        city:                  form.city.trim(),
        services_hair:         form.servicesHair,
        services_skin:         form.servicesSkin,
        services_nails_makeup: form.servicesNails,
        price_range:           form.priceRange,
        booking_interest:      form.bookingInterest === true,
        created_by:            user?.id ?? null,
      });
      if (error) throw error;
      setCreatedName(form.salonName.trim());
      setSubmitted(true);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not create profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [form, params.google_place_id, canNext4]);

  // ── Confirmation screen ────────────────────────────────────────────────────

  if (submitted) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <View style={s.confirmBox}>
          <View style={s.confirmCheck}>
            <Text style={s.confirmCheckText}>✓</Text>
          </View>
          <Text style={s.confirmTitle}>Profile created</Text>
          <Text style={s.confirmSub}>
            {createdName} is now on Lumé. Customers can see your services and ratings.
          </Text>
          <TouchableOpacity
            style={s.confirmPrimaryBtn}
            activeOpacity={0.85}
            onPress={() => router.push({
              pathname: '/salons/salon-detail',
              params: {
                google_place_id: params.google_place_id,
                name:            createdName,
                address:         '',
                rating:          '0',
                distance:        '',
              },
            })}
          >
            <Text style={s.confirmPrimaryBtnText}>View your profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.confirmSecondaryBtn}
            activeOpacity={0.7}
            onPress={() => { router.back(); router.back(); }}
          >
            <Text style={s.confirmSecondaryBtnText}>Back to discover</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Back bar */}
      <View style={s.backBar}>
        <TouchableOpacity
          onPress={() => (step > 1 ? setStep(s => s - 1) : router.back())}
          style={s.backBtn}
          activeOpacity={0.7}
        >
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.stepCaption}>STEP {step} OF 4</Text>
        <View style={s.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <StepIndicator current={step} total={4} />

          {/* ── Step 1: Basic info ── */}
          {step === 1 && (
            <>
              <Text style={s.stepTitle}>Basic info</Text>
              <Text style={s.stepSub}>Tell us about your salon</Text>

              <Text style={s.fieldLabel}>SALON NAME</Text>
              <TextInput
                style={s.underlineInput}
                value={form.salonName}
                onChangeText={v => setField('salonName', v)}
                placeholder="e.g. Naturals Salon"
                placeholderTextColor="#4A4540"
                autoCapitalize="words"
              />

              <Text style={s.fieldLabel}>OWNER / MANAGER NAME</Text>
              <TextInput
                style={s.underlineInput}
                value={form.ownerName}
                onChangeText={v => setField('ownerName', v)}
                placeholder="Your name"
                placeholderTextColor="#4A4540"
                autoCapitalize="words"
              />

              <Text style={s.fieldLabel}>PHONE NUMBER</Text>
              <View style={s.phoneRow}>
                <Text style={s.phonePrefix}>+91</Text>
                <TextInput
                  style={[s.underlineInput, s.phoneInput]}
                  value={form.phone}
                  onChangeText={v => {
                    const cleaned = v.replace(/[^0-9]/g, '').slice(0, 10);
                    setField('phone', cleaned);
                    if (phoneError && cleaned.length === 10) setPhoneError(false);
                  }}
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#4A4540"
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>
              {phoneError && (
                <Text style={s.phoneError}>Please enter a valid 10-digit mobile number</Text>
              )}

              <Text style={s.fieldLabel}>CITY</Text>
              <TextInput
                style={s.underlineInput}
                value={form.city}
                onChangeText={v => setField('city', v)}
                placeholder="e.g. Bangalore"
                placeholderTextColor="#4A4540"
                autoCapitalize="words"
              />
            </>
          )}

          {/* ── Step 2: Services ── */}
          {step === 2 && (
            <>
              <Text style={s.stepTitle}>Services</Text>
              <Text style={s.stepSub}>What does your salon offer?</Text>

              <ServicePillGroup
                label="Hair"
                items={HAIR_SERVICES}
                selected={form.servicesHair}
                onToggle={item => toggleService('servicesHair', item)}
              />
              <ServicePillGroup
                label="Skin"
                items={SKIN_SERVICES}
                selected={form.servicesSkin}
                onToggle={item => toggleService('servicesSkin', item)}
              />
              <ServicePillGroup
                label="Nails & Makeup"
                items={NAILS_SERVICES}
                selected={form.servicesNails}
                onToggle={item => toggleService('servicesNails', item)}
              />
            </>
          )}

          {/* ── Step 3: Price range ── */}
          {step === 3 && (
            <>
              <Text style={s.stepTitle}>Price range</Text>
              <Text style={s.stepSub}>Help customers know what to expect</Text>

              <View style={s.optionsCard}>
                {PRICE_RANGES.map(({ key, label, sub }, i) => {
                  const active = form.priceRange === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[s.optionRow, i < PRICE_RANGES.length - 1 && s.optionRowBorder, active && s.optionRowActive]}
                      onPress={() => setField('priceRange', key)}
                      activeOpacity={0.8}
                    >
                      <View style={[s.radio, active && s.radioActive]}>
                        {active && <View style={s.radioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.optionLabel, active && s.optionLabelActive]}>{label}</Text>
                        <Text style={s.optionSub}>{sub}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Step 4: Booking interest ── */}
          {step === 4 && (
            <>
              <Text style={s.stepTitle}>One last thing</Text>
              <Text style={s.step4Body}>
                Lumé is building a booking feature. Would you like customers to be able to book
                appointments at your salon through the app?
              </Text>

              <View style={s.optionsCard}>
                {[
                  { key: true,  label: "Yes, I'm interested", sub: "We'll reach out when it's ready" },
                  { key: false, label: 'Not right now',       sub: 'You can change this later' },
                ].map(({ key, label, sub }, i) => {
                  const active = form.bookingInterest === key;
                  return (
                    <TouchableOpacity
                      key={String(key)}
                      style={[s.optionRow, i === 0 && s.optionRowBorder, active && s.optionRowActive]}
                      onPress={() => setField('bookingInterest', key)}
                      activeOpacity={0.8}
                    >
                      <View style={[s.radio, active && s.radioActive]}>
                        {active && <View style={s.radioDot} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.optionLabel, active && s.optionLabelActive]}>{label}</Text>
                        <Text style={s.optionSub}>{sub}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={s.infoCard}>
                <Text style={s.infoText}>
                  No commitment required. This only tells us you're open to the idea — we'll contact
                  you before anything goes live.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Fixed bottom button */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        {step < 4 ? (
          <TouchableOpacity
            style={[s.nextBtn, !canStep(step) && s.nextBtnDisabled]}
            onPress={() => {
              if (step === 1 && form.phone.length !== 10) {
                setPhoneError(true);
                return;
              }
              setStep(s => s + 1);
            }}
            disabled={!canStep(step)}
            activeOpacity={0.85}
          >
            <Text style={s.nextBtnText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.nextBtn, (!canNext4 || submitting) && s.nextBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canNext4 || submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#0A0A0A" />
              : <Text style={s.nextBtnText}>Create profile</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  function canStep(s: number): boolean {
    if (s === 1) return canNext1;
    if (s === 2) return canNext2;
    if (s === 3) return canNext3;
    return canNext4;
  }
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#0A0A0A' },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

  backBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  backBtn:    { width: 48, alignItems: 'center' },
  backArrow:  { fontSize: 28, color: '#C9A84C', lineHeight: 32 },
  stepCaption:{ fontSize: 10, color: '#8A7A6A', letterSpacing: 3, textTransform: 'uppercase' },

  stepTitle: { fontFamily: Typography.serif, fontSize: 26, color: '#F5F0E8', marginBottom: 6 },
  stepSub:   { fontSize: 13, color: '#8A7A6A', marginBottom: Spacing.xl, lineHeight: 20 },
  step4Body: { fontSize: 12, color: '#8A7A6A', lineHeight: 20, marginBottom: Spacing.xl },

  // Underline text fields
  fieldLabel:     { fontSize: 10, color: '#8A7A6A', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6, marginTop: Spacing.lg },
  underlineInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#2A2420',
    paddingVertical:   10,
    fontSize:          16,
    color:             '#F5F0E8',
    marginBottom:      4,
  },

  // Phone row
  phoneRow:   { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#2A2420', marginBottom: 4 },
  phonePrefix:{ fontSize: 15, color: '#8A7A6A', paddingVertical: 10, marginRight: 8 },
  phoneInput: { flex: 1, borderBottomWidth: 0, marginBottom: 0 },
  phoneError: { fontSize: 11, color: '#E24B4A', marginTop: 4 },

  // Radio option rows
  optionsCard: {
    backgroundColor: '#1A1412',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#2A2420',
    overflow:        'hidden',
    marginBottom:    Spacing.lg,
  },
  optionRow:        { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
  optionRowBorder:  { borderBottomWidth: 1, borderBottomColor: '#2A2420' },
  optionRowActive:  { backgroundColor: 'rgba(201,168,76,0.06)' },
  radio:            { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#2A2420', alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  radioActive:      { borderColor: '#C9A84C' },
  radioDot:         { width: 10, height: 10, borderRadius: 5, backgroundColor: '#C9A84C' },
  optionLabel:      { fontSize: 14, color: '#8A7A6A', marginBottom: 2 },
  optionLabelActive:{ color: '#F5F0E8', fontWeight: '600' },
  optionSub:        { fontSize: 12, color: '#4A4540' },

  // Info card (step 4)
  infoCard: {
    backgroundColor: '#1A1412',
    borderWidth:     1,
    borderColor:     '#2A2420',
    borderRadius:    12,
    padding:         Spacing.md,
  },
  infoText: { fontSize: 12, color: '#4A4540', lineHeight: 20 },

  // Bottom bar
  bottomBar: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    paddingHorizontal: Spacing.lg,
    paddingTop:        Spacing.sm,
    backgroundColor:   '#0A0A0A',
    borderTopWidth:    1,
    borderTopColor:    '#2A2420',
  },
  nextBtn:         { backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: Spacing.md, alignItems: 'center' },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText:     { fontSize: 15, fontWeight: '600', color: '#0A0A0A' },

  // Confirmation
  confirmBox: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: Spacing.xl,
  },
  confirmCheck: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: 'rgba(93,202,165,0.15)',
    borderWidth:     1,
    borderColor:     '#5DCAA5',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    Spacing.xl,
  },
  confirmCheckText:      { fontSize: 28, color: '#5DCAA5' },
  confirmTitle:          { fontFamily: Typography.serif, fontSize: 24, color: '#F5F0E8', marginBottom: 8, textAlign: 'center' },
  confirmSub:            { fontSize: 14, color: '#8A7A6A', textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xxl },
  confirmPrimaryBtn:     { backgroundColor: '#C9A84C', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginBottom: Spacing.sm },
  confirmPrimaryBtnText: { fontSize: 14, fontWeight: '600', color: '#0A0A0A' },
  confirmSecondaryBtn:   { paddingVertical: 12, alignItems: 'center' },
  confirmSecondaryBtnText:{ fontSize: 14, color: '#8A7A6A' },
});
