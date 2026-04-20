// Routine Level screen — user selects how many products they want recommended.

import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

type RoutineLevel = 'simple' | 'balanced' | 'full';

const ROUTINE_OPTIONS: { label: string; sub: string; value: RoutineLevel }[] = [
  { label: 'Keep it simple',   sub: '2–3 essential products only',  value: 'simple'   },
  { label: 'Balanced routine', sub: '4–5 products, targeted care',  value: 'balanced' },
  { label: 'Full routine',     sub: '6+ products, complete care',   value: 'full'     },
];

export default function RoutineLevelScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [routineLevel, setRoutineLevel] = useState<RoutineLevel>('simple');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('users')
        .select('routine_level')
        .eq('id', user.id)
        .single();
      const row = data as { routine_level?: string } | null;
      if (row?.routine_level) {
        setRoutineLevel(row.routine_level as RoutineLevel);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase
      .from('users')
      .update({ routine_level: routineLevel })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', 'Could not save preference. Please try again.');
      return;
    }
    router.back();
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.screenTitle}>Routine level</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={s.subtitle}>Controls how many products we recommend</Text>

      <View style={s.card}>
        {ROUTINE_OPTIONS.map((opt, idx) => (
          <View key={opt.value}>
            <TouchableOpacity
              style={s.row}
              onPress={() => setRoutineLevel(opt.value)}
              activeOpacity={0.8}
            >
              <View style={s.rowTexts}>
                <Text style={[s.rowLabel, routineLevel === opt.value && s.rowLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={s.rowSub}>{opt.sub}</Text>
              </View>
              <View style={[s.radioOuter, routineLevel === opt.value && s.radioOuterActive]}>
                {routineLevel === opt.value && <View style={s.radioInner} />}
              </View>
            </TouchableOpacity>
            {idx < ROUTINE_OPTIONS.length - 1 && <View style={s.divider} />}
          </View>
        ))}
      </View>

      <View style={[s.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator color={Colors.surface} />
            : <Text style={s.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
  },
  backArrow:   { fontSize: 32, color: Colors.surface, lineHeight: 40 },
  screenTitle: { fontFamily: Typography.serif, fontSize: 22, color: Colors.surface },

  subtitle: {
    fontSize: 13, color: Colors.text2,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl,
  },

  card: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 18, paddingHorizontal: Spacing.md,
  },
  rowTexts:    { flex: 1, marginRight: Spacing.md },
  rowLabel:    { fontSize: 15, color: Colors.text2, marginBottom: 3 },
  rowLabelActive: { color: Colors.text, fontWeight: '600' },
  rowSub:      { fontSize: 13, color: Colors.text3 },

  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.md },

  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.text2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  radioOuterActive: { borderColor: Colors.accent },
  radioInner: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.accent,
  },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  saveBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.input,
    paddingVertical: Spacing.md, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: Typography.size.md, fontWeight: '600', color: Colors.surface },
});
