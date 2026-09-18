import { useEffect, useState, useSyncExternalStore } from 'react';
import {
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
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, layout, radii, spacing, typography } from '../../theme/tokens';
import { createIdentityApi } from './api';
import { IdentityController } from './controller';
import { createVault } from './vault';

function TextButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.65 }]}
    >
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}
export function IdentityScreen({
  controller: provided,
  managed = false,
}: {
  controller?: IdentityController;
  managed?: boolean;
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
  const [panel, setPanel] = useState<
    'account' | 'keys' | 'transfer' | 'devices'
  >('account');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [transferCode, setTransferCode] = useState('');
  const [verification, setVerification] = useState('');
  const [confirmation, setConfirmation] = useState<{
    message: string;
    action: () => Promise<void>;
  } | null>(null);
  useEffect(() => {
    if (!managed) void controller.initialize();
  }, [controller, managed]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        controller.hideKey();
        setRecoveryKey('');
      } else if (!managed) {
        void controller.retry();
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
  const confirm = (message: string, action: () => Promise<void>) =>
    setConfirmation({ message, action });
  const reviewTransfer = async () => {
    if (state.busy) return;
    setVerification('');
    await controller.inspectTransfer(transferCode);
  };
  const approveTransfer = async () => {
    if (state.busy) return;
    await controller.approveTransfer(verification);
    setVerification('');
    if (!controller.getSnapshot().inspection) setTransferCode('');
  };
  const recoverWithKey = async () => {
    if (state.busy) return;
    const value = recoveryKey;
    setRecoveryKey('');
    await controller.recoverKey(value);
  };
  const button = (label: string, action: () => Promise<void>) => (
    <PrimaryButton
      label={label}
      onPress={() => act(action)}
      busy={state.busy}
    />
  );
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.wordmark}>JustGO</Text>
            <Text style={styles.eyebrow}>ACCOUNT & RECOVERY</Text>
          </View>
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
          {managed && state.account && (
            <View style={styles.panels}>
              {(
                [
                  ['account', 'Account'],
                  ['keys', 'Recovery keys'],
                  ['transfer', 'Device transfer'],
                  ['devices', 'Manage devices'],
                ] as const
              ).map(([id, label]) => (
                <TextButton
                  key={id}
                  label={label}
                  onPress={() => {
                    controller.hideKey();
                    setPanel(id);
                  }}
                  disabled={state.busy}
                />
              ))}
            </View>
          )}
          {!!state.message && (
            <View style={styles.notice}>
              <Text accessibilityLiveRegion="polite" style={styles.body}>
                {state.message}
              </Text>
            </View>
          )}
          {state.busy && (
            <Text accessibilityLiveRegion="polite" style={styles.small}>
              Connecting securely…
            </Text>
          )}
          {confirmation && (
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.title}>
                Please confirm
              </Text>
              <Text style={styles.body}>{confirmation.message}</Text>
              {button('Confirm', async () => {
                const action = confirmation.action;
                setConfirmation(null);
                await action();
              })}
              <TextButton
                label="Cancel"
                onPress={() => setConfirmation(null)}
                disabled={state.busy}
              />
            </View>
          )}
          {state.account ? (
            <>
              {(!managed || panel === 'account') && (
                <View style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.title}>Connected</Text>
                    <Text style={styles.badge}>PRIVATE ACCOUNT</Text>
                  </View>
                  <Text selectable style={styles.small}>
                    Account {state.account.userId.slice(0, 8)}
                  </Text>
                  <Text style={styles.body}>
                    Challenges and your progress are coming in the next phases.
                  </Text>
                  <TextButton
                    label="Refresh account"
                    onPress={() => act(controller.refresh)}
                    disabled={state.busy}
                  />
                  <TextButton
                    label="Renew this session"
                    onPress={() => act(controller.renew)}
                    disabled={state.busy}
                  />
                </View>
              )}
              {(!managed || panel === 'keys') && (
                <View style={styles.card}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Keep a way back.
                  </Text>
                  <Text style={styles.body}>
                    iCloud Keychain recovery depends on your device settings. A
                    private recovery key gives you another way back.
                  </Text>
                  {button('Show recovery key', controller.saveKey)}
                  {state.key && (
                    <View style={styles.keyBox}>
                      <Text style={styles.small}>
                        Save this somewhere private. Anyone with it can access
                        your account.
                      </Text>
                      <Text selectable style={styles.secret}>
                        {state.key.match(/.{1,8}/g)?.join(' ')}
                      </Text>
                      <TextButton
                        label="Hide recovery key"
                        onPress={controller.hideKey}
                      />
                    </View>
                  )}
                  {state.recoveryKeys
                    .filter((k) => k.kind === 'key' && !k.revokedAt)
                    .map((key) => (
                      <TextButton
                        key={key.id}
                        label={`Revoke recovery key ${key.id.slice(0, 8)}`}
                        disabled={state.busy}
                        onPress={() =>
                          confirm(
                            'This key will stop recovering your account. Your active devices will remain signed in.',
                            () => controller.revokeCredential(key.id),
                          )
                        }
                      />
                    ))}
                </View>
              )}
              {(!managed || panel === 'transfer') && (
                <View style={styles.card}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Approve a new device.
                  </Text>
                  <Text style={styles.body}>
                    On your new device, choose “Transfer from another device.”
                    Enter the code shown there.
                  </Text>
                  <TextInput
                    accessibilityLabel="Transfer code"
                    returnKeyType="done"
                    onSubmitEditing={() => act(reviewTransfer)}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    placeholderTextColor={colors.ink}
                    value={transferCode}
                    onChangeText={setTransferCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={24}
                    style={styles.input}
                  />
                  {button('Review transfer', reviewTransfer)}
                  {state.inspection && (
                    <View style={styles.keyBox}>
                      <Text style={styles.body}>
                        Enter the six verification digits shown on your new
                        device. Only approve a device you are setting up.
                      </Text>
                      <TextInput
                        accessibilityLabel="Verification digits"
                        returnKeyType="done"
                        onSubmitEditing={() => act(approveTransfer)}
                        placeholder="Six digits from your new device"
                        placeholderTextColor={colors.ink}
                        value={verification}
                        onChangeText={setVerification}
                        keyboardType="number-pad"
                        autoCorrect={false}
                        maxLength={6}
                        style={styles.input}
                      />
                      {button('Approve this device', approveTransfer)}
                    </View>
                  )}
                </View>
              )}
              {(!managed || panel === 'devices') && (
                <View style={styles.card}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Your devices
                  </Text>
                  <TextButton
                    label="Refresh devices"
                    onPress={() => act(controller.refresh)}
                    disabled={state.busy}
                  />
                  {state.devices.map((device) => (
                    <View key={device.id} style={styles.device}>
                      <Text style={styles.body}>
                        {device.id === state.account!.deviceId
                          ? 'This device'
                          : 'Other device'}{' '}
                        · {device.id.slice(0, 8)}
                      </Text>
                      {device.revokedAt ? (
                        <Text style={styles.small}>Revoked</Text>
                      ) : (
                        <TextButton
                          label={`Revoke device ${device.id.slice(0, 8)}`}
                          disabled={state.busy}
                          onPress={() =>
                            confirm(
                              'This device’s sessions will stop working. Recovery credentials remain valid until separately revoked.',
                              () => controller.revokeDevice(device.id),
                            )
                          }
                        />
                      )}
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <>
              {!state.transfer &&
                !state.hasPending &&
                state.initialized &&
                button(
                  state.credentials.length
                    ? 'Create a separate account'
                    : 'Create a private account',
                  state.credentials.length
                    ? async () => {
                        confirm(
                          'Create a separate empty account? This will not merge or recover any existing progress.',
                          controller.createAccount,
                        );
                      }
                    : controller.createAccount,
                )}
              {state.transfer && (
                <View style={styles.card}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Connect from your other device.
                  </Text>
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
                    onPress={() => act(controller.startTransfer)}
                  />
                </View>
              )}
              <TextButton
                label="Transfer from another device"
                onPress={() => act(controller.startTransfer)}
                disabled={state.busy}
              />
            </>
          )}
          <TextButton
            label={
              recoveryOpen
                ? 'Close recovery options'
                : 'Recover an existing account'
            }
            disabled={state.busy}
            onPress={() => setRecoveryOpen(!recoveryOpen)}
          />
          {recoveryOpen && (
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.title}>
                Welcome back.
              </Text>
              <Text style={styles.body}>
                Recovering another account switches this device to that account.
                Your accounts stay separate.
              </Text>
              <TextInput
                accessibilityLabel="Recovery key"
                returnKeyType="done"
                onSubmitEditing={() => act(recoverWithKey)}
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
                  onPress={() =>
                    confirm(
                      'Switch to the account linked to this credential? No accounts or history will be merged.',
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
                  onPress={() =>
                    confirm(
                      'Create a separate empty account? Existing accounts and credentials will be kept separate. This does not recover or merge your previous progress.',
                      controller.createAccount,
                    )
                  }
                />
              )}
            </View>
          )}
          {!!state.message && (
            <TextButton
              label="Retry connection"
              onPress={() => act(controller.retry)}
              disabled={state.busy}
            />
          )}
          <Text style={styles.footer}>JustGO · Your account, kept private</Text>
        </View>
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
  notice: {
    padding: spacing.lg,
    backgroundColor: colors.peach,
    borderRadius: radii.small,
  },
  row: { gap: spacing.sm },
  panels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    justifyContent: 'center',
  },
  badge: { ...typography.caption, color: colors.ink, letterSpacing: 1 },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  link: {
    ...typography.label,
    color: colors.ink,
    textDecorationLine: 'underline',
    textAlign: 'center',
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
  keyBox: {
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.cream,
    borderRadius: radii.small,
  },
  secret: {
    ...typography.caption,
    color: colors.ink,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  verification: {
    ...typography.heading,
    fontSize: 24,
    lineHeight: 32,
    color: colors.ink,
    textAlign: 'center',
  },
  device: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.md,
  },
  footer: {
    ...typography.caption,
    color: colors.ink,
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
});
