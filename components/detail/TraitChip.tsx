import { View, Text } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  children: string;
}

export function TraitChip({ children }: Props) {
  return (
    <View
      style={{
        paddingVertical:   6,
        paddingHorizontal: 12,
        borderRadius:      99,
        borderWidth:       1,
        borderColor:       Palette.rule,
      }}
    >
      <Text
        style={{
          fontFamily:    'Inter_400Regular',
          fontSize:      11,
          letterSpacing: 0.2,
          color:         Palette.ink2,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
