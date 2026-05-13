// Quiet hairline band shown above the WeekStrip on the Routine tab.
// Three stages keyed off calendar-day distance from the last scan:
//   locked  (25-27 days): muted, untappable, no chevron
//   ready   (28-35 days): live band, chevron, tappable
//   overdue (36+ days):   live band, chevron, tappable
//
// Visual: full-width band, faint Terracotta tint, hairline rules top + bottom,
// no border-radius. Replaces the earlier bordered-card treatment.

import { Text, TouchableOpacity, View } from 'react-native';
import { Palette } from '../../constants/theme';
import { cardinal } from '../../lib/utils/numbers';

export type RescanBannerStage = 'locked' | 'ready' | 'overdue' | 'hidden';

export function deriveBannerStage(daysSinceLastScan: number): RescanBannerStage {
  if (daysSinceLastScan < 25) return 'hidden';
  if (daysSinceLastScan <= 27) return 'locked';
  if (daysSinceLastScan <= 35) return 'ready';
  return 'overdue';
}

function labelForStage(stage: RescanBannerStage, issueNumberCardinal: string): string {
  const base = `Issue ${issueNumberCardinal}`;
  if (stage === 'locked')  return `${base} · coming`;
  if (stage === 'ready')   return `${base} · ready`;
  if (stage === 'overdue') return `${base} · waiting`;
  return base;
}

function bodyForStage(stage: RescanBannerStage, daysSinceLastScan: number): string {
  if (stage === 'locked') {
    const remaining = 28 - daysSinceLastScan;
    if (remaining <= 1) return 'Tomorrow.';
    if (remaining === 2) return 'Two days.';
    if (remaining === 3) return 'Three days.';
    return `${cardinal(remaining).charAt(0).toUpperCase() + cardinal(remaining).slice(1)} days.`;
  }
  if (stage === 'ready')   return 'A new reading awaits';
  if (stage === 'overdue') return 'A new reading is overdue';
  return '';
}

interface Props {
  daysSinceLastScan: number;
  scanCount:         number;
  onPress:           () => void;
}

// Hairline color — warm brown at low opacity. Matches the Cream + Terracotta
// register without crossing into the harder Palette.rule weight.
const HAIRLINE = 'rgba(140, 104, 72, 0.25)';
const TINT     = 'rgba(184, 83, 47, 0.06)';

export function RescanBanner({ daysSinceLastScan, scanCount, onPress }: Props) {
  const stage = deriveBannerStage(daysSinceLastScan);
  if (stage === 'hidden') return null;

  const tappable = stage === 'ready' || stage === 'overdue';
  const dimmed   = stage === 'locked';

  const issueNumberCardinal = cardinal(scanCount + 1);
  const label = labelForStage(stage, issueNumberCardinal).toUpperCase();
  const body  = bodyForStage(stage, daysSinceLastScan);

  const band = (
    <View
      style={{
        backgroundColor:   TINT,
        borderTopWidth:    0.5,
        borderBottomWidth: 0.5,
        borderTopColor:    HAIRLINE,
        borderBottomColor: HAIRLINE,
        paddingVertical:   13,
        paddingHorizontal: 32,
        flexDirection:     'row',
        alignItems:        'center',
        justifyContent:    'space-between',
        opacity:           dimmed ? 0.65 : 1,
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text
          style={{
            fontFamily:    'Inter_500Medium',
            fontSize:      9.5,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color:         Palette.accent,
            marginBottom:  4,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium_Italic',
            fontStyle:  'italic',
            fontSize:   16.5,
            lineHeight: 21,
            color:      Palette.ink,
          }}
        >
          {body}
        </Text>
      </View>
      {tappable && (
        <Text
          style={{
            fontFamily: 'CormorantGaramond_500Medium',
            fontSize:   16,
            color:      Palette.accent,
          }}
        >
          {'›'}
        </Text>
      )}
    </View>
  );

  if (!tappable) return band;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      {band}
    </TouchableOpacity>
  );
}
