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
  /**
   * Set only on the session kept after a browser link callback that Auth
   * refused because the identity already belongs to another Auth user.
   */
  identityExists?: boolean;
};
export const providerAuthErrorCodes = [
  'CANCELLED',
  'CONFIGURATION',
  'AUTH',
  'STORAGE',
  'LAST_PROVIDER',
  /** The identity already belongs to another Auth user, so it cannot be linked. */
  'IDENTITY_EXISTS',
  /**
   * Auth could not be reached. Only builds with billing on tell this apart from
   * AUTH, so a guest account is kept offline and replaced only when refused.
   */
  'NETWORK',
] as const;
export class ProviderAuthError extends Error {
  constructor(readonly code: (typeof providerAuthErrorCodes)[number]) {
    super(code);
    this.name = 'ProviderAuthError';
  }
}
export interface ManagedAuth {
  initialize(): Promise<ProviderSession | null>;
  /**
   * Starts an anonymous Auth user for a guest account (billing on only). Its
   * session lives in the same client and secure storage as a provider sign-in.
   */
  signInAnonymously(): Promise<ProviderSession>;
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
