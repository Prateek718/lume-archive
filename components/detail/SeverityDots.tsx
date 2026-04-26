import { View } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  level: 1 | 2 | 3;   // 1 = mild, 2 = moderate, 3 = significant
}

export function SeverityDots({ level }: Props) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3].map(i => (
        <View
          key={i}
          style={{
            width:           6,
            height:          6,
            borderRadius:    99,
            backgroundColor: i <= level ? Palette.accent : Palette.rule,
          }}
        />
      ))}
    </View>
  );
}
