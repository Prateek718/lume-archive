import { Stack } from 'expo-router';
import { View } from 'react-native';
import { Palette } from '../constants/theme';

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: Palette.bg }}>
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
