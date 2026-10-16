import { useState } from 'react';
import { WelcomeView } from '../../app-support/identity/welcome/WelcomeView';

export function WelcomePreview({ state }: { state?: string }) {
  const [continuing, setContinuing] = useState(false);
  return (
    <WelcomeView
      busy={state === 'loading' || continuing}
      error={state === 'error' ? 'Couldn’t connect. Please try again.' : ''}
      onContinue={() => setContinuing(true)}
    />
  );
}
