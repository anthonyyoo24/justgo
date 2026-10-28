import { z } from 'zod';
import {
  ICLOUD_PAGE_LIMIT,
  ICLOUD_PREFERENCE_KEY,
  ICloudError,
  iCloudCollectionSchema,
  iCloudError,
  iCloudGenerationSchema,
  iCloudPageSchema,
  iCloudPreferenceSchema,
  iCloudPurgePageSchema,
  iCloudStatusSchema,
  iCloudValueSchema,
  type ICloudSync,
} from './model';

export interface ICloudNativeModule {
  status(): Promise<string>;
  configure(enabled: boolean, accountToken: string | null): Promise<string>;
  read(collection: string, cursor: string | null): Promise<string>;
  /** Also certifies that in-app deletion writes marker 1, including legacy roots. */
  readRetainingLocal?(
    collection: string,
    cursor: string | null,
  ): Promise<string>;
  write(
    collection: string,
    generation: string,
    records: string,
  ): Promise<string>;
  reset(collection: string, generation: string): Promise<string>;
  resetIfUnchanged?(
    collection: string,
    generation: string,
    revision: string,
  ): Promise<string>;
  close(collection: string, generation: string): Promise<string>;
  purge(
    collection: string,
    generation: string,
    cursor: string | null,
  ): Promise<string>;
  addListener(
    event: 'onAccountChanged',
    listener: () => void,
  ): { remove(): void };
}
export interface ICloudPreferenceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function decoded<T>(schema: z.ZodType<T>, value: string): T {
  if (typeof value !== 'string' || value.length > 20_000_000)
    throw new ICloudError('INVALID_DATA');
  try {
    const result = schema.safeParse(JSON.parse(value));
    if (result.success) return result.data;
  } catch {
    // Native output is untrusted until the whole bounded result is validated.
  }
  throw new ICloudError('INVALID_DATA');
}

