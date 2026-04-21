// My Kit — shows active products in the user's kit, grouped by category,
// with reorder/replace/remove actions.

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Linking, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabase';
import { fetchActiveKit, removeKitItem, markKitReordered, type UserKitRow } from '../../services/kitService';
import { PRODUCTS, type Product } from '../../constants/productConstants';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';

type KitCategory = 'skin' | 'hair' | 'beard' | 'other';

interface KitEntry {
  row:     UserKitRow;
  product: Product | null;    // resolved catalogue entry, may be null for legacy/custom ids
  section: KitCategory;
}

const SECTION_LABELS: Record<KitCategory, string> = {
  skin:  'SKIN',
  hair:  'HAIR',
  beard: 'BEARD',
  other: 'MAKEUP & OTHER',
};

function sectionFor(row: UserKitRow): KitCategory {
  if (!row.step_id) return 'other';
  if (row.step_id.startsWith('skin_'))  return 'skin';
  if (row.step_id.startsWith('hair_'))  return 'hair';
  if (row.step_id.startsWith('beard_')) return 'beard';
  return 'other';
}

function resolveProduct(productId: string): Product | null {
  return PRODUCTS.find(p => p.id === productId) ?? null;
}

export default function MyKitScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<KitEntry[]>([]);
  const [actionSheet, setActionSheet] = useState<{ visible: boolean; entry?: KitEntry }>({ visible: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setEntries([]); return; }
      const rows = await fetchActiveKit(user.id);
      const mapped: KitEntry[] = rows.map(row => ({
        row,
        product: resolveProduct(row.product_id),
        section: sectionFor(row),
      }));
      setEntries(mapped);
    } catch (err) {
      console.error('[my-kit] load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const grouped = useMemo(() => {
    const g: Record<KitCategory, KitEntry[]> = { skin: [], hair: [], beard: [], other: [] };
    for (const e of entries) g[e.section].push(e);
    return g;
  }, [entries]);

  const handleReorder = async (entry: KitEntry) => {
    setActionSheet({ visible: false });
    if (entry.product?.nykaa_url) {
      await markKitReordered(entry.row.id);
      Linking.openURL(entry.product.nykaa_url);
    }
  };

  const handleRemove = async (entry: KitEntry) => {
    setActionSheet({ visible: false });
    try {
      await removeKitItem(entry.row.id);
      await load();
    } catch (err) {
      console.error('[my-kit] remove failed', err);
    }
  };

  const renderRow = (entry: KitEntry) => {
    const p = entry.product;
    const name = p?.name ?? entry.row.product_id;
    const brand = p?.brand ?? '';
    const viaLume = entry.row.acquired_via === 'lume_affiliate';
    const canReorder = !!p?.nykaa_url;

    return (
      <TouchableOpacity
        key={entry.row.id}
        style={s.itemRow}
        activeOpacity={0.7}
        onPress={() => setActionSheet({ visible: true, entry })}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.itemName} numberOfLines={1}>{name}</Text>
          {brand ? <Text style={s.itemBrand} numberOfLines={1}>{brand}</Text> : null}
          <View style={s.itemMeta}>
            <View style={[s.tag, viaLume ? s.tagLume : s.tagOwned]}>
              <Text style={[s.tagText, viaLume ? s.tagTextLume : s.tagTextOwned]}>
                {viaLume ? 'Via Lumé' : 'Owned'}
              </Text>
            </View>
          </View>
        </View>
        {canReorder && (
          <TouchableOpacity
            style={s.reorderChip}
            activeOpacity={0.75}
            onPress={(e) => { e.stopPropagation(); handleReorder(entry); }}
          >
            <Text style={s.reorderChipText}>Buy again ↗</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
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
        <Text style={s.screenTitle}>My kit</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={s.subtitle}>
        Track products you use so we can tell you what's working and when to reorder.
      </Text>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : entries.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyTitle}>Your kit is empty</Text>
          <Text style={s.emptyBody}>
            Set up products from your routine or next scan to start tracking reorders.
          </Text>
          <TouchableOpacity
            style={s.emptyBtn}
            onPress={() => router.replace('/(tabs)/routine')}
            activeOpacity={0.8}
          >
            <Text style={s.emptyBtnText}>Go to routine</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {(['skin', 'hair', 'beard', 'other'] as KitCategory[]).map(key => {
            const items = grouped[key];
            if (items.length === 0) return null;
            return (
              <View key={key} style={s.section}>
                <Text style={s.sectionLabel}>{SECTION_LABELS[key]}</Text>
                <View style={s.card}>
                  {items.map(renderRow)}
                </View>
              </View>
            );
          })}
          <View style={{ height: Spacing.xxxl }} />
        </ScrollView>
      )}

      {/* ── Action sheet ── */}
      <Modal
        visible={actionSheet.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSheet({ visible: false })}
      >
        <TouchableOpacity
          style={s.sheetOverlay}
          activeOpacity={1}
          onPress={() => setActionSheet({ visible: false })}
        >
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>
              {actionSheet.entry?.product?.name ?? actionSheet.entry?.row.product_id ?? ''}
            </Text>
            {actionSheet.entry?.product?.nykaa_url && (
              <TouchableOpacity
                style={s.sheetAction}
                activeOpacity={0.75}
                onPress={() => actionSheet.entry && handleReorder(actionSheet.entry)}
              >
                <Text style={s.sheetActionText}>Reorder</Text>
              </TouchableOpacity>
            )}
            {actionSheet.entry && (
              <TouchableOpacity
                style={s.sheetAction}
                activeOpacity={0.75}
                onPress={() => handleRemove(actionSheet.entry!)}
              >
                <Text style={[s.sheetActionText, { color: Colors.danger }]}>Remove from kit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.sheetCancel}
              activeOpacity={0.75}
              onPress={() => setActionSheet({ visible: false })}
            >
              <Text style={s.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: Colors.background },

  topBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  backArrow:{ fontSize: 30, color: Colors.accent, width: 40 },
  screenTitle: { fontFamily: Typography.serif, fontSize: 18, color: Colors.text },

  subtitle: { fontSize: 13, color: Colors.text2, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md, lineHeight: 18 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

  section: { marginBottom: Spacing.lg },
  sectionLabel: { fontSize: 10, color: Colors.text, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.xs },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border2,
  },
  itemName:  { fontSize: 14, color: Colors.text, fontWeight: '500' },
  itemBrand: { fontSize: 12, color: Colors.text2, marginTop: 1 },
  itemMeta:  { flexDirection: 'row', gap: 6, marginTop: 6 },

  tag: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagLume: { backgroundColor: Colors.accentTintMedium },
  tagOwned: { backgroundColor: Colors.surface2 },
  tagText:  { fontSize: 9, fontWeight: '600' },
  tagTextLume: { color: Colors.accent },
  tagTextOwned: { color: Colors.text2 },

  reorderChip: { borderWidth: 1, borderColor: Colors.accent, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 6, marginLeft: Spacing.sm },
  reorderChipText: { fontSize: 10, color: Colors.accent, fontWeight: '600' },

  // Empty
  emptyBox:   { alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxxl },
  emptyTitle: { fontFamily: Typography.serif, fontSize: 20, color: Colors.text, marginBottom: Spacing.sm, textAlign: 'center' },
  emptyBody:  { fontSize: 13, color: Colors.text2, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  emptyBtn:   { backgroundColor: Colors.accent, borderRadius: Radius.input, paddingHorizontal: 28, paddingVertical: 12 },
  emptyBtnText: { fontSize: 13, color: Colors.textOnAccent, fontWeight: '600' },

  // Sheet
  sheetOverlay: { flex: 1, backgroundColor: Colors.overlaySheet, justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, paddingBottom: Spacing.xl },
  sheetTitle: { fontFamily: Typography.serif, fontSize: 16, color: Colors.text, marginBottom: Spacing.md },
  sheetAction: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border2 },
  sheetActionText: { fontSize: 15, color: Colors.accent, fontWeight: '500' },
  sheetCancel: { paddingVertical: 14, marginTop: 4, alignItems: 'center' },
  sheetCancelText: { fontSize: 13, color: Colors.text2 },
});
