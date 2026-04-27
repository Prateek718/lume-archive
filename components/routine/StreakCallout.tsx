// Translated verbatim from design/source/screens-routine-rescan.jsx:122-156.
// Three-section editorial callout: Streak / This week / Next scan.

import { Text, View } from 'react-native';
import { ChapterLabel } from '../editorial';
import { Palette } from '../../constants/theme';

interface Props {
  streakDays:      number;
  doneToday:       number;
  totalToday:      number;
  daysToNextScan:  number;
}

export function StreakCallout({ streakDays, doneToday, totalToday, daysToNextScan }: Props) {
  return (
    <View
      style={{
        backgroundColor:   Palette.bgElev,
        paddingVertical:   14,
        paddingHorizontal: 18,
        flexDirection:     'row',
        justifyContent:    'space-between',
        alignItems:        'center',
      }}
    >
      <Section
        label="Streak"
        valueNode={
          <Text style={valueText}>
            <Text style={italicNumber}>{streakDays}</Text>
            <Text style={unitText}> days</Text>
          </Text>
        }
      />
      <Divider />
      <Section
        label="This week"
        valueNode={
          <Text style={valueText}>
            <Text style={italicNumber}>{doneToday}</Text>
            <Text style={unitText}> / {totalToday}</Text>
          </Text>
        }
      />
      <Divider />
      <Section
        label="Next scan"
        valueNode={
          <Text style={valueText}>
            <Text style={italicNumber}>{daysToNextScan}</Text>
            <Text style={unitText}> days</Text>
          </Text>
        }
      />
    </View>
  );
}

function Section({ label, valueNode }: { label: string; valueNode: React.ReactNode }) {
  return (
    <View>
      <ChapterLabel style={{ marginBottom: 4 }}>{label}</ChapterLabel>
      {valueNode}
    </View>
  );
}

function Divider() {
  return <View style={{ width: 1, height: 34, backgroundColor: Palette.rule }} />;
}

const valueText = {
  fontFamily: 'CormorantGaramond_500Medium' as const,
  fontSize:   20,
  color:      Palette.ink,
};

const italicNumber = {
  fontFamily: 'CormorantGaramond_500Medium_Italic' as const,
  fontStyle:  'italic' as const,
};

const unitText = {
  color:    Palette.ink3,
  fontSize: 14,
};
