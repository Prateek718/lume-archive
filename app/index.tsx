import { View, Text } from 'react-native';
import { Palette, Type } from '../constants/theme';

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: Palette.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={[Type.displaySmall, { color: Palette.ink, textAlign: 'center' }]}>
        Lumé
      </Text>
      <Text style={[Type.body, { color: Palette.ink3, marginTop: 12, textAlign: 'center' }]}>
        Preparing your issue…
      </Text>
    </View>
  );
}
