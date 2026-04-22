import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
}

export function OptionRow({ label, selected, onPress, last = false }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 18,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: Palette.rule,
      }}
    >
      <Text
        style={{
          fontSize: 20,
          fontFamily: selected ? 'CormorantGaramond_400Regular_Italic' : 'CormorantGaramond_400Regular',
          fontStyle: selected ? 'italic' : 'normal',
          color: selected ? Palette.ink : Palette.ink2,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 99,
          borderWidth: 1,
          backgroundColor: selected ? Palette.accent : 'transparent',
          borderColor: selected ? Palette.accent : Palette.ink4,
        }}
      />
    </TouchableOpacity>
  );
}
