import { ChallengeScreen } from '../../features/challenges/ChallengeScreen';
import { AccessScreen } from '../../app-support/access/AccessScreen';
import { useAccess } from '../../app-support/providers/AppProvider';

/** Local history stays reachable; starting challenges still needs fresh access. */
export default function HomeRoute() {
  return useAccess().verified ? <ChallengeScreen /> : <AccessScreen />;
}
