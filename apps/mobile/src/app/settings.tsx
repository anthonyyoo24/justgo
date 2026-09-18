import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { useIdentity } from '../features/shell/AppProvider';
import { styles } from '../features/shell/ShellScreens';
export default function SettingsRoute() {
  const { account } = useIdentity();
  return (
    <Screen title="Settings">
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Your private account
        </Text>
        <Text style={styles.body}>
          {account
            ? 'Connected securely. No email or password needed.'
            : 'Connect or recover your account to continue.'}
        </Text>
        <Link href="/recovery" style={styles.link}>
          Account & recovery
        </Link>
      </View>
      <Text style={styles.body}>
        Optional analytics are off. No activity is sent to an analytics service.
      </Text>
      <Link href="/" replace style={styles.link}>
        Back to app
      </Link>
      {__DEV__ && (
        <Link href="/preview" style={styles.link}>
          Preview app screens
        </Link>
      )}
    </Screen>
  );
}
