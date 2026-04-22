import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
  variant?: 'radio' | 'checkbox';
  locked?: boolean;
}

export function OptionRow({
  label,
  selected,
  onPress,
  last = false,
  variant = 'radio',
  locked = false,
}: Props) {
  const italic = selected || locked;

  return (
    <TouchableOpacity
      onPress={locked ? undefined : onPress}
      activeOpacity={locked ? 1 : 0.5}
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
          fontFamily: italic ? 'CormorantGaramond_400Regular_Italic' : 'CormorantGaramond_400Regular',
          fontStyle: italic ? 'italic' : 'normal',
          color: italic ? Palette.ink : Palette.ink2,
        }}
      >
        {label}
      </Text>

      {locked ? (
        <Text
          style={{
            fontFamily: 'Inter_500Medium',
            fontSize: 9,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: Palette.ink3,
          }}
        >
          Included
        </Text>
      ) : variant === 'checkbox' && selected ? (
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 99,
            borderWidth: 1,
            borderColor: Palette.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: Palette.accent,
            }}
          />
        </View>
      ) : (
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
      )}
    </TouchableOpacity>
  );
}
