// ShadeFamilyRow — category-prose pair shown in MakeupDetailScreen's
// "Shade families" section. Top + bottom borders mirror the ShadeRow
// design from screens-extra-1.jsx with description copy in italic serif.

import { View, Text } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  category:    string;     // "Foundation" | "Lip" | ...
  description: string;
  last?:       boolean;
}

export function ShadeFamilyRow({ category, description, last }: Props) {
  return (
    <View
      style={{
        paddingVertical:   14,
        borderTopWidth:    1,
        borderTopColor:    Palette.rule,
        borderBottomWidth: last ? 1 : 0,
        borderBottomColor: Palette.rule,
      }}
    >
      <Text
        style={{
          fontFamily:    'Inter_500Medium',
          fontSize:      10,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color:         Palette.ink3,
        }}
      >
        {category}
      </Text>
      <Text
        style={{
          marginTop:  6,
          fontFamily: 'CormorantGaramond_400Regular_Italic',
          fontStyle:  'italic',
          fontSize:   15,
          lineHeight: 22,
          color:      Palette.ink2,
        }}
      >
        {description}
      </Text>
    </View>
  );
}
