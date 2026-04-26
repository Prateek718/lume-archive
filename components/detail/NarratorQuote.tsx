import { ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  children: ReactNode;
}

export function NarratorQuote({ children }: Props) {
  return (
    <View
      style={{
        paddingVertical: 18,
        borderTopWidth:    1,
        borderBottomWidth: 1,
        borderColor:     Palette.rule,
      }}
    >
      <Text
        style={{
          fontFamily:     'Inter_500Medium',
          fontSize:       9,
          letterSpacing:  2,
          textTransform:  'uppercase',
          color:          Palette.accent,
          marginBottom:   10,
        }}
      >
        — a note on your plan
      </Text>
      <Text
        style={{
          fontFamily: 'CormorantGaramond_400Regular_Italic',
          fontStyle:  'italic',
          fontSize:   18,
          lineHeight: 25,
          color:      Palette.ink2,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
