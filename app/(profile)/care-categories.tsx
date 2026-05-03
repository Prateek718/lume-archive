import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  BackButton,
  Body,
  ChapterLabel,
  Display,
  OptionRow,
} from '../../components/editorial';
import { Palette } from '../../constants/theme';

type CareCategory = 'skin' | 'hair' | 'beard' | 'makeup';

const italicStyle = {
  fontFamily: 'CormorantGaramond_500Medium_Italic',
  fontStyle:  'italic' as const,
};

export default function CareCategoriesScreen() {
  const router = useRouter();
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [userId,     setUserId]     = useState<string | null>(null);
  const [gender,     setGender]     = useState<string | null>(null);
  const [categories, setCategories] = useState<CareCategory[]>(['skin']);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from('users')
        .select('gender, care_categories')
        .eq('id', user.id)
        .single();
      if (data) {
        setGender(data.gender as string | null);
        setCategories((data.care_categories as CareCategory[] | null) ?? ['skin']);
      }
      setLoading(false);
    })();
  }, []);

  const toggle = useCallback(async (cat: 'hair' | 'beard' | 'makeup') => {
    if (!userId) return;
    const next: CareCategory[] = categories.includes(cat)
      ? categories.filter(c => c !== cat)
      : [...categories, cat];
    // Skin is always present.
    const final = next.includes('skin') ? next : (['skin', ...next] as CareCategory[]);
    setCategories(final);
    setSaved(false);
    setSaving(true);
    try {
      await supabase.from('users').update({ care_categories: final }).eq('id', userId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [categories, userId]);

  if (loading) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }} />;
  }

  const isMan   = gender === 'man';
  const isWoman = gender === 'woman';
  // last visible toggleable row varies by gender
  const hairIsLast = !isMan && !isWoman;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <BackButton onPress={() => router.back()} />
          <View style={{ height: 32 }} />
          <ChapterLabel>Care categories</ChapterLabel>
          <View style={{ height: 10 }} />
          <Display>
            <Text style={italicStyle}>What you</Text>
            {' focus on.'}
          </Display>
          <View style={{ height: 12 }} />
          <View style={{ maxWidth: 280 }}>
            <Body serif>
              Skin is always included. Hair, beard, and makeup are optional based on what's part of your routine.
            </Body>
          </View>
          <View style={{ height: 32 }} />

          <OptionRow
            label="Skin"
            selected
            locked
            variant="checkbox"
            onPress={() => {}}
          />
          <OptionRow
            label="Hair"
            selected={categories.includes('hair')}
            variant="checkbox"
            onPress={() => { void toggle('hair'); }}
            last={hairIsLast}
          />
          {isMan && (
            <OptionRow
              label="Beard"
              selected={categories.includes('beard')}
              variant="checkbox"
              onPress={() => { void toggle('beard'); }}
              last
            />
          )}
          {isWoman && (
            <OptionRow
              label="Makeup"
              selected={categories.includes('makeup')}
              variant="checkbox"
              onPress={() => { void toggle('makeup'); }}
              last
            />
          )}

          {(saving || saved) && (
            <Text
              style={{
                marginTop:  20,
                fontFamily: 'Inter_400Regular',
                fontSize:   11.5,
                color:      Palette.ink3,
                letterSpacing: 0.2,
              }}
            >
              {saving ? 'Saving…' : 'Saved'}
            </Text>
          )}

          <View style={{ height: 12 }} />
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize:   11,
              color:      Palette.ink4,
              lineHeight: 16,
              maxWidth:   280,
            }}
          >
            Changes apply to your next scan. Past recommendations are not affected.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
