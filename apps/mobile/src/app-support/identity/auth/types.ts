export type SignInProvider = 'apple' | 'google';
export type ProviderSession = {
  authUserId: string;
  accessToken: string;
  expiresAt: string;
  linkedProviders?: readonly SignInProvider[];
  /** Legacy presentation fallback only; explicit completed sign-in wins. */
  provider?: SignInProvider;
  /** Set only after exchanging a fresh browser OAuth callback. */
  freshSignIn?: boolean;
};
export const providerAuthErrorCodes = [
  'CANCELLED',
  'CONFIGURATION',
  'AUTH',
  'STORAGE',
  'LAST_PROVIDER',
] as const;
export class ProviderAuthError extends Error {
  constructor(readonly code: (typeof providerAuthErrorCodes)[number]) {
    super(code);
    this.name = 'ProviderAuthError';
  }
}
export interface ManagedAuth {
  initialize(): Promise<ProviderSession | null>;
  signIn(
    provider: SignInProvider,
  ): Promise<ProviderSession | 'redirecting' | null>;
  linkIdentity(
    provider: SignInProvider,
  ): Promise<ProviderSession | 'redirecting' | null>;
  unlinkIdentity(provider: SignInProvider): Promise<ProviderSession>;
  refresh(): Promise<ProviderSession | null>;
  signOut(): Promise<void>;
  setActive(active: boolean): void;
  subscribe(listener: (session: ProviderSession | null) => void): () => void;
  dispose(): void;
}
