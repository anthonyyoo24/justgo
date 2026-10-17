import { Redirect } from 'expo-router';
import { IdentityScreen } from '../app-support/identity/account/IdentityScreen';
import { useRuntime, useIdentity } from '../app-support/providers/AppProvider';
import { AccountRecoveryScreen } from '../app-support/identity/account/AccountRecoveryScreen';
export default function RecoveryRoute() {
  const { identity } = useRuntime();
  const state = useIdentity();
  if (state.deletionStatus === 'deleted') return <Redirect href="/welcome" />;
  if (state.account)
    return (
      <AccountRecoveryScreen
        cancellationPending={state.cancellationPending && !state.busy}
      />
    );
  return <IdentityScreen controller={identity} managed />;
}
