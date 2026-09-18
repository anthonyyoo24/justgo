import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router/js-tabs';
import { colors, typography } from '../../theme/tokens';
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
        tabBarStyle: {
          backgroundColor: colors.navy,
          borderTopColor: colors.navyBorder,
          height: 76 + insets.bottom,
          paddingTop: 10,
          paddingBottom: 14 + insets.bottom,
        },
        tabBarLabelStyle: typography.caption,
        sceneStyle: { backgroundColor: colors.paper },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home',
          tabBarIcon: ({ color }) => (
            <NavigationIcon name="home" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarAccessibilityLabel: 'Progress',
          tabBarIcon: ({ color }) => (
            <NavigationIcon name="progress" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
