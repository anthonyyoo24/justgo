import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useActivityState, useIdentity } from '../providers/AppProvider';
import { useMotionPreferences } from '../../platform/motion/motion';
import { useHapticPreferences } from '../../platform/haptics/haptics';
import { colors } from '../../theme/tokens';
import { hideNativeSplash } from './native-splash';

/** Also wraps fatal startup errors, which must remain visible outside providers. */
export function StartupSurface({
  ready,
  children,
}: PropsWithChildren<{ ready: boolean }>) {
  const [laidOut, setLaidOut] = useState(false);
  const released = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web' || !ready || !laidOut || released.current) return;
    released.current = true;
    hideNativeSplash();
  }, [ready, laidOut]);

  if (Platform.OS === 'web') return <>{children}</>;
  return (
    <View
      testID="native-startup-surface"
      onLayout={() => setLaidOut(true)}
      style={styles.surface}
    >
      {children}
    </View>
  );
}

/** A native launch waits for local providers, independently of server admission. */
export function AppStartup({ children }: PropsWithChildren) {
  const identity = useIdentity();
  const { repository, state } = useActivityState();
  const motion = useMotionPreferences();
  const haptics = useHapticPreferences();
  const collection =
    identity.needsWelcome || identity.deletionStatus
      ? null
      : 'collectionId' in identity && typeof identity.collectionId === 'string'
        ? identity.collectionId
        : (identity.account?.userId ?? null);
  // Failed local reads must expose the app's recovery UI, rather than trap it
  // behind the native splash. No account's old repository can satisfy readiness.
  const journalReady =
    !collection ||
    (repository?.accountId === collection &&
      (!!state?.ready || !!state?.hydrationError));
  const ready =
    identity.initialized && journalReady && !motion.loading && !haptics.loading;
  return <StartupSurface ready={ready}>{children}</StartupSurface>;
}

const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.cream },
});
