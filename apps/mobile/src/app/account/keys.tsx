import { AccountToolsScreen } from '../../app-support/identity/account/AccountToolsScreen';
import { useRuntime } from '../../app-support/providers/AppProvider';

export default function RecoveryKeysRoute() {
  const { identity } = useRuntime();
  return <AccountToolsScreen controller={identity} tool="keys" />;
}
