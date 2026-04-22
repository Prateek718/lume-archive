import React from 'react';
import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { Palette, Type } from '../../constants/theme';

interface Props {
  children: React.ReactNode;
  dark?: boolean;
  style?: StyleProp<TextStyle>;
}

export function ChapterLabel({ children, dark = false, style }: Props) {
  return (
    <Text
      style={[
        styles.base,
        Type.chapterLabel,
        { color: dark ? 'rgba(255,255,255,0.55)' : Palette.ink3 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {},
});
