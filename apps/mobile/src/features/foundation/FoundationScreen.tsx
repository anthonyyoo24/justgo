import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, layout, spacing, typography } from '../../theme/tokens';
import { checkConnection, type ConnectionResult } from './connection';

const messages: Record<ConnectionResult, string> = {
  ready: 'Connected. Everything is ready.',
  'database-unavailable':
    'The app service is online. The database is not ready yet.',
  unavailable: 'Couldn’t connect. Check your connection and try again.',
  unconfigured:
    'Add the API address to your development environment to check the connection.',
};

export function FoundationScreen({
  probe = checkConnection,
}: {
  probe?: typeof checkConnection;
}) {
  const [status, setStatus] = useState<ConnectionResult>();
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const check = async () => {
    if (request.current && !request.current.signal.aborted) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const result = await probe(
        process.env.EXPO_PUBLIC_API_URL,
        controller.signal,
      );
      if (!controller.signal.aborted) setStatus(result);
    } catch {
      if (!controller.signal.aborted) setStatus('unavailable');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      controller.abort();
    }
  };
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.wordmark}>JustGO</Text>
            <Text style={styles.caption}>DEVELOPMENT PREVIEW</Text>
          </View>
          <View style={styles.hero}>
            <View style={styles.artwork}>
              <Image
                source={require('../../../assets/illustrations/small-medal.png')}
                style={styles.illustration}
                contentFit="contain"
                accessible={false}
              />
            </View>
            <Text accessibilityRole="header" style={styles.heading}>
              Small steps.{'\n'}Real connections.
            </Text>
            <Text style={styles.description}>
              A little courage starts with{'\n'}showing up.
            </Text>
          </View>
          <View style={styles.footer}>
            <Text style={styles.note}>
              The foundation is in place.{'\n'}Your first challenge is still to
              come.
            </Text>
            <PrimaryButton
              label={
                busy ? 'Checking…' : status ? 'Check again' : 'Check connection'
              }
              onPress={() => {
                void check();
              }}
              busy={busy}
            />
            <Text accessibilityLiveRegion="polite" style={styles.status}>
              {status ? messages[status] : 'JustGO · Foundation build'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.screen,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  header: { alignItems: 'center', gap: spacing.sm },
  wordmark: { ...typography.heading, color: colors.ink },
  caption: { ...typography.caption, color: colors.ink, letterSpacing: 1.5 },
  hero: {
    flex: 1,
    backgroundColor: colors.cream,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.lg,
  },
  artwork: {
    width: '100%',
    maxWidth: 262,
    height: 220,
    mixBlendMode: 'multiply',
  },
  illustration: { width: '100%', height: '100%' },
  heading: { ...typography.display, color: colors.ink, textAlign: 'center' },
  description: { ...typography.body, color: colors.ink, textAlign: 'center' },
  footer: { gap: spacing.lg },
  note: { ...typography.caption, color: colors.ink, textAlign: 'center' },
  status: {
    ...typography.caption,
    color: colors.ink,
    textAlign: 'center',
    minHeight: 36,
  },
});
