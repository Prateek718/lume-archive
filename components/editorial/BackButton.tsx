import React from 'react';
import { TouchableOpacity, Text, StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Palette } from '../../constants/theme';

interface Props {
  onPress: () => void;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function BackButton({ onPress, dark = false, style }: Props) {
  const textColor = dark ? 'rgba(255,255,255,0.7)' : Palette.ink2;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[{ padding: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}
    >
      <Svg width={14} height={14} viewBox="0 0 14 14">
        <Path
          d="M8.5 3L4.5 7l4 4"
          stroke={textColor}
          strokeWidth={1.2}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <Text
        style={{
          fontFamily: 'CormorantGaramond_400Regular_Italic',
          fontStyle: 'italic',
          fontSize: 15,
          color: textColor,
        }}
      >
        back
      </Text>
    </TouchableOpacity>
  );
}
