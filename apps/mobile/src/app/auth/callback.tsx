import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import {
  useIdentity,
  useRuntime,
} from '../../app-support/providers/AppProvider';

/** Supabase's PKCE code is exchanged by the managed Auth adapter at startup. */
export default function AuthCallbackRoute() {
  const state = useIdentity();
  const { identity } = useRuntime();
  const router = useRouter();
  if (state.account) return <Redirect href="/access" />;
  return (
    <Screen title="Signing in">
      {state.busy || !state.initialized ? (
        <ActivityIndicator accessibilityLabel="Finishing sign-in" />
      ) : (
        <>
          <Text accessibilityRole="alert">
            {state.message ||
              'Sign-in was not completed. Your saved data was kept.'}
          </Text>
          <PrimaryButton
            label="Try again"
            onPress={() => {
              void identity.retry();
            }}
          />
          <PrimaryButton
            label="Back to sign in"
            onPress={() => router.replace('/account/sign-in')}
          />
        </>
      )}
    </Screen>
  );
}
