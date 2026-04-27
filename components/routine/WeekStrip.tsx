// Translated verbatim from design/source/screens-routine-rescan.jsx:12-39.
// 7 day-dots with day-of-month inside; today is outlined, completed days
// fill with accent. Day labels and date numbers are derived from today's
// Date so the strip stays correct on any day.

import { Text, View } from 'react-native';
import { Palette } from '../../constants/theme';

interface Props {
  activeIdx:     number;        // index in 0..6 marking today's position
  completedIdxs: number[];      // indices of days the user was adherent
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];   // JS Date.getDay() → 0..6

export function WeekStrip({ activeIdx, completedIdxs }: Props) {
  const today = new Date();
  const cells = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + (i - activeIdx));
    return { letter: DAY_LETTERS[d.getDay()], dayOfMonth: d.getDate() };
  });
  const completedSet = new Set(completedIdxs);

  return (
    <View
      style={{
        flexDirection:  'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
      }}
    >
      {cells.map((c, i) => {
        const active = i === activeIdx;
        const done   = completedSet.has(i);
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                fontFamily:    'Inter_400Regular',
                fontSize:      10,
                letterSpacing: 1,
                color:         Palette.ink3,
              }}
            >
              {c.letter}
            </Text>
            <View
              style={{
                width:           28,
                height:          28,
                borderRadius:    14,
                borderWidth:     active ? 1.5 : 0,
                borderColor:     Palette.ink,
                backgroundColor: done ? Palette.accent : 'transparent',
                alignItems:      'center',
                justifyContent:  'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'CormorantGaramond_500Medium',
                  fontSize:   13,
                  color:      done ? Palette.onScanBg : Palette.ink2,
                }}
              >
                {c.dayOfMonth}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
