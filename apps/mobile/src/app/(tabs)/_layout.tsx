import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router/js-tabs';
import { colors } from '../../theme/tokens';
import { NavigationIcon } from '../../components/NavigationIcon';
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'none',
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.border,
        tabBarShowLabel: false,
        tabBarIconStyle: { marginTop: 5 + Math.min(insets.bottom, 5) },
        tabBarStyle: {
          backgroundColor: colors.navy,
          borderTopColor: colors.navyBorder,
          height: 52 + Math.min(insets.bottom, 12),
          paddingTop: 0,
          paddingBottom: Math.min(insets.bottom, 8),
        },
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <NavigationIcon name="home" color={color} active={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarAccessibilityLabel: 'Progress',
          tabBarIcon: ({ color, focused }) => (
            <NavigationIcon name="progress" color={color} active={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
