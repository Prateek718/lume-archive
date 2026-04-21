// Scan history — chronological list of past scans. Tapping a scan opens the
// /recommendations-view screen so users can see the prescription that was
// generated for that point in time.

import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { fetchDeltaToScanIds } from '../../services/deltaService';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import type { Scan } from '../../types';

type HistoryRow = Pick<
  Scan,
  'id' | 'created_at' | 'face_shape' | 'skin_type' | 'tier_label' | 'score_overall'
>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function ScanHistoryScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [scans,   setScans]   = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deltaScanIds, setDeltaScanIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [{ data }, deltaIds] = await Promise.all([
          supabase
            .from('scans')
            .select('id, created_at, face_shape, skin_type, tier_label, score_overall')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          fetchDeltaToScanIds(user.id),
        ]);
        if (data) setScans(data as HistoryRow[]);
        setDeltaScanIds(deltaIds);
      } catch (err) {
        console.error('[scan-history] load failed', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openScan = (scanId: string) => {
    router.push({ pathname: '/recommendations-view', params: { scanId } });
  };

  const openDelta = (scanId: string) => {
    router.push({ pathname: '/scan-delta' as never, params: { to_scan_id: scanId } });
  };

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
        <Text style={s.topTitle}>Past analyses</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : scans.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyText}>No past scans yet.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {scans.map((scan, i) => {
            const pills = [
              scan.face_shape && `${scan.face_shape} face`,
              scan.skin_type  && `${scan.skin_type} skin`,
            ].filter(Boolean) as string[];
            const hasDelta = deltaScanIds.has(scan.id!);
            return (
              <TouchableOpacity
                key={scan.id}
                style={s.scanCard}
                onPress={() => openScan(scan.id!)}
                activeOpacity={0.85}
              >
                <View style={s.scanCardHeader}>
                  <Text style={s.scanCardDate}>{formatDate(scan.created_at)}</Text>
                  {i === 0 && (
                    <View style={s.latestBadge}>
                      <Text style={s.latestBadgeText}>Latest</Text>
                    </View>
                  )}
                </View>
                {pills.length > 0 && (
                  <View style={s.scanCardPills}>
                    {pills.map(p => (
                      <View key={p} style={s.pill}>
                        <Text style={s.pillText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={s.linkRow}>
                  <Text style={s.viewLink}>View prescription →</Text>
                  {hasDelta && (
                    <TouchableOpacity
                      onPress={() => openDelta(scan.id!)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={s.viewLink}>View progress →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: Spacing.xxxl }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: Colors.text2, fontSize: Typography.size.base },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xs,
  },
  backArrow: { fontSize: 32, color: Colors.text, lineHeight: 40 },
  topTitle:  { fontFamily: Typography.serif, fontSize: 18, color: Colors.text },

  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },

  scanCard: {
    backgroundColor: Colors.surface,
    borderRadius:    Radius.card,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         Spacing.md,
    marginBottom:    Spacing.sm,
  },
  scanCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  scanCardDate: { fontFamily: Typography.serif, fontSize: 16, color: Colors.text },
  latestBadge: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  latestBadgeText: { fontSize: 9, color: Colors.textOnAccent, fontWeight: '700', letterSpacing: 0.5 },

  scanCardPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: Spacing.xs },
  pill:     { backgroundColor: Colors.surface2, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 10, color: Colors.accent, textTransform: 'capitalize' },

  viewLink: { fontSize: 12, color: Colors.accent, marginTop: 4 },
  linkRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            Spacing.md,
  },
});
