import { ChallengeScreen } from '../../features/challenges/ChallengeScreen';
import { AccessScreen } from '../../app-support/access/AccessScreen';
import { useAccess } from '../../app-support/providers/AppProvider';
import { Redirect } from 'expo-router';
import { useChallengeActivity } from '../../features/challenges/active/ChallengeActivityProvider';

/** Local history stays reachable; starting challenges still needs fresh access. */
export default function HomeRoute() {
  const access = useAccess();
  const { active } = useChallengeActivity();
  // Admission expiry blocks new starts. Keep the owner-local accepted flow
  // mounted until completion/give-up so a modal or unsaved writing is not lost.
  if (active) return <ChallengeScreen />;
  // Startup belongs outside the tab scene so its logo keeps full-screen centering.
  if (!access.verified && access.isPending) return <Redirect href="/access" />;
  return access.verified ? <ChallengeScreen /> : <AccessScreen />;
}
