import type { RefObject } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type {
  ReflectionController,
  ReflectionSnapshot,
} from '../reflections/controller';
import { useDelayedBusy } from '../../lib/useDelayedBusy';
import { colors, fontFamilies } from '../../theme/tokens';

const reflectionHint = 'What stood out to you?';
const inputPadding = 14;

// Closed Add rows measure this lightweight layout instead of mounting native
// inputs/controllers. It shares the real empty form's typography and geometry.
export function DayReflectionPlaceholder({ text = '' }: { text?: string }) {
  return (
    <View testID="reflection-editor-measurement">
      <View style={styles.input}>
        <Text style={[styles.placeholderText, !!text && { color: colors.ink }]}>
          {text || reflectionHint}
        </Text>
      </View>
      <View style={styles.actions}>
        <View style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </View>
        <View style={[styles.save, styles.disabled]}>
          <Text style={[styles.saveText, styles.disabledText]}>
            Save reflection
          </Text>
        </View>
      </View>
    </View>
  );
}

export function DayReflectionEditor({
  controller,
  state,
  inputRef,
  inputReady = true,
  onKeepEditing,
}: {
  controller: ReflectionController;
  state: ReflectionSnapshot;
  inputRef?: RefObject<TextInput | null>;
  inputReady?: boolean;
  onKeepEditing: () => void;
}) {
  const savingVisible = useDelayedBusy(state.submitting);
  const reduceMotion = useReducedMotion();
  const showInput = inputReady || reduceMotion || Platform.OS === 'web';
  const disabled =
    state.submitting ||
    !controller.hasChanges() ||
    (!state.text.trim() && !state.feeling);
  // Keep the reveal lightweight, including its actions and hidden dialogs.
  // The native editor mounts only after that reveal has finished.
  if (!showInput) return <DayReflectionPlaceholder text={state.text} />;
  return (
    <View>
      <View>
        <TextInput
          ref={inputRef}
          accessibilityLabel="Your day reflection"
          testID="day-reflection-input"
          multiline
          scrollEnabled
          textAlignVertical="top"
          placeholder={reflectionHint}
          placeholderTextColor={
            Platform.OS === 'ios' ? 'transparent' : '#6B809B'
          }
          value={state.text}
          onChangeText={controller.setText}
          maxLength={10000}
          style={styles.input}
        />
        {Platform.OS === 'ios' && !state.text && (
          // iOS's UILabel placeholder has a different baseline from Text.
          // Retain the preview's Text renderer; the native hint still supplies
          // input sizing/accessibility, and this overlay cannot intercept taps.
          <Text
            pointerEvents="none"
            accessible={false}
            aria-hidden
            style={[styles.placeholderText, styles.inputHint]}
          >
            {reflectionHint}
          </Text>
        )}
      </View>
      {!!state.error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {state.error}
        </Text>
      )}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel reflection"
          accessibilityState={{ disabled: state.submitting }}
          disabled={state.submitting}
          onPress={controller.close}
          style={styles.cancel}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            savingVisible ? 'Saving reflection' : 'Save reflection'
          }
          accessibilityState={{ disabled, busy: savingVisible }}
          disabled={disabled}
          hitSlop={4}
          onPress={() => void controller.submit()}
          style={[
            styles.save,
            disabled && !state.submitting && styles.disabled,
          ]}
        >
          {savingVisible ? (
            <ActivityIndicator
              testID="day-reflection-spinner"
              accessible={false}
              color={colors.white}
              size="small"
            />
          ) : (
            <Text
              style={[
                styles.saveText,
                disabled && !state.submitting && styles.disabledText,
              ]}
            >
              Save reflection
            </Text>
          )}
        </Pressable>
      </View>
      <Modal
        visible={state.dismissOpen}
        transparent
        animationType="fade"
        onRequestClose={onKeepEditing}
      >
        <View style={styles.scrim}>
          <View accessibilityViewIsModal style={styles.dialog}>
            <Text accessibilityRole="header" style={styles.dialogTitle}>
              Leave your reflection?
            </Text>
            <Text style={styles.cancelText}>
              You have an unfinished reflection. Choose what to do with it.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                savingVisible ? 'Saving reflection' : 'Save Reflection'
              }
              disabled={disabled}
              accessibilityState={{
                disabled,
                busy: savingVisible,
              }}
              onPress={() => void controller.submit()}
              style={styles.dialogAction}
            >
              {savingVisible ? (
                <ActivityIndicator
                  testID="day-reflection-dismiss-spinner"
                  accessible={false}
                  color={colors.ink}
                />
              ) : (
                <Text style={styles.cancelText}>Save Reflection</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onKeepEditing}
              style={styles.dialogAction}
            >
              <Text style={styles.cancelText}>Keep editing</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={state.submitting}
              onPress={controller.discard}
              style={styles.dialogAction}
            >
              <Text style={styles.cancelText}>Discard changes</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  placeholderText: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 21,
    color: '#6B809B',
  },
  inputHint: {
    position: 'absolute',
    top: inputPadding,
    left: inputPadding,
    right: inputPadding,
  },
  input: {
    minHeight: 76,
    width: '100%',
    padding: inputPadding,
    borderRadius: 10,
    backgroundColor: '#F8EEEA',
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  actions: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancel: {
    minWidth: 60,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  save: {
    minWidth: 130,
    minHeight: 36,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: '#FCFBF7',
  },
  disabled: { backgroundColor: '#D7D9DE' },
  disabledText: { color: '#596274' },
  error: {
    marginTop: 8,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: '#8B1E32',
  },
  dialog: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: colors.paper,
    padding: 16,
    gap: 12,
  },
  scrim: {
    flex: 1,
    backgroundColor: '#102C4980',
    justifyContent: 'center',
    padding: 24,
  },
  dialogTitle: {
    fontFamily: fontFamilies.editorial,
    fontWeight: '700',
    fontSize: 22,
    color: colors.ink,
  },
  dialogAction: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 22,
  },
});