export function createICloudSync(
  native: ICloudNativeModule | null,
  storage: ICloudPreferenceStorage,
): ICloudSync {
  let enabled = false;
  let pin: string | null = null;
  let epoch = 0;
  let disposed = false;
  let maintenance: symbol | null = null;
  let activation: number | null = null;
  let ready: Promise<void> | null = null;
  let preferences: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const persist = (value: {
    enabled: boolean;
    accountToken: string | null;
  }) => {
    const work = () =>
      storage.setItem(
        ICLOUD_PREFERENCE_KEY,
        JSON.stringify({ version: 2, ...value }),
      );
    const result = preferences.then(work, work);
    preferences = result.catch(() => undefined);
    return result;
  };
  const disable = async () => {
    enabled = false;
    pin = null;
    maintenance = null;
    epoch++;
    await Promise.all([
      native?.configure(false, null),
      persist({ enabled: false, accountToken: null }),
    ]);
    notify();
  };
  const subscription = native?.addListener('onAccountChanged', () => {
    // Native has already disabled/cancelled its work. Fence JS continuations
    // immediately, then persist off even if the app never opens Settings again.
    enabled = false;
    pin = null;
    maintenance = null;
    epoch++;
    notify();
    void persist({ enabled: false, accountToken: null }).catch(() => undefined);
  });
  const initialize = () => {
    if (ready) return ready;
    const capturedEpoch = epoch;
    ready = (async () => {
      if (!native) return;
      let preference;
      try {
        const raw = await storage.getItem(ICLOUD_PREFERENCE_KEY);
        preference = raw
          ? iCloudPreferenceSchema.safeParse(JSON.parse(raw))
          : null;
      } catch {
        return;
      }
      if (disposed || capturedEpoch !== epoch) return;
      if (preference?.success && preference.data.version === 1) {
        // Earlier saved choices cannot prove a completed first sync. Preserve
        // every local/cloud record, but require a fresh successful opt-in.
        await disable();
        return;
      }
      if (
        !preference?.success ||
        !preference.data.enabled ||
        !preference.data.accountToken
      )
        return;
      try {
        await native.configure(true, preference.data.accountToken);
        if (disposed || capturedEpoch !== epoch) return;
        pin = preference.data.accountToken;
        enabled = true;
      } catch {
        // A changed Apple account needs a new explicit choice. Never adopt the
        // new identity while applying an old account's saved enabled setting.
        await disable();
      }
    })();
    return ready;
  };
  const check = (capturedEpoch: number, access?: symbol) => {
    if (
      disposed ||
      capturedEpoch !== epoch ||
      (access ? maintenance !== access : !enabled || maintenance !== null)
    )
      throw new ICloudError('DISABLED');
  };
  const request = async <T>(
    action: (module: ICloudNativeModule) => Promise<string>,
    schema: z.ZodType<T>,
    access?: symbol,
  ): Promise<T> => {
    await initialize();
    if (!native) throw new ICloudError('UNSUPPORTED');
    const capturedEpoch = epoch;
    check(capturedEpoch, access);
    if (!native.readRetainingLocal) throw new ICloudError('NOT_CONFIGURED');
    try {
      const value = await action(native);
      check(capturedEpoch, access);
      return decoded(schema, value);
    } catch (error) {
      if (capturedEpoch !== epoch || disposed)
        throw new ICloudError('DISABLED');
      const safe = iCloudError(error);
      if (safe.code === 'ACCOUNT_CHANGED' || safe.code === 'NOT_AUTHENTICATED')
        await disable().catch(() => undefined);
      throw safe;
    }
  };
  const operations = (
    access?: symbol,
  ): Pick<ICloudSync, 'read' | 'write' | 'reset' | 'purge' | 'close'> => ({
    async read({ collection, cursor }) {
      if (
        !iCloudCollectionSchema.safeParse(collection).success ||
        (cursor !== undefined && (!cursor || cursor.length > 32_768))
      )
        throw new ICloudError('INVALID_DATA');
      return request(
        (module) => {
          if (!module.readRetainingLocal)
            throw new ICloudError('NOT_CONFIGURED');
          return module.readRetainingLocal(collection, cursor ?? null);
        },
        iCloudPageSchema,
        access,
      );
    },
    async write({ collection, generation, records }) {
      const parsed = z
        .object({
          collection: iCloudCollectionSchema,
          generation: z.uuid(),
          records: z.array(iCloudValueSchema).min(1).max(ICLOUD_PAGE_LIMIT),
        })
        .safeParse({ collection, generation, records });
      if (
        !parsed.success ||
        new Set(records.map(({ id }) => id.toLowerCase())).size !==
          records.length
      )
        throw new ICloudError('INVALID_DATA');
      const response = await request(
        (module) =>
          module.write(
            collection,
            generation,
            JSON.stringify(parsed.data.records),
          ),
        iCloudGenerationSchema,
        access,
      );
      if (response.generation !== generation)
        throw new ICloudError('STALE_GENERATION');
      return response;
    },
    async reset({ collection, generation, expectedRevision }) {
      if (
        !iCloudCollectionSchema.safeParse(collection).success ||
        !z.uuid().safeParse(generation).success ||
        (expectedRevision !== undefined &&
          (typeof expectedRevision !== 'string' ||
            !expectedRevision ||
            expectedRevision.length > 1024))
      )
        throw new ICloudError('INVALID_DATA');
      const response = await request(
        (module) => {
          if (expectedRevision === undefined)
            return module.reset(collection, generation);
          if (!module.resetIfUnchanged) throw new ICloudError('NOT_CONFIGURED');
          return module.resetIfUnchanged(
            collection,
            generation,
            expectedRevision,
          );
        },
        iCloudGenerationSchema,
        access,
      );
      if (response.generation === generation)
        throw new ICloudError('INVALID_DATA');
      return response;
    },
    async purge({ collection, generation, cursor }) {
      if (
        !iCloudCollectionSchema.safeParse(collection).success ||
        !z.uuid().safeParse(generation).success ||
        (cursor !== undefined && (!cursor || cursor.length > 32_768))
      )
        throw new ICloudError('INVALID_DATA');
      const response = await request(
        (module) => module.purge(collection, generation, cursor ?? null),
        iCloudPurgePageSchema,
        access,
      );
      if (response.generation !== generation)
        throw new ICloudError('STALE_GENERATION');
      return response;
    },
    async close({ collection, generation }) {
      if (
        collection === 'guest' ||
        !iCloudCollectionSchema.safeParse(collection).success ||
        !z.uuid().safeParse(generation).success
      )
        throw new ICloudError('INVALID_DATA');
      return request(
        (module) => module.close(collection, generation),
        iCloudGenerationSchema,
        access,
      );
    },
  });
  return {
    async status() {
      await initialize();
      if (!native)
        return { status: 'unsupported', accountToken: null, enabled: false };
      if (disposed) throw new ICloudError('DISABLED');
      const capturedEpoch = epoch;
      try {
        const status = decoded(iCloudStatusSchema, await native.status());
        if (disposed || capturedEpoch !== epoch)
          throw new ICloudError('DISABLED');
        if (
          !maintenance &&
          enabled &&
          (status.accountToken !== pin || !status.enabled)
        )
          await disable();
        return { ...status, enabled: enabled && status.enabled };
      } catch (error) {
        throw iCloudError(error);
      }
    },
    async setEnabled(
      value: boolean,
      synchronize?: () => Promise<void>,
      isCurrent: () => boolean = () => true,
    ) {
      if (maintenance) throw new ICloudError('DISABLED');
      if (!value) {
        try {
          await disable();
        } catch (error) {
          throw iCloudError(error);
        }
        return;
      }
      if (!synchronize) throw new ICloudError('INVALID_DATA');
      await initialize();
      if (!native) throw new ICloudError('UNSUPPORTED');
      if (disposed || maintenance) throw new ICloudError('DISABLED');
      const capturedEpoch = ++epoch;
      activation = capturedEpoch;
      const checkActivation = () => {
        if (disposed || capturedEpoch !== epoch || !isCurrent())
          throw new ICloudError('DISABLED');
      };
      try {
        checkActivation();
        // A crash or relaunch during initial sync must reopen with sync off.
        enabled = false;
        pin = null;
        await persist({ enabled: false, accountToken: null });
        checkActivation();
        const status = decoded(iCloudStatusSchema, await native.status());
        if (status.status !== 'available' || !status.accountToken) {
          const code =
            status.status === 'not_configured'
              ? 'NOT_CONFIGURED'
              : status.status === 'restricted'
                ? 'RESTRICTED'
                : status.status === 'not_authenticated'
                  ? 'NOT_AUTHENTICATED'
                  : 'UNAVAILABLE';
          throw new ICloudError(code);
        }
        checkActivation();
        await native.configure(true, status.accountToken);
        checkActivation();
        // The coordinator needs temporary access, without publishing or saving
        // an enabled preference until its complete first pass succeeds.
        pin = status.accountToken;
        enabled = true;
        await synchronize();
        checkActivation();
        await persist({ enabled: true, accountToken: status.accountToken });
        checkActivation();
        notify();
      } catch (error) {
        if (capturedEpoch === epoch) await disable().catch(() => undefined);
        throw iCloudError(error);
      } finally {
        if (activation === capturedEpoch) activation = null;
      }
    },
    async withMaintenance(accountToken, action) {
      if (!/^[a-f\d]{64}$/.test(accountToken))
        throw new ICloudError('INVALID_DATA');
      await initialize();
      if (!native) throw new ICloudError('UNSUPPORTED');
      if (disposed || maintenance || activation !== null)
        throw new ICloudError('DISABLED');
      const access = Symbol('icloud-maintenance');
      let changedNative = false;
      let failure: ICloudError | undefined;
      const wasEnabled = enabled;
      const previousPin = pin;
      maintenance = access;
      const capturedEpoch = ++epoch;
      try {
        const status = decoded(iCloudStatusSchema, await native.status());
        check(capturedEpoch, access);
        if (status.accountToken !== accountToken)
          throw new ICloudError('ACCOUNT_CHANGED');
        changedNative = true;
        await native.configure(true, accountToken);
        check(capturedEpoch, access);
        const scoped: ICloudSync = {
          ...operations(access),
          async status() {
            check(capturedEpoch, access);
            const current = decoded(iCloudStatusSchema, await native.status());
            check(capturedEpoch, access);
            if (current.accountToken !== accountToken)
              throw new ICloudError('ACCOUNT_CHANGED');
            return { ...current, enabled: true };
          },
          async setEnabled() {
            throw new ICloudError('DISABLED');
          },
          subscribe: () => () => {},
          dispose() {},
        };
        await action(scoped);
        check(capturedEpoch, access);
      } catch (error) {
        failure = iCloudError(error);
      } finally {
        if (maintenance === access) {
          maintenance = null;
          if (changedNative && !disposed && epoch === capturedEpoch) {
            // Access is temporary: retain the user's actual toggle preference.
            try {
              await native.configure(
                wasEnabled,
                wasEnabled ? previousPin : null,
              );
            } catch (error) {
              await disable().catch(() => undefined);
              failure ??= iCloudError(error);
            }
          }
        }
      }
      if (failure) throw failure;
    },
    ...operations(),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      enabled = false;
      epoch++;
      subscription?.remove();
      listeners.clear();
      // Disposal stops this runtime, without changing the user's saved choice.
      void native?.configure(false, null).catch(() => undefined);
    },
  };
}
