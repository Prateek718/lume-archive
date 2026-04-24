import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { Palette } from '../../constants/theme';

type TabIconName = 'routine' | 'discover' | 'profile';

interface Props {
  name:   TabIconName;
  active: boolean;
}

export function TabIcon({ name, active }: Props) {
  const stroke      = active ? Palette.accent : Palette.ink3;
  const strokeWidth = active ? 1.5 : 1.3;
  const size        = 20;

  switch (name) {
    case 'routine':
      return (
        <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <Path d="M3 6 L17 6"   stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Path d="M3 10 L17 10" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Path d="M3 14 L17 14" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'discover':
      return (
        <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <Circle cx={9} cy={9} r={6} stroke={stroke} strokeWidth={strokeWidth} />
          <Path d="M13.5 13.5 L17 17" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'profile':
      return (
        <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <Circle cx={10} cy={7} r={3.5} stroke={stroke} strokeWidth={strokeWidth} />
          <Path
            d="M4 17 C4 13.5 6.5 12 10 12 C13.5 12 16 13.5 16 17"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </Svg>
      );
  }
}
