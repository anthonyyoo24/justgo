import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Stack,
  useIsFocused,
  useNavigation,
  useRouter,
  type NativeStackNavigationProp,
} from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useRuntime } from '../../app-support/providers/AppProvider';
import { useDelayedBusy } from '../../lib/useDelayedBusy';
import { ActiveChallengeContent } from './ActiveChallengeContent';
import { useChallengeActivity } from './ChallengeActivityProvider';
import { SuccessView } from './SuccessView';

/** Keep Active → Success in one native surface; only Continue changes routes. */
export function ChallengeFlowScreen() {
  const { challenges } = useRuntime();
  const { active, finish, insets, markPresented } = useChallengeActivity();
  const navigation =
    useNavigation<NativeStackNavigationProp<{ challenge: undefined }>>();
  const [entered, setEntered] = useState(false);
  const [visualReady, setVisualReady] = useState(false);
  const onVisualReady = useCallback(() => setVisualReady(true), []);
  useLayoutEffect(
    () =>
      navigation.addListener('transitionEnd', (event) => {
        if (!event.data.closing) setEntered(true);
      }),
    [navigation],
  );
  useEffect(() => {
    if (active && entered && visualReady) markPresented(active);
  }, [active, entered, visualReady, markPresented]);
  const state = useSyncExternalStore(
    challenges.subscribe,
    challenges.getSnapshot,
    challenges.getSnapshot,
  );
  const router = useRouter();
  const focused = useIsFocused();
  const savingVisible = useDelayedBusy(state.saving && focused);
  useEffect(() => {
    if (!focused) return;
    if (!active) {
      router.dismissTo('/(tabs)');
    }
  }, [active, focused, router]);
  if (!active) return null;
  const completed = !!state.success;
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ gestureEnabled: completed }} />
      {/* Prepare layout/artwork beneath the opaque active surface. Revealing the
          existing view avoids a first-frame inset shift or image decode flash. */}
      <View
        style={styles.screen}
        pointerEvents={completed ? 'auto' : 'none'}
        accessibilityElementsHidden={!completed}
        importantForAccessibility={completed ? 'auto' : 'no-hide-descendants'}
      >
        <SuccessView
          insets={insets}
          onContinue={() => {
            if (state.success) {
              router.replace({
                pathname: '/reflection',
                params: { attemptId: state.success.id },
              });
            }
          }}
        />
      </View>
      {!completed && (
        <View style={StyleSheet.absoluteFill}>
          <ActiveChallengeContent
            start={active}
            insets={insets}
            onVisualReady={onVisualReady}
            error={state.error}
            saving={state.saving}
            completed={false}
            completionStarted={state.completionStarted}
            savingVisible={savingVisible}
            finish={finish}
          />
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({ screen: { flex: 1 } });
