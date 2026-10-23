import { Redirect } from 'expo-router';
import { AccountToolsScreen } from '../../app-support/identity/account/AccountToolsScreen';
import { useRuntime } from '../../app-support/providers/AppProvider';

export default function AccountTroubleshootingRoute() {
  const { identity } = useRuntime();
  if ('signIn' in identity) return <Redirect href="/recovery" />;
  return <AccountToolsScreen controller={identity} tool="troubleshooting" />;
}
