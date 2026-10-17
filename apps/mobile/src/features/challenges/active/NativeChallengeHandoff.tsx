import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { ActiveChallengeContent } from './ActiveChallengeContent';
import { useChallengeActivity } from './ChallengeActivityProvider';
import type { ChallengeStart } from '../controller';

/** Cover iOS's native push only after the accepted view is laid out and decoded. */
export function NativeChallengeHandoff({ start }: { start: ChallengeStart }) {
  const { insets, finish } = useChallengeActivity();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const pushed = useRef(false);
  const onVisualReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    if (ready && !pushed.current) {
      pushed.current = true;
      router.push('/challenge');
    }
  }, [ready, router]);
  return (
    <FullWindowOverlay unstable_accessibilityContainerViewIsModal={ready}>
      <View
        testID="native-challenge-handoff"
        style={[styles.surface, { opacity: ready ? 1 : 0 }]}
        pointerEvents={ready ? 'auto' : 'none'}
        accessibilityElementsHidden={!ready}
        importantForAccessibility={ready ? 'auto' : 'no-hide-descendants'}
      >
        <ActiveChallengeContent
          start={start}
          insets={insets}
          onVisualReady={onVisualReady}
          toastHostEnabled={false}
          error=""
          saving
          completed={false}
          completionStarted={false}
          savingVisible={false}
          finish={finish}
        />
      </View>
    </FullWindowOverlay>
  );
}
const styles = StyleSheet.create({ surface: { flex: 1 } });
