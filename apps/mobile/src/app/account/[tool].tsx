import { Redirect, useLocalSearchParams } from 'expo-router';
import {
  AccountToolsScreen,
  accountTools,
  type AccountTool,
} from '../../app-support/identity/account/AccountToolsScreen';
import { IdentityScreen } from '../../app-support/identity/IdentityScreen';
import { useRuntime } from '../../app-support/providers/AppProvider';

export default function AccountToolRoute() {
  const { tool } = useLocalSearchParams<{ tool: string }>();
  const { identity } = useRuntime();
  if (tool === 'recover')
    return <IdentityScreen controller={identity} managed recoveryOnly />;
  if (!Object.hasOwn(accountTools, tool)) return <Redirect href="/recovery" />;
  return (
    <AccountToolsScreen controller={identity} tool={tool as AccountTool} />
  );
}
