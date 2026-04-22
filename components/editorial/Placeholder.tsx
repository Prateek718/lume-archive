import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  height?: number;
  label?: string;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Design spec shows a subtle diagonal texture and gradient. We render a solid accentSoft block for now. Revisit with expo-linear-gradient in a later phase if the design team flags it.
export function Placeholder({ height = 200, label = 'image', dark = false, style }: Props) {
  return (
    <View
      style={[
        {
          width: '100%',
          height,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: dark ? 'rgba(255,255,255,0.04)' : Palette.accentSoft,
        },
        style,
      ]}
    >
      <Text
        style={{
          position: 'absolute',
          top: 10,
          left: 12,
          fontFamily: 'Inter_500Medium',
          fontSize: 9,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: dark ? 'rgba(255,255,255,0.5)' : Palette.ink3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
