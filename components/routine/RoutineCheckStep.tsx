// Translated verbatim from design/source/screens-routine-rescan.jsx:41-78.
// Single row of the daily routine list: checkbox + STEP NN label + title + note.

import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Palette } from '../../constants/theme';

interface Props {
  num:      string;
  title:    string;
  note:     string;
  checked:  boolean;
  onToggle: () => void;
  last?:    boolean;
}

export function RoutineCheckStep({ num, title, note, checked, onToggle, last = false }: Props) {
  return (
    <View
      style={{
        flexDirection:     'row',
        gap:               16,
        paddingVertical:   18,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: Palette.rule,
        alignItems:        'flex-start',
        opacity:           checked ? 0.55 : 1,
      }}
    >
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        style={{
          width:           28,
          height:          28,
          borderRadius:    14,
          borderWidth:     checked ? 0 : 1.5,
          borderColor:     Palette.rule,
          backgroundColor: checked ? Palette.accent : 'transparent',
          alignItems:      'center',
          justifyContent:  'center',
          marginTop:       2,
          flexShrink:      0,
        }}
      >
        {checked && (
          <Svg width={12} height={9} viewBox="0 0 12 9" fill="none">
            <Path
              d="M1 4.5L4.5 8L11 1"
              stroke={Palette.onScanBg}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily:    'Inter_500Medium',
            fontSize:      9,
            letterSpacing: 1.5,
            color:         Palette.accent,
            marginBottom:  4,
          }}
        >
          STEP {num}
        </Text>
        <Text
          style={{
            fontFamily:           'CormorantGaramond_500Medium',
            fontSize:             18,
            lineHeight:           23,
            color:                Palette.ink,
            textDecorationLine:   checked ? 'line-through' : 'none',
            textDecorationColor:  Palette.ink3,
          }}
        >
          {title}
        </Text>
        {note ? (
          <Text
            style={{
              marginTop:  4,
              fontFamily: 'Inter_400Regular',
              fontSize:   11.5,
              color:      Palette.ink3,
            }}
          >
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
