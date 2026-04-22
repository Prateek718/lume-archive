// React Native Text cannot nest non-Text children. For inline italic
// emphasis inside a phrase, nest a <Text> with italic styling inside
// Display's children — e.g.:
//   <Display size="large">What should we call{' '}
//     <Text style={{ fontFamily: 'CormorantGaramond_500Medium_Italic', fontStyle: 'italic' }}>
//       you
//     </Text>?
//   </Display>

import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { Palette, Type } from '../../constants/theme';

interface Props {
  children: React.ReactNode;
  size?: 'small' | 'default' | 'large';
  italic?: boolean;
  dark?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Display({
  children,
  size = 'default',
  italic = false,
  dark = false,
  style,
}: Props) {
  const base =
    size === 'large' ? Type.displayLarge : size === 'small' ? Type.displaySmall : Type.display;

  const italicOverride: TextStyle | null = italic
    ? {
        fontFamily: 'CormorantGaramond_500Medium_Italic',
        fontStyle: 'italic',
      }
    : null;

  return (
    <Text
      style={[
        base,
        italicOverride,
        { color: dark ? Palette.onScanBg : Palette.ink },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
