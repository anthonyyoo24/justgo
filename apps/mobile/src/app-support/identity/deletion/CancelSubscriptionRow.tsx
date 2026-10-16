import { useEffect, useRef, useState } from 'react';
import { SettingsActionRow } from '../../../components/settings/SettingsRows';
import { openSubscriptionManagement } from '../../../platform/subscriptions/open-subscriptions';
import { showMessageToast } from '../../../platform/toast/Toast';

export function CancelSubscriptionRow() {
  const opening = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = async () => {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    try {
      await openSubscriptionManagement();
    } catch {
      // Do not expose StoreKit diagnostics or imply renewal was cancelled.
      if (mounted.current)
        showMessageToast(
          'activity',
          'Couldn’t open subscription settings. Please try again.',
        );
    } finally {
      opening.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <SettingsActionRow
      icon="subscription"
      label="Cancel subscription"
      busy={busy}
      chevron
      onPress={() => {
        // This operation owns presentation failures and restores retry availability.
        void open();
      }}
    />
  );
}
