import React from 'react';
import { TouchableOpacity, Text, StyleProp, ViewStyle } from 'react-native';
import { Palette, Type } from '../../constants/theme';

interface Props {
  label: string;
  onPress: () => void;
  dark?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PrimaryButton({ label, onPress, dark = false, disabled = false, style }: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={[
        {
          paddingVertical: 15,
          paddingHorizontal: 26,
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          backgroundColor: dark ? Palette.onScanBg : Palette.ink,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <Text style={[Type.button, { color: dark ? Palette.ink : Palette.onScanBg }]}>{label}</Text>
    </TouchableOpacity>
  );
}
