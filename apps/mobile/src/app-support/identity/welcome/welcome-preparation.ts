import { createContext, useContext } from 'react';

export const WelcomePreparationContext = createContext({
  active: false,
  attempt: 0,
  markReady: (): void => {},
});

export const useWelcomePreparation = () =>
  useContext(WelcomePreparationContext);
