import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Redirect } from 'expo-router';
import { SettingsPage } from '../../components/settings/SettingsPage';
import { SettingsGroup } from '../../components/settings/SettingsRows';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ExternalLinkButton } from '../../components/ExternalLinkButton';
import { contactFailureMessage, supportContact } from '../contact';
import { colors, layout, radii, spacing, typography } from '../../theme/tokens';
import { createIdentityApi } from './api';
import { IdentityController } from './controller';
import { createVault } from './vault';
import { useIdentityAction } from './useIdentityAction';

function TextButton({
  label,
  onPress,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.65 }]}
    >
      <View style={styles.textButtonContent}>
        <Text style={styles.link}>{label}</Text>
        {busy && (
          <ActivityIndicator
            color={colors.ink}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${label} in progress`}
          />
        )}
      </View>
    </Pressable>
  );
}
export function IdentityScreen({
  controller: provided,
  managed = false,
  recoveryOnly = false,
}: {
  controller?: IdentityController;
  managed?: boolean;
  recoveryOnly?: boolean;
}) {
  const [controller] = useState(
    () =>
      provided ??
      new IdentityController(
        createVault(),
        createIdentityApi(process.env.EXPO_PUBLIC_API_URL),
      ),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [initialSessionId] = useState(
    () => controller.getSnapshot().account?.sessionId,
  );
  const [recoveryOpen, setRecoveryOpen] = useState(recoveryOnly);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [confirmation, setConfirmation] = useState<{
    message: string;
    action: () => Promise<void>;
    name: string;
  } | null>(null);
  const { activeAction, runAction } = useIdentityAction(controller);
  const creationLabel = state.credentials.length
    ? 'Create a separate account'
    : 'Create a private account';
  useEffect(() => {
    if (!managed) void controller.initialize();
  }, [controller, managed]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        controller.hideKey();
        setRecoveryKey('');
      } else if (!managed) {
        void controller.retry({
          background: !!controller.getSnapshot().account,
        });
      }
    });
    return () => {
      subscription.remove();
      controller.hideKey();
    };
  }, [controller, managed]);
  const act = (work: () => Promise<void>) => {
    void work();
  };
  const confirm = (
    message: string,
    name: string,
    action: () => Promise<void>,
  ) => setConfirmation({ message, name, action });
  const recoverWithKey = async () => {
    if (state.busy) return;
    const value = recoveryKey;
    setRecoveryKey('');
    await controller.recoverKey(value);
  };
  const button = (label: string, action: () => Promise<void>) => (
    <PrimaryButton
      label={label}
      onPress={() => act(() => runAction(label, action))}
      busy={activeAction === label && state.busy}
      disabled={state.busy}
    />
  );
  if (
    recoveryOnly &&
    state.account &&
    state.account.sessionId !== initialSessionId
  )
    return <Redirect href="/recovery" />;
  const content = (
    <>
      {!managed && (
        <View style={styles.header}>
          <Text style={styles.wordmark}>JustGO</Text>
          <Text style={styles.eyebrow}>ACCOUNT & RECOVERY</Text>
        </View>
      )}
      {controller.vault.kind === 'memory' && (
        <View style={styles.notice}>
          <Text style={styles.small}>
            Browser testing only. Credentials stay in this tab’s memory and
            disappear when it closes or reloads. iPhone recovery is still
            awaiting device validation.
          </Text>
        </View>
      )}
      {!managed && (
        <View style={styles.hero}>
          <View style={styles.art}>
            <Image
              source={require('../../../assets/illustrations/small-medal.png')}
              style={styles.image}
              contentFit="contain"
              accessible={false}
            />
          </View>
          <Text accessibilityRole="header" style={styles.heading}>
            {state.account
              ? 'A place for your progress.'
              : 'Your courage.\nYour account.'}
          </Text>
          <Text style={styles.body}>
            {state.account
              ? 'Your private account is connected. No email, password or signup form needed.'
              : 'Your progress belongs to you. Connect securely, or recover an account you already have.'}
          </Text>
        </View>
      )}
      {!!state.message && (
        <View style={styles.notice}>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            {state.message}
          </Text>
        </View>
      )}
      {state.busy && !state.busyInBackground && !state.initialized && (
        <ActivityIndicator
          color={colors.ink}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Connecting account"
        />
      )}
      {confirmation && (
        <SettingsGroup title="Please confirm">
          <View style={styles.form}>
            <Text style={styles.body}>{confirmation.message}</Text>
            <PrimaryButton
              label="Confirm"
              disabled={state.busy}
              onPress={() => {
                const { name, action } = confirmation;
                setConfirmation(null);
                act(() => runAction(name, action));
              }}
            />
            <TextButton
              label="Cancel"
              onPress={() => setConfirmation(null)}
              disabled={state.busy}
            />
          </View>
        </SettingsGroup>
      )}
      {state.account ? (
        !recoveryOnly && (
          <View style={styles.card}>
            <Text style={styles.title}>Connected</Text>
            <Text style={styles.body}>
              Your private account is connected. No email or password.
            </Text>
          </View>
        )
      ) : (
        <>
          {!state.transfer &&
            (!state.hasPending || activeAction === creationLabel) &&
            state.initialized &&
            button(
              creationLabel,
              state.credentials.length
                ? async () => {
                    confirm(
                      'Create a separate empty account? This will not merge or recover any existing progress.',
                      creationLabel,
                      controller.createAccount,
                    );
                  }
                : controller.createAccount,
            )}
          {state.transfer && (
            <SettingsGroup title="Connect from your other device">
              <View style={styles.form}>
                <Text style={styles.body}>
                  Enter this code on your existing device:
                </Text>
                <Text selectable style={styles.verification}>
                  {state.transfer.code.match(/.{1,4}/g)?.join('-')}
                </Text>
                <Text style={styles.body}>
                  Then enter these six digits on your existing device:
                </Text>
                <Text selectable style={styles.verification}>
                  {state.transfer.verification}
                </Text>
                <Text style={styles.small}>
                  Expires at{' '}
                  {new Date(state.transfer.expiresAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  . Approval is required.
                </Text>
                {button('Check approval & finish', controller.redeemTransfer)}
                <TextButton
                  label="Start a new transfer"
                  disabled={state.busy}
                  busy={activeAction === 'Start a new transfer'}
                  onPress={() =>
                    act(() =>
                      runAction(
                        'Start a new transfer',
                        controller.startTransfer,
                      ),
                    )
                  }
                />
              </View>
            </SettingsGroup>
          )}
          <TextButton
            label="Transfer from another device"
            busy={activeAction === 'Transfer from another device'}
            onPress={() =>
              act(() =>
                runAction(
                  'Transfer from another device',
                  controller.startTransfer,
                ),
              )
            }
            disabled={state.busy}
          />
        </>
      )}
      {!recoveryOnly && (
        <TextButton
          label={
            recoveryOpen
              ? 'Close recovery options'
              : 'Recover an existing account'
          }
          disabled={state.busy}
          onPress={() => setRecoveryOpen(!recoveryOpen)}
        />
      )}
      {recoveryOpen && (
        <SettingsGroup title="Recover your account">
          <View style={styles.form}>
            <Text style={styles.body}>
              Recovering another account switches this device to that account.
              Your accounts stay separate.
            </Text>
            <TextInput
              accessibilityLabel="Recovery key"
              returnKeyType="done"
              onSubmitEditing={() =>
                act(() => runAction('Recover with key', recoverWithKey))
              }
              placeholder="Enter your private recovery key"
              placeholderTextColor={colors.ink}
              value={recoveryKey}
              onChangeText={setRecoveryKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="none"
              maxLength={80}
              style={styles.input}
            />
            {button('Recover with key', recoverWithKey)}
            {state.credentials.map((credential, index) => (
              <TextButton
                key={credential.id}
                label={`Recover saved credential ${index + 1} (${credential.id.slice(0, 8)})`}
                disabled={state.busy}
                busy={activeAction === `recover-credential:${credential.id}`}
                onPress={() =>
                  confirm(
                    'Switch to the account linked to this credential? No accounts or history will be merged.',
                    `recover-credential:${credential.id}`,
                    () => controller.recoverCredential(credential.id),
                  )
                }
              />
            ))}
            <Text style={styles.small}>
              If iCloud sync is delayed, wait and retry. A purchase receipt
              cannot recover private history.
            </Text>
            {(state.hasPending || state.account) && (
              <TextButton
                label="Create a separate empty account"
                disabled={state.busy}
                busy={activeAction === 'Create a separate empty account'}
                onPress={() =>
                  confirm(
                    'Create a separate empty account? Existing accounts and credentials will be kept separate. This does not recover or merge your previous progress.',
                    'Create a separate empty account',
                    controller.createAccount,
                  )
                }
              />
            )}
          </View>
        </SettingsGroup>
      )}
      {(!!state.message || activeAction === 'Retry connection') && (
        <TextButton
          label="Retry connection"
          busy={activeAction === 'Retry connection'}
          onPress={() =>
            act(() => runAction('Retry connection', controller.retry))
          }
          disabled={state.busy}
        />
      )}
      <ExternalLinkButton
        label="Get help"
        url={supportContact}
        failureMessage={contactFailureMessage}
        channel="activity"
      />
      <Text style={styles.footer}>JustGO · Your account, kept private</Text>
    </>
  );
  if (managed)
    return (
      <SettingsPage
        title={recoveryOnly ? 'Recover an account' : 'Account & recovery'}
        backHref={recoveryOnly ? '/recovery' : '/settings'}
      >
        {content}
      </SettingsPage>
    );
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.content}>{content}</View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    padding: spacing.screen,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  wordmark: { ...typography.heading, color: colors.ink },
  eyebrow: {
    ...typography.caption,
    color: colors.ink,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.cream,
  },
  art: {
    width: 120,
    height: 100,
    mixBlendMode: 'multiply',
  },
  image: { width: '100%', height: '100%' },
  heading: { ...typography.display, color: colors.ink, textAlign: 'center' },
  body: { ...typography.body, color: colors.ink },
  small: { ...typography.caption, color: colors.ink },
  title: {
    ...typography.heading,
    fontSize: 25,
    lineHeight: 29,
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  form: { padding: spacing.lg, gap: spacing.lg },
  notice: {
    padding: spacing.lg,
    backgroundColor: colors.peach,
    borderRadius: radii.small,
  },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  textButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  link: {
    ...typography.label,
    color: colors.ink,
    textDecorationLine: 'underline',
    textAlign: 'center',
    flexShrink: 1,
  },
  input: {
    ...typography.body,
    color: colors.ink,
    minHeight: 52,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.small,
    backgroundColor: colors.white,
  },
  verification: {
    ...typography.heading,
    fontSize: 24,
    lineHeight: 32,
    color: colors.ink,
    textAlign: 'center',
  },
  footer: {
    ...typography.caption,
    color: colors.ink,
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
});
