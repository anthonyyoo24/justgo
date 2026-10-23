import { IdentityScreen } from '../../app-support/identity/account/IdentityScreen';
import { useRuntime } from '../../app-support/providers/AppProvider';
import { Redirect, useRouter } from 'expo-router';

export default function RecoverAccountRoute() {
  const { identity } = useRuntime();
  const router = useRouter();
  if ('signIn' in identity) return <Redirect href="/recovery" />;
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
