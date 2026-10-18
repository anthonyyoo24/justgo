import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  Redirect,
  useFocusEffect,
  useNavigationContainerRef,
  useRouter,
} from 'expo-router';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import { SettingsGroup } from '../../../components/settings/SettingsRows';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { ExternalLinkButton } from '../../../components/ExternalLinkButton';
import { contactFailureMessage, supportContact } from '../../contact';
import { colors } from '../../../theme/tokens';
import type { IdentityController } from '../controller';
import { useIdentityAction } from '../useIdentityAction';

import { IdentityTextButton as TextButton } from './IdentityTextButton';
import { ReceivingTransferPanel } from './ReceivingTransferPanel';
import { RecoveryKeyForm } from './RecoveryKeyForm';
import { useIdentityConfirmation } from './useIdentityConfirmation';
import type { IdentityActionId } from './identity-actions';
import { identityScreenStyles as styles } from './identity-screen-styles';

export function IdentityScreen({
  controller,
  managed = false,
  recoveryOnly = false,
  onCreateAccount,
}: {
  controller: IdentityController;
  managed?: boolean;
  recoveryOnly?: boolean;
  onCreateAccount?: () => Promise<void>;
}) {
  const liveState = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [departure, setDeparture] = useState<ReturnType<
    IdentityController['getSnapshot']
  > | null>(null);
  const state = departure ?? liveState;
  const disabled = state.busy || departure !== null;
  const receivingTransfer =
    departure !== null || controller.hasReceivingTransfer();
  const [initialSessionId] = useState(
    () => controller.getSnapshot().account?.sessionId,
  );
  const [recoveryOpen, setRecoveryOpen] = useState(recoveryOnly);
  const [recoveryKey, setRecoveryKey] = useState('');
  const router = useRouter();
  const createAccount = onCreateAccount ?? controller.createAccount;
  const navigation: { getCurrentRoute(): { key: string } | undefined } =
    useNavigationContainerRef();
  const { activeAction, runAction } = useIdentityAction(controller);
  const {
    confirmation,
    confirm: selectConfirmation,
    cancelConfirmation,
    runConfirmation,
  } = useIdentityConfirmation(controller, runAction);
  const confirming = !!confirmation && activeAction === confirmation.id;
  const transferVisible =
    !confirming && (!!state.transfer || activeAction === 'restart-transfer');
  const recoveryVisible =
    confirmation?.recoveryVisible ?? (recoveryOpen && !receivingTransfer);
  const creationLabel = state.credentials.length
    ? 'Create a separate account'
    : 'Create a new account';
  useEffect(() => {
    if (!managed) void controller.initialize();
  }, [controller, managed]);
  const leaveReceivingTransfer = useCallback(() => {
    const current = controller.getSnapshot();
    // Keep the outgoing code card mounted until navigation covers it. The
    // controller still invalidates the transfer immediately and owns cleanup.
    if (current.transfer) setDeparture((previous) => previous ?? current);
    void controller.cancelTransfer();
  }, [controller]);
  useFocusEffect(
    useCallback(() => {
      setDeparture(null);
      return leaveReceivingTransfer;
    }, [leaveReceivingTransfer]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        setDeparture(null);
        controller.hideKey();
        setRecoveryKey('');
        void controller.cancelTransfer();
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
    id: IdentityActionId,
    action: () => Promise<void>,
  ) =>
    selectConfirmation(message, id, action, recoveryOpen && !receivingTransfer);
  const recoverAccount = async (work: () => Promise<void>) => {
    const routeKey = navigation.getCurrentRoute()?.key;
    const previousSession = controller.getSnapshot().account?.sessionId;
    await work();
    const account = controller.getSnapshot().account;
    // Account guards can remount this screen while recovery is in flight.
    // The initiating action retains its route/session boundary through that remount.
    if (
      recoveryOnly &&
      routeKey &&
      navigation.getCurrentRoute()?.key === routeKey &&
      account &&
      account.sessionId !== previousSession
    )
      router.replace('/recovery');
  };
  const recoverWithKey = async () => {
    if (state.busy) return;
    const value = recoveryKey;
    setRecoveryKey('');
    await recoverAccount(() => controller.recoverKey(value));
  };
  const finishTransfer = async () => {
    const routeKey = navigation.getCurrentRoute()?.key;
    await controller.redeemTransfer();
    // Finish the account transition before navigating, and keep a late result
    // from navigating after the user leaves. The controller owns failures.
    if (
      recoveryOnly &&
      routeKey &&
      navigation.getCurrentRoute()?.key === routeKey &&
      controller.getSnapshot().account &&
      !controller.getSnapshot().transfer
    )
      router.replace('/recovery');
  };
  const button = (
    id: IdentityActionId,
    label: string,
    action: () => Promise<void>,
  ) => (
    <PrimaryButton
      label={label}
      onPress={() => act(() => runAction(id, action))}
      busy={!confirming && activeAction === id && state.busy}
      disabled={disabled}
    />
  );
  if (state.deletionStatus === 'deleted') return <Redirect href="/welcome" />;
  if (state.deletionStatus === 'pending' || state.deletionStatus === 'cleanup')
    return <Redirect href="/delete-account" />;
  if (
    recoveryOnly &&
    !confirming &&
    activeAction !== 'finish-transfer' &&
    state.account &&
    state.account.sessionId !== initialSessionId
  )
    return <Redirect href="/recovery" />;
  const content = (
    <>
      {!managed && (
        <View style={styles.header}>
          <Text maxFontSizeMultiplier={2} style={styles.wordmark}>
            JustGO
          </Text>
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
              source={require('../../../../assets/illustrations/small-medal.png')}
              style={styles.image}
              contentFit="contain"
              accessible={false}
            />
          </View>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={2}
            style={styles.heading}
          >
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
      {!!state.message && !confirming && (
        <View style={styles.notice}>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            {state.message}
          </Text>
        </View>
      )}
      {state.busy &&
        !confirming &&
        !state.busyInBackground &&
        !state.initialized && (
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
              busy={confirming}
              disabled={disabled}
              onPress={() => act(runConfirmation)}
            />
            <TextButton
              label="Cancel"
              onPress={cancelConfirmation}
              disabled={disabled}
            />
          </View>
        </SettingsGroup>
      )}
      {state.account ? (
        !recoveryOnly && (
          <View style={styles.card}>
            <Text maxFontSizeMultiplier={2} style={styles.title}>
              Connected
            </Text>
            <Text style={styles.body}>
              Your private account is connected. No email or password.
            </Text>
          </View>
        )
      ) : (
        <>
          {!state.transfer &&
            (!state.hasPending || activeAction === 'create-account') &&
            state.initialized &&
            button(
              'create-account',
              creationLabel,
              state.credentials.length
                ? async () => {
                    confirm(
                      'Create a separate empty account? This will not merge or recover any existing progress.',
                      'create-account',
                      createAccount,
                    );
                  }
                : createAccount,
            )}
        </>
      )}
      {(!state.account || recoveryOnly) && (
        <>
          {transferVisible && (
            <ReceivingTransferPanel
              transfer={state.transfer}
              disabled={disabled}
              finishing={
                !confirming && activeAction === 'finish-transfer' && state.busy
              }
              restarting={activeAction === 'restart-transfer'}
              onFinish={() =>
                act(() => runAction('finish-transfer', finishTransfer))
              }
              onRestart={() =>
                act(() =>
                  runAction('restart-transfer', controller.startTransfer),
                )
              }
            />
          )}
          {!transferVisible && confirmation?.id !== 'start-transfer' && (
            <TextButton
              label="Transfer from another device"
              busy={!confirming && activeAction === 'start-transfer'}
              onPress={() => {
                if (state.account) {
                  confirm(
                    'Transfer an account from another device? This phone will switch accounts after approval. Leaving this screen or closing JustGO cancels the unfinished transfer. Your accounts and saved history will stay separate.',
                    'start-transfer',
                    controller.startTransfer,
                  );
                  return;
                }
                act(() =>
                  runAction('start-transfer', controller.startTransfer),
                );
              }}
              disabled={disabled}
            />
          )}
        </>
      )}
      {!recoveryOnly && (recoveryVisible || !receivingTransfer) && (
        <TextButton
          label={
            recoveryOpen
              ? 'Close recovery options'
              : 'Recover an existing account'
          }
          disabled={disabled}
          onPress={() => setRecoveryOpen(!recoveryOpen)}
        />
      )}
      {recoveryVisible && (
        <RecoveryKeyForm
          value={recoveryKey}
          onChange={setRecoveryKey}
          onSubmit={() => act(() => runAction('recover-key', recoverWithKey))}
          disabled={disabled}
          busy={!confirming && activeAction === 'recover-key' && state.busy}
        >
          {state.credentials.map((credential, index) => (
            <TextButton
              key={credential.id}
              label={`Recover saved credential ${index + 1} (${credential.id.slice(0, 8)})`}
              disabled={disabled}
              busy={
                !confirming &&
                activeAction === `recover-credential:${credential.id}`
              }
              onPress={() =>
                confirm(
                  'Switch to the account linked to this credential? No accounts or history will be merged.',
                  `recover-credential:${credential.id}`,
                  () =>
                    recoverAccount(() =>
                      controller.recoverCredential(credential.id),
                    ),
                )
              }
            />
          ))}
          <Text style={styles.small}>
            If iCloud sync is delayed, wait and retry. A purchase receipt cannot
            recover private history.
          </Text>
          {(state.hasPending || state.account) && (
            <TextButton
              label="Create a separate empty account"
              disabled={disabled}
              busy={!confirming && activeAction === 'create-separate-account'}
              onPress={() =>
                confirm(
                  'Create a separate empty account? Existing accounts and credentials will be kept separate. This does not recover or merge your previous progress.',
                  'create-separate-account',
                  createAccount,
                )
              }
            />
          )}
        </RecoveryKeyForm>
      )}
      {!confirming &&
        !transferVisible &&
        (!!state.message || activeAction === 'retry-connection') && (
          <TextButton
            label="Retry connection"
            busy={activeAction === 'retry-connection'}
            onPress={() =>
              act(() => runAction('retry-connection', controller.retry))
            }
            disabled={disabled}
          />
        )}
      {!recoveryOnly && (
        <ExternalLinkButton
          label="Get help"
          url={supportContact}
          failureMessage={contactFailureMessage}
          channel="activity"
        />
      )}
    </>
  );
  if (managed)
    return (
      <SettingsPage
        title={recoveryOnly ? 'Recover an account' : 'Account & recovery'}
        backHref={recoveryOnly ? '/recovery' : '/settings'}
        onBack={
          receivingTransfer
            ? () => {
                leaveReceivingTransfer();
                router.dismissTo(recoveryOnly ? '/recovery' : '/settings');
              }
            : undefined
        }
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
