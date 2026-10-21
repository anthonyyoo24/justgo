import { z } from 'zod';
import {
  ProviderAuthError,
  type ManagedAuth,
  type ProviderSession,
  type SignInProvider,
} from '../src/app-support/identity/auth/types';

const sessionKey = 'justgo.fixture.provider-session.v1';
const subjectKey = 'justgo.fixture.provider-subject.v1';
const handleSchema = z.string().regex(/^[a-f\d]{32}$/);
const providerSchema = z.enum(['apple', 'google']);
const sessionSchema = z
  .object({
    authUserId: z.uuid(),
    accessToken: z.string().min(20).max(16_384),
    expiresAt: z.iso.datetime(),
    linkedProviders: z.array(providerSchema).max(2),
  })
  .strict();
const envelopeSchema = z
  .object({ subjectHandle: handleSchema, session: sessionSchema })
  .strict();
const storedSchema = envelopeSchema
  .extend({ provider: providerSchema })
  .strict();
interface FixtureStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type ProviderFixtureControl = {
  selectSubject(subjectHandle: string | null): void;
};
declare global {
  var justgoProviderFixture: ProviderFixtureControl | undefined;
}

/** Only the external OAuth boundary is synthetic; all JustGO requests are real. */
export function createJourneyManagedAuth(options: {
  apiUrl: string | undefined;
  origin: string;
  fixtureEnabled: boolean;
  production: boolean;
  storage: FixtureStorage;
  fetcher?: typeof fetch;
  now?: () => number;
}): { auth: ManagedAuth; control: ProviderFixtureControl } {
  let api: URL;
  try {
    api = new URL(options.apiUrl ?? '');
    const origin = new URL(options.origin);
    if (
      !options.fixtureEnabled ||
      options.production ||
      api.protocol !== 'http:' ||
      api.hostname !== '127.0.0.1' ||
      !api.port ||
      api.username ||
      api.password ||
      api.pathname !== '/' ||
      api.search ||
      api.hash ||
      origin.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost'].includes(origin.hostname) ||
      !origin.port ||
      origin.username ||
      origin.password
    )
      throw new Error('Invalid isolated fixture');
  } catch {
    throw new ProviderAuthError('CONFIGURATION');
  }
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const lifetime = new AbortController();
  const listeners = new Set<(session: ProviderSession | null) => void>();
  let disposed = false;
  let generation = 0;
  let saved: z.infer<typeof storedSchema> | null = null;
  const check = (expected = generation) => {
    if (disposed || expected !== generation)
      throw new ProviderAuthError('CANCELLED');
  };
  const store = <T>(action: () => T): T => {
    try {
      return action();
    } catch {
      throw new ProviderAuthError('STORAGE');
    }
  };
  const selected = () =>
    store(() => {
      const value = options.storage.getItem(subjectKey);
      if (value === null) return null;
      const parsed = handleSchema.safeParse(value);
      if (!parsed.success) throw new ProviderAuthError('STORAGE');
      return parsed.data;
    });
  const load = () => {
    if (saved) return saved;
    return store(() => {
      const value = options.storage.getItem(sessionKey);
      if (!value) return null;
      const parsed = storedSchema.safeParse(JSON.parse(value));
      if (!parsed.success || selected() !== parsed.data.subjectHandle)
        throw new ProviderAuthError('STORAGE');
      saved = parsed.data;
      return saved;
    });
  };
  const emit = (session: ProviderSession | null) => {
    for (const listener of listeners) listener(session);
  };
  const retain = (
    envelope: z.infer<typeof envelopeSchema>,
    provider: SignInProvider,
    expected: number,
  ) => {
    check(expected);
    const value = storedSchema.parse({ ...envelope, provider });
    store(() => {
      options.storage.setItem(subjectKey, value.subjectHandle);
      options.storage.setItem(sessionKey, JSON.stringify(value));
    });
    saved = value;
    emit(value.session);
    return value.session;
  };
  const request = async <T>(
    path:
      | 'provider-sessions'
      | 'provider-links'
      | 'provider-unlinks'
      | 'provider-sign-outs',
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T> => {
    check();
    const expected = generation;
    try {
      const response = await fetcher(new URL(`/__fixtures/${path}`, api).href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        signal: lifetime.signal,
      });
      check(expected);
      if (
        !response.ok ||
        new URL(response.url || api.href).origin !== api.origin
      )
        throw new ProviderAuthError('AUTH');
      const value: unknown = await response.json();
      check(expected);
      return schema.parse(value);
    } catch (error) {
      if (error instanceof ProviderAuthError) throw error;
      if (disposed || lifetime.signal.aborted)
        throw new ProviderAuthError('CANCELLED');
      throw new ProviderAuthError('AUTH');
    }
  };
  const control: ProviderFixtureControl = {
    selectSubject(subjectHandle) {
      check();
      if (
        subjectHandle !== null &&
        !handleSchema.safeParse(subjectHandle).success
      )
        throw new ProviderAuthError('CONFIGURATION');
      generation++;
      store(() => {
        if (subjectHandle === null) options.storage.removeItem(subjectKey);
        else options.storage.setItem(subjectKey, subjectHandle);
        options.storage.removeItem(sessionKey);
      });
      saved = null;
    },
  };
  const auth: ManagedAuth = {
    initialize: async () => {
      check();
      const value = load();
      return value && Date.parse(value.session.expiresAt) > now()
        ? value.session
        : null;
    },
    signIn: async (provider) => {
      if (!providerSchema.safeParse(provider).success)
        throw new ProviderAuthError('CONFIGURATION');
      const expected = ++generation;
      const handle = selected();
      const envelope = await request(
        'provider-sessions',
        { provider, ...(handle ? { subjectHandle: handle } : {}) },
        envelopeSchema,
      );
      if (handle && envelope.subjectHandle !== handle)
        throw new ProviderAuthError('AUTH');
      return retain(envelope, provider, expected);
    },
    linkIdentity: async (provider) => {
      const expected = generation;
      const current = load();
      if (!current) throw new ProviderAuthError('AUTH');
      const envelope = await request(
        'provider-links',
        { accessToken: current.session.accessToken, provider },
        envelopeSchema,
      );
      if (
        envelope.subjectHandle !== current.subjectHandle ||
        envelope.session.authUserId !== current.session.authUserId ||
        envelope.session.accessToken !== current.session.accessToken
      )
        throw new ProviderAuthError('AUTH');
      return retain(envelope, provider, expected);
    },
    unlinkIdentity: async (provider) => {
      check();
      const expected = generation;
      const current = load();
      if (!current || Date.parse(current.session.expiresAt) <= now())
        throw new ProviderAuthError('AUTH');
      if (!current.session.linkedProviders.includes(provider))
        return current.session;
      if (!current.session.linkedProviders.some((item) => item !== provider))
        throw new ProviderAuthError('LAST_PROVIDER');
      const envelope = await request(
        'provider-unlinks',
        { accessToken: current.session.accessToken, provider },
        envelopeSchema,
      );
      if (
        envelope.subjectHandle !== current.subjectHandle ||
        envelope.session.authUserId !== current.session.authUserId ||
        envelope.session.accessToken !== current.session.accessToken ||
        envelope.session.linkedProviders.includes(provider) ||
        !envelope.session.linkedProviders.length
      )
        throw new ProviderAuthError('AUTH');
      const remaining = envelope.session.linkedProviders[0]!;
      return retain(envelope, remaining, expected);
    },
    refresh: async () => {
      check();
      const value = load();
      return value && Date.parse(value.session.expiresAt) > now()
        ? value.session
        : null;
    },
    signOut: async () => {
      check();
      generation++;
      const value = load();
      if (value)
        await request(
          'provider-sign-outs',
          { accessToken: value.session.accessToken },
          z.object({ ok: z.literal(true) }).strict(),
        );
      store(() => options.storage.removeItem(sessionKey));
      saved = null;
      emit(null);
    },
    // The fixture has no background OAuth refresh timers. Session liveness is
    // checked by the real API before any owner-scoped operation.
    setActive: () => {},
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      lifetime.abort();
      listeners.clear();
    },
  };
  return { auth, control };
}

// Metro maps only create-managed-identity's web import to this factory after
// validating the local fixture environment. Native and production keep the SDK.
export function createManagedAuth(): ManagedAuth {
  if (typeof window === 'undefined')
    throw new ProviderAuthError('CONFIGURATION');
  let storage: FixtureStorage;
  try {
    storage = window.sessionStorage;
  } catch {
    throw new ProviderAuthError('STORAGE');
  }
  const { auth, control } = createJourneyManagedAuth({
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    origin: window.location.origin,
    fixtureEnabled: process.env.EXPO_PUBLIC_JUSTGO_JOURNEY_FIXTURE === '1',
    production: process.env.NODE_ENV === 'production',
    storage,
  });
  globalThis.justgoProviderFixture = control;
  return {
    ...auth,
    dispose() {
      auth.dispose();
      if (globalThis.justgoProviderFixture === control)
        globalThis.justgoProviderFixture = undefined;
    },
  };
}
