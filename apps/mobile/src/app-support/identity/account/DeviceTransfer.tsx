import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { TextInput, View } from 'react-native';
import { SettingsGroup } from '../../../components/settings/SettingsRows';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { colors } from '../../../theme/tokens';
import type { IdentityController } from '../controller';
import { useIdentityAction } from '../useIdentityAction';
import { accountStyles as styles } from './account-styles';

export function DeviceTransfer({
  controller,
  state,
}: {
  controller: IdentityController;
  state: ReturnType<IdentityController['getSnapshot']>;
}) {
  const [code, setCode] = useState('');
  const [digits, setDigits] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const generation = useRef(0);
  const { activeAction, runAction } = useIdentityAction(controller);
  useFocusEffect(
    useCallback(
      () => () => {
        generation.current++;
        setCode('');
        setDigits('');
        setReviewed(false);
      },
      [],
    ),
  );
  const review = async () => {
    if (state.busy) return;
    setDigits('');
    setReviewed(false);
    const current = generation.current;
    await runAction('Review transfer', () => controller.inspectTransfer(code));
    if (current === generation.current)
      setReviewed(!!controller.getSnapshot().inspection);
  };
  const approve = async () => {
    if (state.busy) return;
    const current = generation.current;
    await runAction('Approve this device', () =>
      controller.approveTransfer(digits),
    );
    if (current !== generation.current) return;
    setDigits('');
    if (!controller.getSnapshot().inspection) {
      setCode('');
      setReviewed(false);
    }
  };
  return (
    <>
      <SettingsGroup title="On your new phone">
        <View style={styles.inset}>
          <Text style={styles.body}>
            Open JustGO on your new phone and choose “Transfer from another
            device.” If that phone already has an account, go to Settings →
            Account & recovery → Recovery keys → Recover an existing account
            first. Keep that phone open while you approve it here.
          </Text>
        </View>
      </SettingsGroup>
      <SettingsGroup title="On this phone">
        <View style={styles.inset}>
          <Text style={styles.body}>
            Enter the transfer code shown on your new phone.
          </Text>
          <TextInput
            accessibilityLabel="Transfer code"
            value={code}
            onChangeText={(value) => {
              setCode(value);
              setReviewed(false);
              setDigits('');
            }}
            editable={!state.busy}
            onSubmitEditing={() => {
              void review();
            }}
            returnKeyType="done"
            placeholder="Transfer code"
            placeholderTextColor={colors.ink}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={24}
            style={styles.input}
          />
          <PrimaryButton
            label="Review transfer"
            busy={activeAction === 'Review transfer'}
            disabled={state.busy}
            onPress={() => {
              void review();
            }}
          />
        </View>
      </SettingsGroup>
      {reviewed && state.inspection && (
        <SettingsGroup title="Verify your new phone">
          <View style={styles.inset}>
            <Text style={styles.body}>
              Enter the six verification digits shown on your new phone. Only
              approve a phone you are setting up.
            </Text>
            <Text style={styles.caption}>
              Expires at{' '}
              {new Date(state.inspection.expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </Text>
            <TextInput
              accessibilityLabel="Verification digits"
              value={digits}
              onChangeText={setDigits}
              editable={!state.busy}
              onSubmitEditing={() => {
                void approve();
              }}
              returnKeyType="done"
              placeholder="Six digits"
              placeholderTextColor={colors.ink}
              keyboardType="number-pad"
              autoCorrect={false}
              maxLength={6}
              style={styles.input}
            />
            <PrimaryButton
              label="Approve this device"
              busy={activeAction === 'Approve this device'}
              disabled={state.busy}
              onPress={() => {
                void approve();
              }}
            />
          </View>
        </SettingsGroup>
      )}
    </>
  );
}
