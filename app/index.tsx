import { View, Text } from 'react-native';
import { Palette, Type } from '../constants/theme';

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={[Type.displaySmall, { color: Palette.ink, textAlign: 'center' }]}>
        Under construction.
      </Text>
      <Text style={[Type.body, { color: Palette.ink3, marginTop: 12, textAlign: 'center' }]}>
        Lumé is being rebuilt against its new editorial design. Phase 0 of 9 complete.
      </Text>
    </View>
  );
}
