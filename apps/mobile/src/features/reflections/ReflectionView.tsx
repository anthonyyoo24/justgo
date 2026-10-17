import { feelingChoices, type FeelingCode } from '@justgo/contracts';
import {
  ActivityIndicator,
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
import { colors, fontFamilies } from '../../theme/tokens';
import {
  challengeDisplayFont,
  challengeScale,
} from '../challenges/challenge-design';
import { FeelingFace } from './FeelingFace';
import { useReflectionKeyboard } from './useReflectionKeyboard';

// Keep input choices and history labels on the same versioned feeling scale.
export const feelingOptions = feelingChoices;

export function ReflectionView({
  feeling,
  text,
  onFeelingChange,
  onTextChange,
  onSubmit,
  busy = false,
  savingVisible = false,
  editing = false,
  error,
}: {
  feeling: FeelingCode | null;
  text: string;
  onFeelingChange: (value: FeelingCode | null) => void;
  onTextChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  savingVisible?: boolean;
  editing?: boolean;
  error?: string | null;
}) {
  const { width, fontScale } = useWindowDimensions();
  const scale = Math.min(width, 390) / 390;
  const headerScale = challengeScale(width);
  const hasInput = feeling !== null || text.trim().length > 0;
  const inactive = busy;
  const buttonLabel = hasInput ? 'Save Reflection' : 'Skip';
  const size = 60 * scale;
  const {
    scrollRef,
    inputHeight,
    paddingBottom,
    onFocus,
    onBlur,
    onViewportLayout,
    onSectionLayout,
    onInputLayout,
    onContentSizeChange,
  } = useReflectionKeyboard(228 * scale);
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
          ref={scrollRef}
          testID="reflection-scroll"
          style={styles.viewport}
          onLayout={onViewportLayout}
          onContentSizeChange={onContentSizeChange}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingHorizontal: 20 * scale,
              paddingBottom,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text
              style={[
                styles.headerTitle,
                { fontSize: 17 * headerScale, lineHeight: 22 * headerScale },
              ]}
            >
              Reflection
            </Text>
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
                    disabled: inactive || editing,
                  }}
                  aria-checked={selected}
                  disabled={inactive || editing}
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
          <View
            testID="reflection-section"
            onLayout={onSectionLayout}
            style={[styles.reflectionSection, { marginTop: 38 * scale }]}
          >
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
              onFocus={onFocus}
              onBlur={onBlur}
              onLayout={onInputLayout}
              editable
              maxLength={10000}
              style={[
                styles.input,
                {
                  height: inputHeight,
                  minHeight: inputHeight,
                },
              ]}
            />
          </View>
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingHorizontal: 15 * scale }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              savingVisible ? 'Saving reflection' : buttonLabel
            }
            accessibilityState={{
              disabled: busy,
              busy: savingVisible,
            }}
            disabled={busy}
            onPress={onSubmit}
            testID="reflection-submit"
            style={styles.primaryButton}
          >
            {savingVisible ? (
              <ActivityIndicator
                color={colors.white}
                size="small"
                accessible={false}
                testID="reflection-submit-spinner"
              />
            ) : (
              <Text style={styles.primaryLabel}>{buttonLabel}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  viewport: { flex: 1, minHeight: 0 },
  scroll: { flexGrow: 1, width: '100%', maxWidth: 420, alignSelf: 'center' },
  header: {
    minHeight: 44,
    flexDirection: 'row',
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
    fontFamily: fontFamilies.editorial,
    fontWeight: '700',
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
    fontFamily: fontFamilies.editorial,
    fontWeight: '700',
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.25,
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
  error: {
    marginTop: 12,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 19,
    color: '#8B1E32',
  },
  footer: {
    flexShrink: 0,
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
});
