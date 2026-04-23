// Dark-themed option row used by BeardGoalScreen.
// OptionRow doesn't support a sub-text line, and the dark scan-bg variant
// needs different colors than the cream-bg light variant.

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  title:    string;
  sub:      string;
  selected: boolean;
  onPress:  () => void;
  first?:   boolean;
  last?:    boolean;
}

export function BeardGoalRow({
  title,
  sub,
  selected,
  onPress,
  first = false,
  last  = false,
}: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={{
        paddingVertical: 18,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: first ? 1 : 0,
        borderTopColor: 'rgba(243,239,230,0.2)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(243,239,230,0.2)',
        marginTop: first ? 0 : -1, // collapse adjacent borders so only one line shows
      }}
    >
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text
          style={{
            fontFamily: selected
              ? 'CormorantGaramond_500Medium_Italic'
              : 'CormorantGaramond_400Regular',
            fontStyle: selected ? 'italic' : 'normal',
            fontSize: 20,
            color: '#f3efe6',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: 'Inter_400Regular',
            fontSize: 11.5,
            color: 'rgba(255,255,255,0.55)',
            marginTop: 4,
          }}
        >
          {sub}
        </Text>
      </View>

      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 99,
          borderWidth: 1,
          borderColor: selected ? Palette.accent : 'rgba(255,255,255,0.4)',
          backgroundColor: selected ? Palette.accent : 'transparent',
        }}
      />
      {/* `last` is accepted for symmetry with OptionRow but unused — every row
          here owns its bottom border so the list reads cleanly. */}
      {last ? null : null}
    </TouchableOpacity>
  );
}
