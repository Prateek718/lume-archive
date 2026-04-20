// Rate a stylist — search shadow_stylists, fill in ratings, submit.

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { StarRating } from '../../components/ui/StarRating';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

type Step = 'search' | 'form' | 'success';

interface ShadowStylist {
  id:               string;
  name:             string | null;
  instagram_handle: string | null;
  mention_count:    number;
}

const CAT_LABELS = [
  { key: 'skill',            label: 'Technical skill' },
  { key: 'listened',         label: 'Listened to me' },
  { key: 'faceUnderstanding',label: 'Understood my face' },
] as const;

type CatKey = typeof CAT_LABELS[number]['key'];

export default function RateStylistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep]             = useState<Step>('search');
  const [query, setQuery]           = useState('');
  const [stylists, setStylists]     = useState<ShadowStylist[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected]     = useState<ShadowStylist | null>(null);

  // Form state
  const [ratings, setRatings]       = useState<Record<CatKey, number>>({ skill: 0, listened: 0, faceUnderstanding: 0 });
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null);
  const [salonName, setSalonName]   = useState('');
  const [salonExpanded, setSalonExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load shadow_stylists on mount
  useEffect(() => {
    supabase
      .from('shadow_stylists')
      .select('id, name, instagram_handle, mention_count')
      .order('mention_count', { ascending: false })
      .limit(50)
      .then(
        ({ data }) => { setStylists((data as ShadowStylist[]) ?? []); setLoadingList(false); },
        ()         => { setLoadingList(false); },
      );
  }, []);

  const filtered = query.trim()
    ? stylists.filter(st => {
        const q = query.toLowerCase();
        return (st.name ?? '').toLowerCase().includes(q) ||
               (st.instagram_handle ?? '').toLowerCase().includes(q);
      })
    : stylists;

  const selectStylist = useCallback((stylist: ShadowStylist) => {
    setSelected(stylist);
    setStep('form');
  }, []);

  const addNewStylist = useCallback(() => {
    if (!query.trim()) return;
    const isHandle = query.trim().startsWith('@');
    setSelected({
      id:               `new_${Date.now()}`,
      name:             isHandle ? null : query.trim(),
      instagram_handle: isHandle ? query.trim() : null,
      mention_count:    0,
    });
    setStep('form');
  }, [query]);

  const handleSubmit = useCallback(async () => {
    if (!selected) return;
    if (ratings.skill === 0 && ratings.listened === 0 && ratings.faceUnderstanding === 0) {
      Alert.alert('Rating required', 'Please rate at least one category before submitting.');
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

      await supabase.from('stylist_ratings').insert({
        user_id:                  userId,
        stylist_name:             selected.name ?? selected.instagram_handle ?? 'Unknown',
        instagram_handle:         selected.instagram_handle ?? null,
        salon_name:               salonName.trim() || null,
        rating_skill:             ratings.skill             || null,
        rating_listened:          ratings.listened          || null,
        rating_face_understanding:ratings.faceUnderstanding || null,
        would_return:             wouldReturn,
      });

      // If it's a new stylist (not in shadow_stylists), also upsert them
      if (selected.id.startsWith('new_')) {
        const handle = selected.instagram_handle?.replace('@', '') ?? null;
        await supabase.from('shadow_stylists').insert({
          name:             selected.name ?? null,
          instagram_handle: handle,
          mention_count:    1,
          mentioned_by:     [userId],
          source:           ['stylist_rating'],
        }).select();
      }

      setStep('success');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [selected, ratings, wouldReturn, salonName]);

  // ── Search ────────────────────────────────────────────────────────────────
  if (step === 'search') {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <BackBar title="Rate a Stylist" />
        <View style={s.searchBox}>
          <TextInput
            style={s.searchInput}
            placeholder="Name or @instagram…"
            placeholderTextColor={Colors.text3}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoFocus
            returnKeyType="search"
          />
        </View>

        {loadingList ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
        ) : (
          <ScrollView contentContainerStyle={s.listContent} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 && !query.trim() && (
              <Text style={s.emptyHint}>Search by name or @instagram handle.</Text>
            )}
            {filtered.map(stylist => (
              <TouchableOpacity
                key={stylist.id}
                style={s.listRow}
                onPress={() => selectStylist(stylist)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.listName} numberOfLines={1}>
                    {stylist.name ?? stylist.instagram_handle ?? 'Unknown'}
                  </Text>
                  <View style={s.listMeta}>
                    {stylist.instagram_handle && (
                      <Text style={s.listHandle}>{stylist.instagram_handle}</Text>
                    )}
                    {stylist.mention_count > 0 && (
                      <Text style={s.listMentions}>{stylist.mention_count} mentions</Text>
                    )}
                  </View>
                </View>
                <Text style={s.listArrow}>›</Text>
              </TouchableOpacity>
            ))}
            {query.trim().length > 0 && (
              <TouchableOpacity style={s.addManualRow} onPress={addNewStylist} activeOpacity={0.8}>
                <Text style={s.addManualText}>+ Add "{query.trim()}"</Text>
              </TouchableOpacity>
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
        <Text style={s.successTitle}>Thank you!</Text>
        <Text style={s.successBody}>
          Your rating helps everyone find the best stylists.
        </Text>
        <TouchableOpacity style={s.successBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={s.successBtnText}>Back to Salons</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  const displayName = selected?.name ?? selected?.instagram_handle ?? 'Stylist';

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <BackBar title="Rate a Stylist" onBack={() => setStep('search')} />

      <ScrollView contentContainerStyle={s.formContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Stylist header */}
        <View style={s.stylistHeader}>
          <View style={s.stylistAvatar}>
            <Text style={s.stylistAvatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.stylistName}>{displayName}</Text>
            {selected?.instagram_handle && selected.name && (
              <Text style={s.stylistHandle}>{selected.instagram_handle}</Text>
            )}
            {(selected?.mention_count ?? 0) > 0 && (
              <Text style={s.stylistMentions}>{selected!.mention_count} Lumé mentions</Text>
            )}
          </View>
        </View>

        {/* Category ratings */}
        <Text style={s.fieldLabel}>RATINGS</Text>
        <View style={s.catCard}>
          {CAT_LABELS.map(({ key, label }, i) => (
            <View key={key} style={[s.catRow, i < CAT_LABELS.length - 1 && s.catRowBorder]}>
              <Text style={s.catLabel}>{label}</Text>
              <StarRating value={ratings[key]} onChange={v => setRatings(prev => ({ ...prev, [key]: v }))} size="sm" />
            </View>
          ))}
        </View>

        {/* Would return */}
        <Text style={s.fieldLabel}>VISIT AGAIN</Text>
        <View style={s.pillRow}>
          <TouchableOpacity
            style={[s.pill, wouldReturn === true && s.pillActive]}
            onPress={() => setWouldReturn(prev => prev === true ? null : true)}
            activeOpacity={0.8}
          >
            <Text style={[s.pillText, wouldReturn === true && s.pillTextActive]}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.pill, wouldReturn === false && s.pillActiveNo]}
            onPress={() => setWouldReturn(prev => prev === false ? null : false)}
            activeOpacity={0.8}
          >
            <Text style={[s.pillText, wouldReturn === false && s.pillTextActiveNo]}>No</Text>
          </TouchableOpacity>
        </View>

        {/* Salon */}
        <TouchableOpacity
          style={s.salonRow}
          onPress={() => setSalonExpanded(e => !e)}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.salonRowLabel}>At which salon?</Text>
            {salonName ? (
              <Text style={s.salonRowValue}>{salonName}</Text>
            ) : (
              <Text style={s.salonRowPlaceholder}>Tap to add salon</Text>
            )}
          </View>
          <Text style={s.salonRowArrow}>{salonExpanded ? '∧' : '›'}</Text>
        </TouchableOpacity>
        {salonExpanded && (
          <TextInput
            style={s.salonInput}
            placeholder="Salon name…"
            placeholderTextColor={Colors.text3}
            value={salonName}
            onChangeText={setSalonName}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => setSalonExpanded(false)}
          />
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, submitting && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
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
  title: { fontFamily: Typography.serif, fontSize: Typography.size.lg, color: Colors.text },
});

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  searchBox:    { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  searchInput:  { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.input, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: Typography.size.md, color: Colors.text },
  listContent:  { paddingHorizontal: Spacing.lg },
  listRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.xs },
  listName:     { fontSize: Typography.size.md, color: Colors.text, fontWeight: '600', marginBottom: 2 },
  listMeta:     { flexDirection: 'row', gap: Spacing.sm },
  listHandle:   { fontSize: Typography.size.sm, color: Colors.accent },
  listMentions: { fontSize: Typography.size.sm, color: Colors.text2 },
  listArrow:    { fontSize: 22, color: Colors.text3, lineHeight: 26 },
  addManualRow: { backgroundColor: Colors.surface2, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  addManualText:{ fontSize: Typography.size.base, color: Colors.accent },
  emptyHint:    { textAlign: 'center', color: Colors.text2, fontSize: Typography.size.base, marginTop: Spacing.xl },

  formContent:   { paddingHorizontal: Spacing.lg },
  stylistHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border, marginBottom: Spacing.lg },
  stylistAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  stylistAvatarText: { fontFamily: Typography.serif, fontSize: Typography.size.xl, color: Colors.accent },
  stylistName:   { fontSize: Typography.size.lg, color: Colors.text, fontWeight: '600' },
  stylistHandle: { fontSize: Typography.size.sm, color: Colors.text, marginTop: 2 },
  stylistMentions:{ fontSize: Typography.size.sm, color: Colors.text2, marginTop: 2 },

  fieldLabel:    { fontSize: Typography.size.xs, color: Colors.text, letterSpacing: 6, textTransform: 'uppercase', marginBottom: Spacing.sm, marginTop: Spacing.lg },
  catCard:       { backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  catRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  catRowBorder:  { borderBottomWidth: 1, borderBottomColor: Colors.border },
  catLabel:      { fontSize: Typography.size.base, color: Colors.text },

  pillRow:       { flexDirection: 'row', gap: Spacing.sm },
  pill:          { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.pill, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  pillActive:    { backgroundColor: Colors.accent, borderColor: Colors.accent },
  pillActiveNo:  { backgroundColor: Colors.statusClosedBg, borderColor: Colors.danger },
  pillText:      { fontSize: Typography.size.base, color: Colors.text, fontWeight: '600' },
  pillTextActive:{ color: Colors.textOnAccent },
  pillTextActiveNo:{ color: Colors.dangerLight },

  salonRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginTop: Spacing.lg },
  salonRowLabel: { fontSize: Typography.size.sm, color: Colors.text2, marginBottom: 2 },
  salonRowValue: { fontSize: Typography.size.base, color: Colors.text },
  salonRowPlaceholder: { fontSize: Typography.size.base, color: Colors.text3 },
  salonRowArrow: { fontSize: 18, color: Colors.text3 },
  salonInput:    { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accent, borderRadius: Radius.input, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: Typography.size.md, color: Colors.text, marginTop: Spacing.xs },

  submitBtn:         { backgroundColor: Colors.accent, borderRadius: Radius.input, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.xl },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText:     { fontSize: Typography.size.md, fontWeight: '600', color: Colors.textOnAccent },

  successScreen: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  successCheck:  { fontSize: 64, color: Colors.text, marginBottom: Spacing.lg },
  successTitle:  { fontFamily: Typography.serif, fontSize: Typography.size.xxl, color: Colors.text, marginBottom: Spacing.sm },
  successBody:   { fontSize: Typography.size.base, color: Colors.text2, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xxl },
  successBtn:    { backgroundColor: Colors.accent, borderRadius: Radius.input, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xxl, alignItems: 'center' },
  successBtnText:{ fontSize: Typography.size.md, fontWeight: '600', color: Colors.textOnAccent },
});
