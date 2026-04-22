import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  total: number;
  active: number;
  style?: StyleProp<ViewStyle>;
}

export function Dots({ total, active, style }: Props) {
  return (
    <View style={[{ flexDirection: 'row', gap: 6 }, style]}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            height: 5,
            borderRadius: 99,
            width: i === active ? 18 : 5,
            backgroundColor: i <= active ? Palette.ink : Palette.rule,
          }}
        />
      ))}
    </View>
  );
}
