import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  AppProvider,
  useAccess,
  useIdentity,
} from '../app-support/providers/AppProvider';
import { SavingFeedbackShell } from '../app-support/saving/SavingFeedback';
import { colors } from '../theme/tokens';
import { ChallengeActivityProvider } from '../features/challenges/active/ChallengeActivityProvider';
import { MotionPreferencesProvider } from '../platform/motion/MotionPreferencesProvider';
import { HapticsPreferencesProvider } from '../platform/haptics/HapticsPreferencesProvider';
import { welcomeBackgroundColor } from '../app-support/identity/welcome/welcome-artwork';
import {
  WelcomeTransition,
  useWelcomeTransition,
} from '../app-support/identity/welcome/WelcomeTransition';

export { RouteErrorScreen as ErrorBoundary } from '../app-support/fallbacks/RouteErrorScreen';

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
      <MotionPreferencesProvider>
        <HapticsPreferencesProvider>
          <AppProvider>
            <SavingFeedbackShell>
              <WelcomeTransition>
                <ChallengeActivityProvider>
                  <Navigation />
                </ChallengeActivityProvider>
              </WelcomeTransition>
            </SavingFeedbackShell>
          </AppProvider>
        </HapticsPreferencesProvider>
      </MotionPreferencesProvider>
    </GestureHandlerRootView>
  );
}
function Navigation() {
  const access = useAccess();
  const identity = useIdentity();
  const deleted = identity.deletionStatus === 'deleted';
  const awaitingAccess = useWelcomeTransition();
  const welcome = deleted || identity.needsWelcome;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        contentStyle: {
          backgroundColor: welcome ? welcomeBackgroundColor : colors.cream,
        },
      }}
    >
      <Stack.Screen name="access" />
      <Stack.Screen name="acceptance" options={{ gestureEnabled: false }} />
      <Stack.Protected guard={welcome}>
        <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      {/* Removing these routes also removes the deleted account's Back history. */}
      <Stack.Protected guard={!deleted && !awaitingAccess}>
        <Stack.Screen name="settings" />
        <Stack.Screen name="delete-account" />
        <Stack.Screen name="recovery" />
        <Stack.Screen name="account/recover" />
        <Stack.Screen name="account/keys" />
        <Stack.Screen name="account/devices" />
        <Stack.Screen name="account/transfer" />
        <Stack.Screen name="account/troubleshooting" />
      </Stack.Protected>
      <Stack.Protected
        guard={
          !identity.deletionStatus &&
          !welcome &&
          !!identity.account &&
          !awaitingAccess &&
          access.verified
        }
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="(challenge)/challenge"
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="(challenge)/success"
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="(challenge)/reflection"
          options={{ gestureEnabled: false }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!welcome && __DEV__}>
        <Stack.Screen name="preview" />
      </Stack.Protected>
    </Stack>
  );
}
