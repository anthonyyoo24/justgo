import { useEffect, useState } from 'react';
import type { FeelingCode } from '@justgo/contracts';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, fontFamilies } from '../../theme/tokens';
import {
  challengeDisplayFont,
  challengeScale,
} from '../challenges/challenge-design';
import { FeelingFace } from './FeelingFace';

export const feelingOptions: readonly {
  code: FeelingCode;
  label: string;
}[] = [
  { code: 'a_lot_worse', label: 'A lot worse' },
  { code: 'a_little_worse', label: 'A little bit worse' },
  { code: 'about_the_same', label: 'Pretty much the same' },
  { code: 'a_little_better', label: 'A little bit better' },
  { code: 'a_lot_better', label: 'A lot better' },
];

function ReflectionSpinner() {
  const [rotation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 900,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [rotation]);

  return (
    <Animated.View
      accessible={false}
      testID="reflection-submit-spinner"
      style={{
        width: 22,
        height: 22,
        transform: [
          {
            rotate: rotation.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg'],
            }),
          },
        ],
      }}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
        <Circle
          cx={12}
          cy={12}
          r={9}
          fill="none"
          stroke={colors.white}
          strokeOpacity={0.25}
          strokeWidth={2.5}
        />
        <Path
          d="M12 3 A9 9 0 0 1 21 12"
          fill="none"
          stroke={colors.white}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

