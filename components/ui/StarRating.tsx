// 5-star rating component. Two modes:
// - display: pass `value` only (decimals render as fractional fills)
// - interactive: pass `onChange`; tapping a star sets value to that index+1.
//   Tapping the currently filled rightmost star clears the rating to 0.

import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import Svg, { Path, Defs, ClipPath, Rect, G } from 'react-native-svg';
import { Palette } from '../../constants/theme';

interface Props {
  value: number;
  onChange?: (value: number) => void;
  size?: 'large' | 'small';
  readOnly?: boolean;
}

const STAR_PATH =
  'M12 2.5l2.95 6.36 6.55.78-4.85 4.55 1.32 6.81L12 17.77 6.03 21l1.32-6.81L2.5 9.64l6.55-.78L12 2.5z';

const FILLED   = Palette.accent;
const EMPTY    = 'rgba(140,104,72,0.35)';

function Star({ size, fillRatio }: { size: number; fillRatio: number }) {
  const clipId = React.useId();
  const clamped = Math.max(0, Math.min(1, fillRatio));

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={STAR_PATH} fill={EMPTY} />
      {clamped > 0 && (
        <>
          <Defs>
            <ClipPath id={clipId}>
              <Rect x={0} y={0} width={24 * clamped} height={24} />
            </ClipPath>
          </Defs>
          <G clipPath={`url(#${clipId})`}>
            <Path d={STAR_PATH} fill={FILLED} />
          </G>
        </>
      )}
    </Svg>
  );
}

export function StarRating({ value, onChange, size = 'large', readOnly = false }: Props) {
  const interactive = !readOnly && typeof onChange === 'function';
  const px = size === 'small' ? 16 : 26;
  const gap = size === 'small' ? 4 : 8;

  const handleTap = (index: number) => {
    if (!interactive || !onChange) return;
    const next = index + 1;
    // Tap the highest filled star again to clear to 0.
    if (Math.round(value) === next && next === Math.ceil(value) && value > 0) {
      onChange(0);
      return;
    }
    onChange(next);
  };

  return (
    <View style={{ flexDirection: 'row', gap }}>
      {Array.from({ length: 5 }, (_, i) => {
        const fillRatio = Math.max(0, Math.min(1, value - i));
        const star = <Star size={px} fillRatio={fillRatio} />;
        if (!interactive) return <View key={i}>{star}</View>;
        return (
          <TouchableOpacity
            key={i}
            onPress={() => handleTap(i)}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            {star}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
