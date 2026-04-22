import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Palette } from '../../constants/theme';

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: Palette.bgElev,
        borderTopWidth: 1,
        borderTopColor: Palette.rule,
        height: 72 + insets.bottom,
        paddingBottom: insets.bottom,
        paddingTop: 10,
      }}
    >
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key];
        const label = (options.title as string | undefined) ?? route.name;
        const isActive = state.index === i;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isActive && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityState={isActive ? { selected: true } : {}}
          >
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: isActive ? Palette.accent : 'transparent',
                marginBottom: 6,
              }}
            />
            <Text
              style={
                isActive
                  ? {
                      fontFamily: 'CormorantGaramond_400Regular_Italic',
                      fontStyle: 'italic',
                      fontSize: 13,
                      color: Palette.ink,
                    }
                  : {
                      fontFamily: 'Inter_400Regular',
                      fontSize: 12,
                      color: Palette.ink3,
                    }
              }
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="routine" options={{ title: 'Routine' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
