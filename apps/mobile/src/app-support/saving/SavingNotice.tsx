import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { useActivityState } from '../providers/AppProvider';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { actionableOperations } from './presentation';
import { SavingDetailsModal } from './SavingDetailsModal';

type NoticeOptions = {
  onNavigate?: ((proceed: () => void) => void) | undefined;
  navigationEnabled?: boolean;
  toastChannel?: string;
};
// Every notice host shares one dismissal per repository, so a sheet does not
// bring back a notice the user closed on the screen beneath it.
const dismissedIssues = new WeakMap<object, string>();
const dismissalListeners = new Set<() => void>();
function subscribeDismissals(listener: () => void) {
  dismissalListeners.add(listener);
  return () => {
    dismissalListeners.delete(listener);
  };
}
function setDismissedIssue(repository: object, issueKey: string | null) {
  if (dismissedIssues.get(repository) === (issueKey ?? undefined)) return;
  if (issueKey === null) dismissedIssues.delete(repository);
  else dismissedIssues.set(repository, issueKey);
  for (const listener of dismissalListeners) listener();
}

export function SavingNotice(options: NoticeOptions = {}) {
  const { repository, state } = useActivityState();
  const operations = state ? actionableOperations(state) : [];
  const unreadable = state?.hydrationError === 'unreadable';
  const warning = !!state?.warning?.visible;
  const resolved = !unreadable && !warning && !operations.length;
  useEffect(() => {
    // Forget a resolved episode, so a later failure can be announced again.
    if (repository && resolved) setDismissedIssue(repository, null);
  }, [repository, resolved]);
  if (!state || !repository || resolved) return null;
  const episode = `${unreadable ? 'storage' : ''}:${state.warning?.episode ?? ''}:${operations.map((operation) => `${operation.id}:${operation.state}:${operation.code}`).join(',')}`;
  return (
    <NoticeEpisode
      issueKey={episode}
      {...options}
      repository={repository}
      unreadable={unreadable}
      warning={warning}
    />
  );
}
function NoticeEpisode({
  repository,
  issueKey,
  unreadable,
  warning,
  onNavigate,
  navigationEnabled = true,
  toastChannel = 'activity',
}: NoticeOptions & {
  repository: NonNullable<ReturnType<typeof useActivityState>['repository']>;
  issueKey: string;
  unreadable: boolean;
  warning: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [expandedFor, setExpandedFor] = useState<typeof repository | null>(
    null,
  );
  const hidden =
    useSyncExternalStore(subscribeDismissals, () =>
      dismissedIssues.get(repository),
    ) === issueKey;
  const expanded = expandedFor === repository;
  const copy =
    noticeCopy[unreadable ? 'unreadable' : warning ? 'warning' : 'upload'];
  return (
    <>
      {!hidden && (
        <View
          pointerEvents="box-none"
          testID="saving-notice-overlay"
          style={[
            styles.overlay,
            {
              top: insets.top + spacing.sm,
              left: insets.left + spacing.lg,
              right: insets.right + spacing.lg,
            },
          ]}
        >
          <View
            style={styles.notice}
            testID={warning ? 'saving-risk-banner' : 'saving-problem-notice'}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.review}
              onPress={() => setExpandedFor(repository)}
              style={styles.details}
            >
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={styles.copy}
              >
                {copy.title}
              </Text>
              <Text style={styles.link}>Details</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.close}
              onPress={() => {
                setDismissedIssue(repository, issueKey);
                if (warning) repository.dismissWarning();
              }}
              style={styles.close}
            >
              <Text style={styles.closeLabel}>×</Text>
            </Pressable>
          </View>
        </View>
      )}
      {expanded && (
        <SavingDetailsModal
          onClose={() => setExpandedFor(null)}
          onNavigate={onNavigate}
          navigationEnabled={navigationEnabled}
          toastChannel={toastChannel}
        />
      )}
    </>
  );
}
const noticeCopy = {
  unreadable: {
    title: 'Your saved entries couldn’t load',
    review: 'Review saved entries that couldn’t load',
    close: 'Close saved entries warning',
  },
  warning: {
    title: 'New activity isn’t saved yet',
    review: 'Review saving warning',
    close: 'Close saving warning',
  },
  upload: {
    title: 'Some activity needs attention',
    review: 'Review activity that couldn’t upload',
    close: 'Close upload warning',
  },
};
const styles = StyleSheet.create({
  overlay: { position: 'absolute', zIndex: 100 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.peach,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  details: { flex: 1, minHeight: 44, padding: spacing.md, gap: spacing.xs },
  copy: { ...typography.caption, color: colors.ink },
  link: {
    ...typography.caption,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  closeLabel: { ...typography.body, fontSize: 24, color: colors.ink },
});
