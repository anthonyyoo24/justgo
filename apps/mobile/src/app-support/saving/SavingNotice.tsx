import { useState } from 'react';
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
export function SavingNotice(options: NoticeOptions = {}) {
  const { repository, state } = useActivityState();
  if (!state || !repository) return null;
  const operations = actionableOperations(state);
  const unreadable = state.hydrationError === 'unreadable';
  const warning = !!state.warning?.visible;
  if (!unreadable && !warning && !operations.length) return null;
  const episode = `${unreadable ? 'storage' : ''}:${state.warning?.episode ?? ''}:${operations.map((operation) => `${operation.id}:${operation.state}:${operation.code}`).join(',')}`;
  // Unmount a resolved episode, so a later failure can be announced again.
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
  const [dismissedFor, setDismissedFor] = useState<{
    repository: typeof repository;
    key: string;
  } | null>(null);
  const hidden =
    dismissedFor?.repository === repository && dismissedFor.key === issueKey;
  const expanded = expandedFor === repository;
  const title = unreadable
    ? 'Your saved entries couldn’t load'
    : warning
      ? 'New activity isn’t saved yet'
      : 'Some activity needs attention';
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
              accessibilityLabel={
                unreadable
                  ? 'Review saved entries that couldn’t load'
                  : warning
                    ? 'Review saving warning'
                    : 'Review activity that couldn’t upload'
              }
              onPress={() => setExpandedFor(repository)}
              style={styles.details}
            >
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={styles.copy}
              >
                {title}
              </Text>
              <Text style={styles.link}>Details</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close saving warning"
              onPress={() => {
                setDismissedFor({ repository, key: issueKey });
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
