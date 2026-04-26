import { ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { BackButton, ChapterLabel, Display } from '../editorial';
import { Palette } from '../../constants/theme';

interface Props {
  chapter: string;
  title:   ReactNode;
  onBack:  () => void;
  tab:     string;
  onTab:   (t: string) => void;
  tabs:    string[];
}

export function DetailHeader({ chapter, title, onBack, tab, onTab, tabs }: Props) {
  return (
    <View style={{ paddingTop: 8, paddingHorizontal: 28 }}>
      <BackButton onPress={onBack} style={{ marginLeft: -8 }} />

      <View style={{ paddingTop: 24, paddingHorizontal: 4 }}>
        <ChapterLabel>{chapter}</ChapterLabel>
        <Display
          style={{
            marginTop:     14,
            fontSize:      36,
            lineHeight:    39,
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Display>
      </View>

      <View
        style={{
          marginTop:         26,
          flexDirection:     'row',
          gap:               4,
          borderBottomWidth: 1,
          borderBottomColor: Palette.rule,
        }}
      >
        {tabs.map(t => {
          const active = t === tab;
          return (
            <TouchableOpacity
              key={t}
              activeOpacity={0.7}
              onPress={() => onTab(t)}
              style={{
                paddingVertical:   10,
                marginRight:       24,
                marginBottom:     -1,
                borderBottomWidth: 1.5,
                borderBottomColor: active ? Palette.accent : 'transparent',
              }}
            >
              <Text
                style={{
                  fontFamily:     'Inter_500Medium',
                  fontSize:       12,
                  letterSpacing:  1.6,
                  textTransform:  'uppercase',
                  color:          active ? Palette.ink : Palette.ink3,
                }}
              >
                {t}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
