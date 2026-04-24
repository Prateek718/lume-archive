// Numbered editorial insight row used on ObservationScreen.
// Translated from Complete_ui/src/screens-extra-2.jsx ~ line 874.
//
// Layout: small accent number on the left, italic serif headline +
// serif body on the right, separated by thin rules (top always, bottom
// only on the last row).

import React from 'react';
import { Text, View } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  number:   string;   // e.g. "01", "02", "03"
  headline: string;
  body:     string;
  last?:    boolean;
}

export function InsightRow({ number, headline, body, last = false }: Props) {
  return (
    <View
      style={{
        paddingVertical:    20,
        borderTopWidth:     1,
        borderTopColor:     Palette.rule,
        borderBottomWidth:  last ? 1 : 0,
        borderBottomColor:  Palette.rule,
        flexDirection:      'row',
        gap:                18,
        alignItems:         'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily:    'Inter_500Medium',
          fontSize:      11,
          letterSpacing: 1.5,
          color:         Palette.accent,
          fontWeight:    '500',
          paddingTop:    4,
        }}
      >
        {number}
      </Text>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_400Regular_Italic',
            fontStyle:  'italic',
            fontSize:   22,
            lineHeight: 26,
            color:      Palette.ink,
          }}
        >
          {headline}
        </Text>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_400Regular',
            fontSize:   13.5,
            lineHeight: 22,
            color:      Palette.ink2,
            marginTop:  8,
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}