export function ReflectionView({
  feeling,
  text,
  onFeelingChange,
  onTextChange,
  onSubmit,
  onClose,
  busy = false,
  locked = false,
  pendingAction = null,
  error,
  draftError = false,
  onRetryDraft,
  conflict = false,
  onLoadLatest,
  onKeepMine,
  dismissOpen = false,
  onKeepEditing,
  onDiscard,
}: {
  feeling: FeelingCode | null;
  text: string;
  onFeelingChange: (value: FeelingCode | null) => void;
  onTextChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  busy?: boolean;
  locked?: boolean;
  pendingAction?: 'final' | 'skip' | null;
  error?: string | null;
  draftError?: boolean;
  onRetryDraft?: (() => void) | undefined;
  conflict?: boolean;
  onLoadLatest?: () => void;
  onKeepMine?: (() => void) | undefined;
  dismissOpen?: boolean;
  onKeepEditing?: () => void;
  onDiscard?: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const scale = Math.min(width, 390) / 390;
  const headerScale = challengeScale(width);
  const hasInput = feeling !== null || text.trim().length > 0;
  const buttonLabel =
    pendingAction === 'skip'
      ? 'Retry Skip'
      : pendingAction === 'final'
        ? 'Retry Save'
        : hasInput
          ? 'Save Reflection'
          : 'Skip';
  const busyLabel =
    pendingAction === 'skip' || (!pendingAction && !hasInput)
      ? 'Skipping reflection'
      : 'Saving reflection';
  const size = 60 * scale;
  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scroll,
            { paddingHorizontal: 20 * scale },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              accessibilityState={{ disabled: busy || locked }}
              disabled={busy || locked}
              onPress={onClose}
              style={styles.iconButton}
            >
              <Svg width={20} height={20} viewBox="0 0 20 20" aria-hidden>
                <Path
                  d="M12.5 3.5 L6 10 L12.5 16.5"
                  fill="none"
                  stroke={colors.ink}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
            <Text
              style={[
                styles.headerTitle,
                { fontSize: 17 * headerScale, lineHeight: 22 * headerScale },
              ]}
            >
              Reflection
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close reflection"
              accessibilityState={{ disabled: busy || locked }}
              disabled={busy || locked}
              onPress={onClose}
              style={styles.iconButton}
            >
              <Svg width={20} height={20} viewBox="0 0 20 20" aria-hidden>
                <Path
                  d="M3.5 3.5 L16.5 16.5 M16.5 3.5 L3.5 16.5"
                  fill="none"
                  stroke={colors.ink}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              </Svg>
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            How do you feel?
          </Text>
          <Text style={styles.qualifier}>
            Compared to before the challenge.
          </Text>
          <Text style={styles.choose}>Choose one.</Text>
          <View style={styles.feelings} accessibilityRole="radiogroup">
            {feelingOptions.map((option) => {
              const selected = feeling === option.code;
              return (
                <Pressable
                  key={option.code}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityHint={
                    selected ? 'Tap again to clear this feeling' : undefined
                  }
                  accessibilityState={{
                    checked: selected,
                    disabled: busy || locked,
                  }}
                  aria-checked={selected}
                  disabled={busy || locked}
                  onPress={() => onFeelingChange(selected ? null : option.code)}
                  style={styles.feelingChoice}
                  testID={`feeling-${option.code}`}
                >
                  <FeelingFace
                    feeling={option.code}
                    selected={selected}
                    size={size}
                  />
                  <Text
                    style={[
                      styles.feelingLabel,
                      selected && styles.selectedLabel,
                      {
                        fontSize:
                          Math.max(10, 11 * scale) * Math.max(1, fontScale),
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.reflectionSection, { marginTop: 38 * scale }]}>
            <View style={styles.reflectionHeadingRow}>
              <Text accessibilityRole="header" style={styles.reflectionHeading}>
                Your reflection
              </Text>
              <Text style={styles.optional}>Optional</Text>
            </View>
            <Text style={styles.prompt}>
              What went well? What was hard? What would you try next time?
            </Text>
            <TextInput
              accessibilityLabel="Your reflection"
              testID="reflection-input"
              multiline
              scrollEnabled
              textAlignVertical="top"
              placeholder="How did it go, and why do you feel this way?"
              placeholderTextColor="#526B80"
              value={text}
              onChangeText={onTextChange}
              editable={!busy && !locked}
              maxLength={10000}
              style={[styles.input, { minHeight: 228 * scale }]}
            />
          </View>
          {draftError && (
            <View style={styles.inlineNotice}>
              <Text accessibilityRole="alert" style={styles.notice}>
                Draft not saved. Your edits are still here.
              </Text>
              {!!onRetryDraft && (
                <Pressable
                  accessibilityRole="button"
                  onPress={onRetryDraft}
                  style={styles.inlineAction}
                >
                  <Text style={styles.inlineActionText}>Retry draft</Text>
                </Pressable>
              )}
            </View>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {conflict && (
            <View style={styles.conflictActions}>
              <Pressable
                accessibilityRole="button"
                onPress={onLoadLatest}
                style={styles.inlineAction}
              >
                <Text style={styles.inlineActionText}>Use saved version</Text>
              </Pressable>
              {!!onKeepMine && (
                <Pressable
                  accessibilityRole="button"
                  onPress={onKeepMine}
                  style={styles.inlineAction}
                >
                  <Text style={styles.inlineActionText}>Keep my edits</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingHorizontal: 15 * scale }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? busyLabel : buttonLabel}
            accessibilityState={{ disabled: busy || conflict, busy }}
            disabled={busy || conflict}
            onPress={onSubmit}
            testID="reflection-submit"
            style={styles.primaryButton}
          >
            {busy ? (
              <ReflectionSpinner />
            ) : (
              <Text style={styles.primaryLabel}>{buttonLabel}</Text>
            )}
          </Pressable>
        </View>
        {dismissOpen && (
          <View style={styles.scrim} accessibilityViewIsModal>
            <View style={styles.dialog}>
              <Text accessibilityRole="header" style={styles.dialogTitle}>
                Leave your reflection?
              </Text>
              <Text style={styles.dialogBody}>
                You have an unfinished reflection. Choose what to do with it.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onSubmit}
                style={styles.dialogAction}
              >
                <Text style={styles.dialogActionText}>Save Reflection</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onKeepEditing}
                style={styles.dialogAction}
              >
                <Text style={styles.dialogActionText}>Keep editing</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onDiscard}
                style={styles.dialogAction}
              >
                <Text style={styles.dialogActionText}>Discard and skip</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, width: '100%', maxWidth: 420, alignSelf: 'center' },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: challengeDisplayFont,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.15,
  },
  title: {
    marginTop: 18,
    fontFamily: fontFamilies.display,
    fontWeight: '600',
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.5,
    textAlign: 'center',
    color: colors.ink,
  },
  qualifier: {
    marginTop: 2,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: '#526B80',
  },
  choose: {
    marginTop: 14,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    color: '#526B80',
  },
  feelings: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 3,
  },
  feelingChoice: {
    flex: 1,
    minWidth: 0,
    minHeight: 92,
    alignItems: 'center',
    gap: 5,
  },
  feelingLabel: {
    fontFamily: fontFamilies.regular,
    lineHeight: 14,
    textAlign: 'center',
    color: colors.ink,
  },
  selectedLabel: { fontFamily: fontFamilies.semibold },
  reflectionSection: { gap: 4 },
  reflectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 9,
  },
  reflectionHeading: {
    fontFamily: fontFamilies.display,
    fontWeight: '600',
    fontSize: 25,
    lineHeight: 30,
    color: colors.ink,
  },
  optional: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 16,
    color: '#526B80',
  },
  prompt: {
    fontFamily: fontFamilies.regular,
    fontSize: 10.5,
    lineHeight: 16,
    color: '#526B80',
  },
  input: {
    marginTop: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: '#D8D5D0',
    borderRadius: 4,
    padding: 13,
    backgroundColor: colors.white,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  notice: {
    marginTop: 12,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.ink,
  },
  inlineNotice: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inlineAction: { minHeight: 44, justifyContent: 'center' },
  inlineActionText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  conflictActions: { flexDirection: 'row', gap: 20 },
  error: {
    marginTop: 12,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 19,
    color: '#8B1E32',
  },
  footer: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: colors.paper,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontFamily: fontFamilies.display,
    fontWeight: '600',
    fontSize: 16,
    color: colors.white,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 5,
    backgroundColor: '#102C4980',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: colors.paper,
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  dialogTitle: {
    fontFamily: fontFamilies.display,
    fontWeight: '600',
    fontSize: 24,
    color: colors.ink,
  },
  dialogBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  dialogAction: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  dialogActionText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    color: colors.ink,
  },
});
