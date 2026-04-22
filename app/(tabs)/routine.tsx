import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChapterLabel, Display, Body, PrimaryButton } from '../../components/editorial';
import { Palette } from '../../constants/theme';

export default function Routine() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 40 }}>
        <ChapterLabel>Routine · coming in phase five</ChapterLabel>
        <View style={{ height: 16 }} />
        <Display size="small">Your daily care plan will live here.</Display>
        <View style={{ height: 20 }} />
        <Body serif>Complete your first scan to generate a personalized routine.</Body>
        <View style={{ height: 32 }} />
        <PrimaryButton label="Go to scan" onPress={() => router.push('/scan')} />
      </ScrollView>
    </SafeAreaView>
  );
}
