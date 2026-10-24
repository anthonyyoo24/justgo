import { ChallengeScreen } from '../../features/challenges/ChallengeScreen';
import { AccessScreen } from '../../app-support/access/AccessScreen';
import { useAccess } from '../../app-support/providers/AppProvider';
import { Redirect } from 'expo-router';

/** Local history stays reachable; starting challenges still needs fresh access. */
export default function HomeRoute() {
  const access = useAccess();
  // Startup belongs outside the tab scene so its logo keeps full-screen centering.
  if (!access.verified && access.isPending) return <Redirect href="/access" />;
  return access.verified ? <ChallengeScreen /> : <AccessScreen />;
}
