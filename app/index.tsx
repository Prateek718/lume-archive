import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Palette, Type } from '../constants/theme';

export default function Index() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={[Type.displaySmall, { color: Palette.ink, textAlign: 'center' }]}>
        Under construction.
      </Text>
      <Text style={[Type.body, { color: Palette.ink3, marginTop: 12, textAlign: 'center' }]}>
        Lumé is being rebuilt against its new editorial design. Phase 1 of 9 complete.
      </Text>
      <TouchableOpacity
        onPress={() => router.push('/style-demo')}
        style={{ marginTop: 32, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: Palette.ink }}
      >
        <Text style={[Type.button, { color: Palette.ink }]}>View style demo →</Text>
      </TouchableOpacity>
    </View>
  );
}
