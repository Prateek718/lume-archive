// Reusable tappable star rating — tapping a star fills all stars up to and including it.

import { View, TouchableOpacity, Text } from 'react-native';
import { Colors } from '../../constants/theme';

interface StarRatingProps {
  value:     number;               // 0 = none selected
  onChange?: (v: number) => void;  // omit to make read-only
  size?:     'sm' | 'lg';
}

export function StarRating({ value, onChange, size = 'sm' }: StarRatingProps) {
  const fontSize = size === 'lg' ? 38 : 22;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange?.(n)}
          disabled={!onChange}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={{ fontSize, color: n <= value ? Colors.accent : Colors.border, lineHeight: fontSize + 6 }}>
            ★
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
