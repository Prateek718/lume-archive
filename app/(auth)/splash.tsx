import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { ChapterLabel, Rule, PrimaryButton } from '../../components/editorial';
import { Palette, Type } from '../../constants/theme';

export default function Splash() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: Palette.bg }}>
        <View style={{ flex: 1, paddingHorizontal: 32 }}>
          <View style={{ paddingTop: 24 }}>
            <ChapterLabel>Issue · One</ChapterLabel>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text
              style={{
                fontFamily: 'CormorantGaramond_500Medium_Italic',
                fontStyle: 'italic',
                fontSize: 74,
                letterSpacing: -1.5,
                color: Palette.ink,
              }}
            >
              Lumé
            </Text>
            <View style={{ height: 28 }} />
            <Rule length="short" tone="accent" />
            <View style={{ height: 20 }} />
            <Text
              style={{
                fontFamily: 'CormorantGaramond_400Regular_Italic',
                fontStyle: 'italic',
                fontSize: 15,
                color: Palette.ink3,
              }}
            >
              be you
            </Text>
          </View>

          <View style={{ position: 'absolute', bottom: 88, left: 32, right: 32 }}>
            <PrimaryButton label="Begin" onPress={() => router.push('/(auth)/signup')} />
            <View style={{ height: 14 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={[Type.body, { fontSize: 12, color: Palette.ink3 }]}>Already a reader? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
                <Text
                  style={{
                    fontFamily: 'CormorantGaramond_400Regular_Italic',
                    fontStyle: 'italic',
                    fontSize: 14,
                    color: Palette.ink,
                  }}
                >
                  Sign in
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
