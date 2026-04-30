// MyKitScreen — list of products currently in the user's active kit.
// View mode shows total invested; edit mode swaps each row's price for a
// "Remove" affordance that soft-deletes the kit row.

import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton, Body, ChapterLabel, Display, PrimaryButton, TextLink,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import {
  fetchKitItems, cardinalTitle, type KitItem,
} from '../../lib/profileData';
import { removeKitItem } from '../../services/kitService';

export default function MyKitScreen() {
  const router = useRouter();
  const [items, setItems]     = useState<KitItem[] | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) { if (!cancelled) setItems([]); return; }
      const rows = await fetchKitItems(userId);
      if (!cancelled) setItems(rows);
    })();
    return () => { cancelled = true; };
  }, []);

  if (items === null) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  if (items.length === 0) return <EmptyState onBack={() => router.back()} />;

  const total = items.reduce((sum, it) => sum + (it.price ?? 0), 0);

  const handleRemove = async (id: string) => {
    const prior = items;
    setItems(items.filter(it => it.id !== id));
    try {
      await removeKitItem(id);
    } catch (err) {
      console.error('[my-kit] remove failed', err);
      setItems(prior);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>
        <View
          style={{
            paddingHorizontal: 28,
            paddingVertical:   8,
            flexDirection:     'row',
            justifyContent:    'space-between',
            alignItems:        'center',
          }}
        >
          <BackButton onPress={() => router.back()} style={{ marginLeft: -8 }} />
          <TouchableOpacity
            onPress={() => setEditing(e => !e)}
            activeOpacity={0.7}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
          >
            <Text
              style={{
                fontFamily:    'Inter_500Medium',
                fontSize:      11,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color:         editing ? Palette.ink2 : Palette.accent,
              }}
            >
              {editing ? 'Done' : 'Edit'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 32 }}>
          <ChapterLabel>{`${cardinalTitle(items.length)} in rotation`}</ChapterLabel>
          <Display
            style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}
          >
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>Your kit,</Text>
            {'\n'}this issue.
          </Display>
        </View>
        <View style={{ paddingTop: 28, paddingHorizontal: 32 }}>
          {items.map((it, i) => (
            <KitItemRow
              key={it.id}
              item={it}
              first={i === 0}
              last={i === items.length - 1}
              editing={editing}
              onRemove={() => handleRemove(it.id)}
            />
          ))}
        </View>
        {!editing && (
          <View style={{ paddingTop: 22, paddingHorizontal: 32, alignItems: 'center' }}>
            <TextLink
              label="Add more from routine →"
              onPress={() => router.push('/(profile)/add-from-routine')}
            />
          </View>
        )}
        <View style={{ paddingTop: 18, paddingHorizontal: 32 }}>
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize:   12,
              color:      Palette.ink3,
              textAlign:  'center',
            }}
          >
            {`Total invested · ₹${total.toLocaleString('en-IN')}`}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface KitItemRowProps {
  item:     KitItem;
  first:    boolean;
  last:     boolean;
  editing:  boolean;
  onRemove: () => void;
}

function KitItemRow({ item, first, last, editing, onRemove }: KitItemRowProps) {
  return (
    <View
      style={{
        paddingVertical:    18,
        borderTopWidth:     first ? 1 : 1,
        borderTopColor:     Palette.rule,
        borderBottomWidth:  last ? 1 : 0,
        borderBottomColor:  Palette.rule,
        flexDirection:      'row',
        alignItems:         'center',
        gap:                14,
      }}
    >
      <View style={{ width: 52, height: 66, backgroundColor: Palette.accentSoft }} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily:    'Inter_500Medium',
            fontSize:      10,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color:         Palette.ink3,
          }}
        >
          {item.brand}
        </Text>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium_Italic',
            fontStyle:  'italic',
            fontSize:   17,
            color:      Palette.ink,
            marginTop:  3,
          }}
        >
          {item.name}
        </Text>
      </View>
      {editing ? (
        <TouchableOpacity
          onPress={onRemove}
          activeOpacity={0.7}
          style={{ paddingVertical: 6, paddingHorizontal: 8 }}
        >
          <Text
            style={{
              fontFamily: 'CormorantGaramond_400Regular_Italic',
              fontStyle:  'italic',
              fontSize:   14,
              color:      Palette.accent,
            }}
          >
            Remove
          </Text>
        </TouchableOpacity>
      ) : (
        <Text
          style={{
            fontFamily: 'Inter_400Regular',
            fontSize:   13,
            color:      Palette.ink2,
          }}
        >
          {item.price != null ? `₹${item.price.toLocaleString('en-IN')}` : '—'}
        </Text>
      )}
    </View>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ flex: 1, padding: 32, paddingTop: 12 }}>
        <BackButton onPress={onBack} style={{ marginLeft: -8 }} />
        <View style={{ marginTop: 30 }}>
          <ChapterLabel>Nothing here yet</ChapterLabel>
          <Display
            style={{ marginTop: 14, fontSize: 32, lineHeight: 35 }}
          >
            <Text style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle:  'italic',
            }}>Your kit</Text>
            {'\n'}is empty.
          </Display>
        </View>
        <Body serif size={14.5} style={{ marginTop: 22, lineHeight: 24, fontStyle: 'italic' }}>
          Once you add products from your routine, they live here. We only suggest — you decide.
        </Body>
        <View style={{ flex: 1 }} />
        <PrimaryButton
          label="Add from your routine →"
          onPress={() => router.push('/(profile)/add-from-routine')}
        />
      </View>
    </SafeAreaView>
  );
}
