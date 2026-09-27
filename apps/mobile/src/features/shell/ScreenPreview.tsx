import { useEffect, useRef, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProgressScreen } from './ShellScreens';
import { DeckPreview } from '../challenges/DeckPreview';
import { SuccessView } from '../challenges/SuccessView';
import { ReflectionView } from '../reflections/ReflectionView';
import type { FeelingCode } from '@justgo/contracts';
import { NavigationIcon } from '../../components/NavigationIcon';
import { colors, spacing, typography } from '../../theme/tokens';
// Presentation fixtures only. No API, account impersonation, or entitlement override.
export function ScreenPreview() {
  const [tab, setTab] = useState<'home' | 'progress'>('home');
  const [step, setStep] = useState<'deck' | 'success' | 'reflection'>('deck');
  const [feeling, setFeeling] = useState<FeelingCode | null>(null);
  const [reflection, setReflection] = useState('');
  const [dismissOpen, setDismissOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (submitTimer.current) clearTimeout(submitTimer.current);
    },
    [],
  );
  if (!__DEV__) return <Redirect href="/" />;
  if (step === 'success')
    return <SuccessView onContinue={() => setStep('reflection')} />;
  if (step === 'reflection') {
    const done = () => {
      setStep('deck');
      setFeeling(null);
      setReflection('');
      setDismissOpen(false);
      setSubmitting(false);
    };
    return (
      <ReflectionView
        feeling={feeling}
        text={reflection}
        onFeelingChange={setFeeling}
        onTextChange={setReflection}
        onSubmit={() => {
          setSubmitting(true);
          submitTimer.current = setTimeout(() => {
            submitTimer.current = null;
            done();
          }, 1200);
        }}
        onClose={() =>
          feeling || reflection.trim() ? setDismissOpen(true) : done()
        }
        dismissOpen={dismissOpen}
        busy={submitting}
        onKeepEditing={() => setDismissOpen(false)}
        onDiscard={done}
      />
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={['top']} style={styles.notice}>
        <Text style={styles.note}>SCREEN PREVIEW · No activity is saved</Text>
        <Link href="/" replace style={styles.close}>
          Exit preview
        </Link>
      </SafeAreaView>
      {tab === 'home' ? (
        <DeckPreview insetTop={false} onCompleted={() => setStep('success')} />
      ) : (
        <ProgressScreen insetTop={false} />
      )}
      <SafeAreaView edges={['bottom']} style={styles.nav}>
        <View style={styles.row}>
          {(['home', 'progress'] as const).map((name) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              aria-selected={tab === name}
              accessibilityLabel={name === 'home' ? 'Home' : 'Progress'}
              accessibilityState={{ selected: tab === name }}
              onPress={() => setTab(name)}
              style={styles.tab}
            >
              <NavigationIcon
                name={name}
                color={tab === name ? colors.white : colors.border}
              />
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}
const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.peach,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    alignItems: 'center',
  },
  note: { ...typography.caption, color: colors.ink },
  close: {
    ...typography.caption,
    textDecorationLine: 'underline',
    color: colors.ink,
    minHeight: 44,
    padding: spacing.md,
  },
  nav: { backgroundColor: colors.navy },
  row: { flexDirection: 'row' },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
});
