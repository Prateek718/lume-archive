import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  length?: 'short' | 'full';
  tone?: 'default' | 'accent';
  style?: StyleProp<ViewStyle>;
}

export function Rule({ length = 'full', tone = 'default', style }: Props) {
  return (
    <View
      style={[
        {
          height: 1,
          width: length === 'short' ? 28 : '100%',
          backgroundColor: tone === 'accent' ? Palette.accent : Palette.rule,
        },
        style,
      ]}
    />
  );
}
