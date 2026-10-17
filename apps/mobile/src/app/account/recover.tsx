import { IdentityScreen } from '../../app-support/identity/IdentityScreen';
import { useRuntime } from '../../app-support/providers/AppProvider';

export default function RecoverAccountRoute() {
  const { identity } = useRuntime();
  return <IdentityScreen controller={identity} managed recoveryOnly />;
}
