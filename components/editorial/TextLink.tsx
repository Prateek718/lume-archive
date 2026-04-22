import React from 'react';
import { TouchableOpacity, Text, StyleProp, ViewStyle } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  label: string;
  onPress: () => void;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TextLink({ label, onPress, dark = false, style }: Props) {
  return (
    <TouchableOpacity onPress={onPress} style={[{ padding: 6 }, style]}>
      <Text
        style={{
          fontFamily: 'CormorantGaramond_400Regular_Italic',
          fontStyle: 'italic',
          fontSize: 16,
          color: dark ? Palette.onScanBg : Palette.ink,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
