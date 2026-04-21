// Milestones list — read-only review of everything the user has earned.
// Tapping a row re-opens the celebration screen for that milestone.

import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import {
  fetchAllMilestones,
  MILESTONES,
  type EarnedMilestone,
  type MilestoneKey,
} from '../../lib/milestones';
import MilestoneCelebration from '../../components/MilestoneCelebration';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function glyphFor(key: MilestoneKey): string {
  switch (key) {
    case 'first_routine':     return '✓';
    case 'week_one':          return '✓';
    case 'consistency_30':    return '◆';
    case 'first_rescan':      return '◎';
    case 'first_improvement': return '↑';
    case 'year_one':          return '★';
    default:                  return '◦';
  }
}

export default function MilestonesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EarnedMilestone[]>([]);
  const [preview, setPreview] = useState<EarnedMilestone | null>(null);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { setRows([]); return; }
          const all = await fetchAllMilestones(user.id);
          setRows(all);
        } finally {
          setLoading(false);
        }
      };
      load();
    }, []),
  );

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />

      <View style={[s.topBar, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>Milestones</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : rows.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyText}>No milestones earned yet.</Text>
          <Text style={s.emptySub}>Stick with your routine — they come.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {rows.map(r => {
            const key = r.milestone_key as MilestoneKey;
            const def = MILESTONES[key];
            if (!def) return null;
            return (
              <TouchableOpacity
                key={r.id}
                style={s.row}
                onPress={() => setPreview(r)}
                activeOpacity={0.85}
              >
                <View style={s.iconBox}>
                  <Text style={s.iconText}>{glyphFor(key)}</Text>
                </View>
                <View style={s.rowBody}>
                  <Text style={s.rowTitle}>{def.title}</Text>
                  <Text style={s.rowDate}>{formatDate(r.earned_at)}</Text>
                  <Text style={s.rowCopy} numberOfLines={2}>{def.copy}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: Spacing.xxxl }} />
        </ScrollView>
      )}

      {preview && (
        <MilestoneCelebration
          milestoneKey={preview.milestone_key as MilestoneKey}
          title={MILESTONES[preview.milestone_key as MilestoneKey].title}
          copy={MILESTONES[preview.milestone_key as MilestoneKey].copy}
          context={preview.context}
          onDismiss={() => setPreview(null)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  emptyText: { color: Colors.text, fontSize: Typography.size.md, marginBottom: Spacing.xs },
  emptySub:  { color: Colors.text2, fontSize: Typography.size.base, textAlign: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs,
  },
  backArrow: { fontSize: 32, color: Colors.text, lineHeight: 40 },
  topTitle:  { fontFamily: Typography.serif, fontSize: 18, color: Colors.text },

  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },

  row: {
    flexDirection:   'row',
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    marginBottom:    Spacing.sm,
    gap:             Spacing.md,
  },
  iconBox: {
    width:           40,
    height:          40,
    borderRadius:    20,
    borderWidth:     1,
    borderColor:     Colors.accent,
    backgroundColor: Colors.surface2,
    alignItems:      'center',
    justifyContent:  'center',
  },
  iconText: { fontSize: 18, color: Colors.accent, lineHeight: 22 },
  rowBody:  { flex: 1 },
  rowTitle: { fontFamily: Typography.serif, fontSize: 15, color: Colors.text, marginBottom: 2 },
  rowDate:  { fontSize: 11, color: Colors.text3, marginBottom: 4 },
  rowCopy:  { fontSize: 12, color: Colors.text2, lineHeight: 17 },
});
