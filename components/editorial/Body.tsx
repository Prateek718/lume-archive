import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { Palette, Type } from '../../constants/theme';

interface Props {
  children: React.ReactNode;
  serif?: boolean;
  size?: number;
  dark?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Body({ children, serif = false, size, dark = false, style }: Props) {
  const base = serif ? Type.bodySerif : Type.body;

  const sizeOverride: TextStyle | null =
    size !== undefined ? { fontSize: size, lineHeight: Math.round(size * 1.55) } : null;

  return (
    <Text
      style={[
        base,
        sizeOverride,
        { color: dark ? 'rgba(255,255,255,0.72)' : Palette.ink2 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
