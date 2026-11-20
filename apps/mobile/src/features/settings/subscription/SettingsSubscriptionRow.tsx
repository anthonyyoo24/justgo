import type { PaidAccess } from '../../../app-support/access/paid-access';
import { SettingsActionRow } from '../../../components/settings/SettingsRows';
import { useSubscription } from './use-subscription';

/** Settings' subscription row, with the saved plan read after its label. */
export function SettingsSubscriptionRow({ access }: { access: PaidAccess }) {
  const summary = useSubscription(access);
  return (
    <SettingsActionRow
      icon="subscription"
      label="Subscription"
      subtitle={summary?.plan}
      href="/subscription"
      chevron
    />
  );
}
