import { View, Text } from 'react-native';
import { Palette } from '../../constants/theme';
import { SeverityDots } from './SeverityDots';

interface Props {
  num:      string;           // "01" | "02" | ...
  label:    string;           // display_label from gemini
  severity: 1 | 2 | 3;        // 1 = mild, 2 = moderate, 3 = significant
  note:     string;
  last?:    boolean;
}

export function ConcernRow({ num, label, severity, note, last }: Props) {
  return (
    <View
      style={{
        flexDirection:    'row',
        gap:              18,
        paddingVertical:  20,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: Palette.rule,
        alignItems:       'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily:    'Inter_500Medium',
          fontSize:      10,
          letterSpacing: 1.5,
          color:         Palette.accent,
          paddingTop:    6,
          width:         24,
        }}
      >
        {num}
      </Text>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection:  'row',
            justifyContent: 'space-between',
            alignItems:     'center',
            gap:            12,
          }}
        >
          <Text
            style={{
              flex:       1,
              fontFamily: 'CormorantGaramond_500Medium',
              fontSize:   22,
              lineHeight: 25,
              color:      Palette.ink,
            }}
          >
            {label}
          </Text>
          <SeverityDots level={severity} />
        </View>
        <Text
          style={{
            marginTop:  8,
            fontFamily: 'CormorantGaramond_400Regular',
            fontSize:   13.5,
            lineHeight: 22,
            color:      Palette.ink2,
          }}
        >
          {note}
        </Text>
      </View>
    </View>
  );
}
