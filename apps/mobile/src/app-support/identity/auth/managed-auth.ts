import {
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { z } from 'zod';
import { createAuthStorage } from '../../../platform/auth/auth-storage';
import { AuthStorageError } from '../../../platform/auth/secure-storage';
import { nativeProviderToken } from './provider-token';
import {
  ProviderAuthError,
  type ManagedAuth,
  type ProviderSession,
  type SignInProvider,
} from './types';

const authStorageKey = 'justgo.auth.v1';
function linkedProviders(identities: readonly { provider: string }[]) {
  return [
    ...new Set(
      identities
        .map((identity) => identity.provider)
        .filter(
          (provider): provider is SignInProvider =>
            provider === 'apple' || provider === 'google',
        ),
    ),
  ];
}
function projection(session: Session | null): ProviderSession | null {
  if (!session) return null;
  return {
    authUserId: z.uuid().parse(session.user.id),
    accessToken: z.string().min(20).parse(session.access_token),
    expiresAt: new Date(
      z.number().positive().parse(session.expires_at) * 1000,
    ).toISOString(),
    linkedProviders: linkedProviders(session.user.identities ?? []),
  };
}

export function createManagedAuth(): ManagedAuth {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let client: SupabaseClient | null = null;
  let unsubscribe = () => {};
  let active = true;
  let disposed = false;
  let generation = 0;
  const listeners = new Set<(session: ProviderSession | null) => void>();
  const check = (expected: number) => {
    if (disposed || generation !== expected)
      throw new ProviderAuthError('CANCELLED');
  };
  const getClient = () => {
    check(generation);
    if (client) return client;
    if (
      !url ||
      !key ||
      !/^https:\/\//.test(url) ||
      !key.startsWith('sb_publishable_')
    )
      throw new ProviderAuthError('CONFIGURATION');
    client = createClient(url, key, {
      auth: {
        storage: createAuthStorage(),
        storageKey: authStorageKey,
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;
      if (_event === 'SIGNED_OUT') generation++;
      let next: ProviderSession | null;
      try {
        next = projection(session);
      } catch {
        next = null;
      }
      // Never call Auth methods from this callback: the SDK holds its auth lock.
      for (const listener of listeners) listener(next);
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    return client;
  };
  const safe = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AuthStorageError)
        throw new ProviderAuthError('STORAGE');
      if (error instanceof ProviderAuthError) throw error;
      throw new ProviderAuthError('AUTH');
    }
  };
  const session = async () => {
    const result = await getClient().auth.getSession();
    if (result.error) throw new ProviderAuthError('AUTH');
    return projection(result.data.session);
  };
  const verifiedSession = async (expected: number, subject?: string) => {
    check(expected);
    const current = await session();
    check(expected);
    if (!current) return null;
    if (subject && current.authUserId !== subject)
      throw new ProviderAuthError('AUTH');
    // getUser reads the Auth service. A cached session may still include an
    // identity removed on this or another device; it cannot decide switch state.
    const result = await getClient().auth.getUser(current.accessToken);
    check(expected);
    if (
      result.error ||
      !result.data.user ||
      result.data.user.id !== current.authUserId
    )
      throw new ProviderAuthError('AUTH');
    const latest = await session();
    check(expected);
    if (
      !latest ||
      latest.authUserId !== current.authUserId ||
      latest.accessToken !== current.accessToken
    )
      throw new ProviderAuthError('AUTH');
    const identities = result.data.user.identities ?? [];
    return {
      session: {
        ...current,
        linkedProviders: linkedProviders(identities),
      },
      identities,
    };
  };
  return {
    initialize: () =>
      safe(async () => {
        // Guest startup must not need provider configuration or create an account.
        if (!url && !key) return null;
        const expected = generation;
        const auth = getClient().auth;
        if (Platform.OS === 'web') {
          const callback = new URL(window.location.href);
          if (
            callback.pathname === '/auth/callback' &&
            (callback.searchParams.has('code') ||
              callback.searchParams.has('error'))
          ) {
            const code = callback.searchParams.get('code');
            const failed = callback.searchParams.has('error');
            window.history.replaceState(null, '', '/auth/callback');
            if (failed || !code) throw new ProviderAuthError('AUTH');
            const result = await auth.exchangeCodeForSession(code);
            if (result.error) throw new ProviderAuthError('AUTH');
          }
        }
        if (active) await auth.startAutoRefresh();
        return (await verifiedSession(expected))?.session ?? null;
      }),
    signIn: (provider: SignInProvider) =>
      safe(async () => {
        const expected = ++generation;
        const auth = getClient().auth;
        if (Platform.OS === 'web') {
          const result = await auth.signInWithOAuth({
            provider,
            options: {
              redirectTo: new URL('/auth/callback', window.location.origin)
                .href,
              skipBrowserRedirect: true,
            },
          });
          check(expected);
          if (result.error || !result.data.url)
            throw new ProviderAuthError('AUTH');
          window.location.assign(result.data.url);
          return 'redirecting';
        }
        const credential = await nativeProviderToken(provider);
        check(expected);
        if (!credential) return null;
        const result = await auth.signInWithIdToken({
          provider,
          ...credential,
        });
        check(expected);
        if (result.error) throw new ProviderAuthError('AUTH');
        if (active) await auth.startAutoRefresh();
        return projection(result.data.session);
      }),
    linkIdentity: (provider: SignInProvider) =>
      safe(async () => {
        const expected = generation;
        const current = await verifiedSession(expected);
        if (!current) throw new ProviderAuthError('AUTH');
        if (current.session.linkedProviders.includes(provider))
          return current.session;
        const auth = getClient().auth;
        if (Platform.OS === 'web') {
          const result = await auth.linkIdentity({
            provider,
            options: {
              redirectTo: new URL('/auth/callback', window.location.origin)
                .href,
              skipBrowserRedirect: true,
            },
          });
          check(expected);
          if (result.error || !result.data.url)
            throw new ProviderAuthError('AUTH');
          window.location.assign(result.data.url);
          return 'redirecting';
        }
        const credential = await nativeProviderToken(provider);
        check(expected);
        if (!credential) return null;
        const beforeLink = await session();
        check(expected);
        if (beforeLink?.authUserId !== current.session.authUserId)
          throw new ProviderAuthError('AUTH');
        const result = await auth.linkIdentity({ provider, ...credential });
        check(expected);
        if (result.error) throw new ProviderAuthError('AUTH');
        const linked = await verifiedSession(
          expected,
          current.session.authUserId,
        );
        if (!linked?.session.linkedProviders.includes(provider))
          throw new ProviderAuthError('AUTH');
        return linked.session;
      }),
    unlinkIdentity: (provider: SignInProvider) =>
      safe(async () => {
        const expected = generation;
        const current = await verifiedSession(expected);
        if (!current) throw new ProviderAuthError('AUTH');
        const identity = current.identities.find(
          (item) => item.provider === provider,
        );
        // A retry after a lost acknowledgement is already complete.
        if (!identity) return current.session;
        if (!current.session.linkedProviders.some((item) => item !== provider))
          throw new ProviderAuthError('LAST_PROVIDER');
        const result = await getClient().auth.unlinkIdentity(identity);
        check(expected);
        if (result.error) throw new ProviderAuthError('AUTH');
        const unlinked = await verifiedSession(
          expected,
          current.session.authUserId,
        );
        if (!unlinked || unlinked.session.linkedProviders.includes(provider))
          throw new ProviderAuthError('AUTH');
        return unlinked.session;
      }),
    refresh: () =>
      safe(async () => {
        const expected = generation;
        const result = await getClient().auth.refreshSession();
        check(expected);
        if (result.error) throw new ProviderAuthError('AUTH');
        if (!result.data.session) return null;
        return (
          (await verifiedSession(expected, result.data.session.user.id))
            ?.session ?? null
        );
      }),
    signOut: () =>
      safe(async () => {
        generation++;
        if (!url && !key) return;
        const result = await getClient().auth.signOut({ scope: 'local' });
        if (result.error) throw new ProviderAuthError('AUTH');
        await getClient().auth.stopAutoRefresh();
      }),
    setActive: (value) => {
      active = value;
      if (client) {
        // This background lifecycle operation owns its failure. Publishing a
        // missing session fences authenticated work until the next verification.
        const operation = active
          ? client.auth.startAutoRefresh()
          : client.auth.stopAutoRefresh();
        void operation.catch(() =>
          listeners.forEach((listener) => listener(null)),
        );
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      disposed = true;
      generation++;
      unsubscribe();
      // Stopping an already disposed refresh worker has no data-side effect.
      if (client) void client.auth.stopAutoRefresh().catch(() => undefined);
      listeners.clear();
    },
  };
}
