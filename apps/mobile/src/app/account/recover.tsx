import { IdentityScreen } from '../../app-support/identity/account/IdentityScreen';
import { useRuntime } from '../../app-support/providers/AppProvider';
import { useRouter } from 'expo-router';

export default function RecoverAccountRoute() {
  const { identity } = useRuntime();
  const router = useRouter();
  return (
    <IdentityScreen
      controller={identity}
      managed
      recoveryOnly
      onCreateAccount={async () => {
        router.push({
          pathname: '/acceptance',
          params: {
            returnTo: 'recovery',
            create: 'new',
            from: identity.getSnapshot().account?.userId ?? 'none',
          },
        });
      }}
    />
  );
}
