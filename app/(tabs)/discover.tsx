// Discover tab — header + single nav row to nearby salons. Sparse on
// purpose; reserved space for articles in a later phase. Rate / claim are
// reachable contextually from salon detail, not from this home screen.

import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Display } from '../../components/editorial';
import { Palette } from '../../constants/theme';

export default function DiscoverTab() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <View style={{ paddingTop: 64, paddingHorizontal: 32 }}>
        <Display style={{ fontSize: 36, lineHeight: 38 }}>
          <Text style={{
            fontFamily: 'CormorantGaramond_500Medium_Italic',
            fontStyle:  'italic',
          }}>
            Discover.
          </Text>
        </Display>

        <View style={{ marginTop: 32 }}>
          <ProfileRow
            label="Find nearby salons"
            note="Trusted, near you"
            onPress={() => router.push('/(discover)/nearby')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function ProfileRow({ label, note, onPress }: {
  label: string;
  note:  string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        paddingVertical:    18,
        borderTopWidth:     1,
        borderTopColor:     Palette.rule,
        borderBottomWidth:  1,
        borderBottomColor:  Palette.rule,
        flexDirection:      'row',
        justifyContent:     'space-between',
        alignItems:         'center',
      }}
    >
      <View>
        <Text style={{
          fontFamily: 'CormorantGaramond_500Medium_Italic',
          fontStyle:  'italic',
          fontSize:   20,
          color:      Palette.ink,
        }}>
          {label}
        </Text>
        <Text style={{
          fontFamily: 'Inter_400Regular',
          fontSize:   11.5,
          color:      Palette.ink3,
          marginTop:  2,
        }}>
          {note}
        </Text>
      </View>
      <Text style={{
        fontFamily: 'CormorantGaramond_400Regular_Italic',
        fontStyle:  'italic',
        fontSize:   13,
        color:      Palette.ink3,
      }}>
        →
      </Text>
    </TouchableOpacity>
  );
}
