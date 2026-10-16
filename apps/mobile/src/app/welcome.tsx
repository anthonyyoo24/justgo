import { WelcomeScreen } from '../app-support/identity/welcome/WelcomeScreen';
import { useRuntime } from '../app-support/providers/AppProvider';

export default function WelcomeRoute() {
  const { identity } = useRuntime();
  return <WelcomeScreen controller={identity} />;
}
