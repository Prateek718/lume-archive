import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChapterLabel, Display, Body } from '../../components/editorial';
import { Palette } from '../../constants/theme';

export default function Discover() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 40 }}>
        <ChapterLabel>Discover · coming soon</ChapterLabel>
        <View style={{ height: 16 }} />
        <Display size="small">Reading, products, and quiet expertise.</Display>
        <View style={{ height: 20 }} />
        <Body serif>A curated shelf arrives in a later issue.</Body>
      </ScrollView>
    </SafeAreaView>
  );
}
