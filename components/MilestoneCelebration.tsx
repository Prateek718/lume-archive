// Full-screen overlay shown when a user earns a milestone. Quiet tone —
// one symbol, serif title, body copy, one "Keep going" button.

import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Colors, Typography, Spacing, Radius } from '../constants/theme';
import { interpolateCopy, type MilestoneKey } from '../lib/milestones';

interface Props {
  milestoneKey: MilestoneKey;
  title:        string;
  copy:         string;
  context:      Record<string, unknown>;
  onDismiss:    () => void;
}

// One quiet unicode glyph per milestone. Kept deliberately understated —
// these aren't badges, they're bookmarks.
function glyphFor(key: MilestoneKey): string {
  switch (key) {
    case 'first_routine':     return '✓';
    case 'week_one':          return '✓';
    case 'consistency_30':    return '◆';
    case 'first_rescan':      return '◎';
    case 'first_improvement': return '↑';
    case 'year_one':          return '★';
    default:                  return '◦';
  }
}

export default function MilestoneCelebration({ milestoneKey, title, copy, context, onDismiss }: Props) {
  const interpolated = interpolateCopy(copy, context ?? {});
  return (
    <Modal
      visible
      transparent={false}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={s.screen}>
        <View style={s.inner}>
          <View style={s.iconCircle}>
            <Text style={s.icon}>{glyphFor(milestoneKey)}</Text>
          </View>
          <Text style={s.title}>{title}</Text>
          <Text style={s.copy}>{interpolated}</Text>
        </View>
        <TouchableOpacity style={s.button} onPress={onDismiss} activeOpacity={0.85}>
          <Text style={s.buttonText}>Keep going</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: {
    flex:              1,
    backgroundColor:   Colors.background,
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.xxxl,
    justifyContent:    'space-between',
  },
  inner: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width:           84,
    height:          84,
    borderRadius:    42,
    borderWidth:     1.5,
    borderColor:     Colors.accent,
    backgroundColor: Colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    Spacing.xl,
  },
  icon: {
    fontSize: 36,
    color:    Colors.accent,
    lineHeight: 42,
  },
  title: {
    fontFamily:   Typography.serif,
    fontSize:     Typography.size.xxl,
    color:        Colors.text,
    textAlign:    'center',
    marginBottom: Spacing.md,
  },
  copy: {
    fontSize:          Typography.size.md,
    color:             Colors.text2,
    textAlign:         'center',
    lineHeight:        22,
    paddingHorizontal: Spacing.md,
  },
  button: {
    backgroundColor:   Colors.accent,
    borderRadius:      Radius.input,
    paddingVertical:   14,
    alignItems:        'center',
  },
  buttonText: {
    color:         Colors.textOnAccent,
    fontSize:      Typography.size.md,
    fontWeight:    '600',
    letterSpacing: 0.3,
  },
});
