import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  BackButton,
  ChapterLabel,
  Display,
  PrimaryButton,
} from '../../components/editorial';
import { BeardGoalRow } from '../../components/scan/BeardGoalRow';
import { Palette } from '../../constants/theme';
import { useScan } from '../../hooks/useScan';
import type { BeardGoal } from '../../types';

const OPTIONS: { id: BeardGoal; title: string; sub: string }[] = [
  { id: 'fuller',  title: 'Fuller',             sub: 'Fill in the cheeks and sides' },
  { id: 'sharper', title: 'Sharper edges',      sub: 'Cleaner jawline and neckline' },
  { id: 'shorter', title: 'Shorter',            sub: 'A neat, professional look' },
  { id: 'longer',  title: 'Longer',             sub: 'Grow out the length' },
  { id: 'none',    title: 'No particular goal', sub: 'Maintain what I have' },
];

export default function BeardGoalScreen() {
  const router = useRouter();
  const { submitBeardGoal } = useScan();
  const [selected, setSelected] = useState<BeardGoal | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onContinue = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      await submitBeardGoal(selected);
      // Returning to /scan lets the analyzing screen pick up the next state
      // (needs_trait_confirm or success) and route from there.
      router.replace('/scan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.scanBg }}>
      <View style={{ paddingTop: 8, paddingHorizontal: 28 }}>
        <BackButton dark onPress={() => router.back()} style={{ marginLeft: -8 }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 32, paddingTop: 22 }}>
        <ChapterLabel dark>While we read your scan · beard</ChapterLabel>
        <View style={{ height: 10 }} />
        <Display size="small" dark>
          <Text
            style={{
              fontFamily: 'CormorantGaramond_500Medium_Italic',
              fontStyle: 'italic',
            }}
          >
            What are
          </Text>
          {'\n'}you after?
        </Display>

        <View style={{ height: 24 }} />
        {OPTIONS.map((opt, idx) => (
          <BeardGoalRow
            key={opt.id}
            title={opt.title}
            sub={opt.sub}
            selected={selected === opt.id}
            onPress={() => setSelected(opt.id)}
            first={idx === 0}
            last={idx === OPTIONS.length - 1}
          />
        ))}

        <View style={{ flex: 1 }} />
        <PrimaryButton
          dark
          label="Continue"
          onPress={onContinue}
          disabled={!selected || submitting}
        />
        <View style={{ height: 16 }} />
      </View>
    </SafeAreaView>
  );
}
