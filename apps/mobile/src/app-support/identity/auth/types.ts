export type SignInProvider = 'apple' | 'google';
export type ProviderSession = {
  authUserId: string;
  accessToken: string;
  expiresAt: string;
  linkedProviders?: readonly SignInProvider[];
};
export class ProviderAuthError extends Error {
  constructor(
    readonly code:
      'CANCELLED' | 'CONFIGURATION' | 'AUTH' | 'STORAGE' | 'LAST_PROVIDER',
  ) {
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
