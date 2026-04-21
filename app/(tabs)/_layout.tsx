import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';

function RoutineIcon({ color }: { color: string }) {
  return (
    <View style={ic.checklist}>
      <View style={ic.checklistRow}>
        <View style={[ic.checklistBox, { borderColor: color }]} />
        <View style={[ic.checklistLine, { backgroundColor: color }]} />
      </View>
      <View style={ic.checklistRow}>
        <View style={[ic.checklistBox, { borderColor: color }]} />
        <View style={[ic.checklistLine, { backgroundColor: color, width: 10 }]} />
      </View>
    </View>
  );
}

function SalonsIcon({ color }: { color: string }) {
  return (
    <View style={ic.building}>
      <View style={[ic.buildingTop, { borderColor: color }]} />
      <View style={[ic.buildingBase, { backgroundColor: color }]} />
    </View>
  );
}

function ProfileIcon({ color }: { color: string }) {
  return (
    <View style={ic.iconPerson}>
      <View style={[ic.iconHead, { borderColor: color }]} />
      <View style={[ic.iconBody, { borderColor: color }]} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      initialRouteName="routine"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopWidth:  0,
          height:          60 + insets.bottom,
          paddingBottom:   8 + insets.bottom,
          paddingTop:      6,
        },
        tabBarActiveTintColor:   Colors.tabActive,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarLabelStyle: {
          fontSize:      10,
          letterSpacing: 0.5,
          fontWeight:    '500',
        },
      }}
    >
      <Tabs.Screen
        name="routine"
        options={{
          title:      'Routine',
          tabBarIcon: ({ color }) => <RoutineIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title:      'Discover',
          tabBarIcon: ({ color }) => <SalonsIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title:      'Profile',
          tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
        }}
      />
    </Tabs>
  );
}

const ic = StyleSheet.create({
  // Routine (checklist)
  checklist:     { gap: 4 },
  checklistRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checklistBox:  { width: 7, height: 7, borderRadius: 2, borderWidth: 1.5 },
  checklistLine: { height: 1.5, width: 12, borderRadius: 1 },

  // Salons (building)
  building:     { alignItems: 'center', gap: 0 },
  buildingTop:  { width: 18, height: 10, borderTopLeftRadius: 3, borderTopRightRadius: 3, borderWidth: 2, borderBottomWidth: 0 },
  buildingBase: { width: 20, height: 6, borderRadius: 1 },

  // Profile (person)
  iconPerson: { alignItems: 'center' },
  iconHead:   { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  iconBody:   { width: 16, height: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 2, borderBottomWidth: 0, marginTop: 1 },
});
