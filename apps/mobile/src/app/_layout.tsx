import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, Text, View } from 'react-native';
import { AppProvider, useAccess } from '../features/shell/AppProvider';
import { colors } from '../theme/tokens';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  if (error)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 28,
          backgroundColor: colors.cream,
        }}
      >
        <Text accessibilityRole="alert">
          The app’s fonts couldn’t load. Please reopen JustGO.
        </Text>
      </View>
    );
  if (!loaded)
    return (
      <ActivityIndicator
        accessibilityLabel="Loading JustGO"
        style={{ flex: 1, backgroundColor: colors.cream }}
        color={colors.ink}
      />
    );
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <AppProvider>
        <Navigation />
      </AppProvider>
    </GestureHandlerRootView>
  );
}
function Navigation() {
  const access = useAccess();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        contentStyle: { backgroundColor: colors.cream },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="recovery" />
      <Stack.Protected guard={access.verified}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="success" />
        <Stack.Screen name="reflection" />
      </Stack.Protected>
      <Stack.Protected guard={__DEV__}>
        <Stack.Screen name="preview" />
      </Stack.Protected>
    </Stack>
  );
}
