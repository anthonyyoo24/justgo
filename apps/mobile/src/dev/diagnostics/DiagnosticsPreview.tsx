import { useState } from 'react';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { ScaledText } from '../../components/typography/ScaledText';

/** Reachable only through the guarded development preview route. Synthetic data only. */
export function DiagnosticsPreview() {
  const [broken, setBroken] = useState(false);
  if (broken) throw new Error('JustGO synthetic diagnostic fixture failure');
  return (
    <Screen title="Diagnostics preview">
      <ScaledText>
        Development only. These checks use synthetic errors.
      </ScaledText>
      <PrimaryButton
        label="Trigger test error"
        onPress={() => setBroken(true)}
      />
      <PrimaryButton
        label="Trigger test rejection"
        onPress={() => {
          // Deliberately unhandled: the installed SDK's global rejection handler owns this fixture.
          void Promise.reject(new Error('JustGO synthetic rejection fixture'));
        }}
      />
    </Screen>
  );
}
