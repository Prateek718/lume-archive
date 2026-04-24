import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Palette } from '../../constants/theme';
import { TabIcon } from '../../components/editorial';

type TabIconName = 'routine' | 'discover' | 'profile';

function routeNameToIcon(routeName: string): TabIconName {
  if (routeName === 'routine')  return 'routine';
  if (routeName === 'discover') return 'discover';
  if (routeName === 'profile')  return 'profile';
  throw new Error(`Unknown tab route: ${routeName}`);
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection:   'row',
        backgroundColor: Palette.bgElev,
        borderTopWidth:  1,
        borderTopColor:  Palette.rule,
        paddingTop:      12,
        paddingBottom:   18 + insets.bottom,
      }}
    >
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key];
        const label    = (options.title as string | undefined) ?? route.name;
        const isActive = state.index === i;

        const onPress = () => {
          const event = navigation.emit({
            type:              'tabPress',
            target:            route.key,
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
            style={{
              flex:            1,
              alignItems:      'center',
              justifyContent:  'center',
              gap:             4,
              paddingVertical: 4,
            }}
            accessibilityRole="button"
            accessibilityState={isActive ? { selected: true } : {}}
          >
            <TabIcon name={routeNameToIcon(route.name)} active={isActive} />
            <Text
              style={
                isActive
                  ? {
                      fontFamily: 'CormorantGaramond_400Regular_Italic',
                      fontStyle:  'italic',
                      fontSize:   13,
                      color:      Palette.ink,
                    }
                  : {
                      fontFamily:    'Inter_400Regular',
                      fontSize:      11,
                      color:         Palette.ink3,
                      letterSpacing: 0.2,
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
      <Tabs.Screen name="routine"  options={{ title: 'Routine' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="profile"  options={{ title: 'Profile' }} />
    </Tabs>
  );
}
