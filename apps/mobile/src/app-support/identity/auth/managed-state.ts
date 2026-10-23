import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import {
  accountDeletionResponseSchema,
  managedSessionResponseSchema,
} from '@justgo/contracts';
import { ProviderAuthError } from './types';

export const managedIdentityStateSchema = z
  .object({
    version: z.literal(1),
    deviceId: z.uuid(),
    guestId: z.uuid(),
    guestAdoption: z
      .object({
        ownerId: z.uuid(),
        status: z.enum(['pending', 'copied', 'consumed']),
      })
      .strict()
      .nullable()
      .default(null),
    collection: z
      .object({ kind: z.enum(['guest', 'account']), id: z.uuid() })
      .strict(),
    mode: z.enum(['welcome', 'guest', 'signed-out', 'account']),
    account: managedSessionResponseSchema.nullable(),
    pendingSignIn: z
      .object({
        provider: z.enum(['apple', 'google']),
        mergeGuest: z.boolean(),
        guestId: z.uuid().nullable(),
        mappedOwnerId: z.uuid().nullable(),
        expectedOwnerId: z.uuid().nullable().default(null),
      })
      .strict()
      .nullable(),
    pendingLink: z
      .object({
        provider: z.enum(['apple', 'google']),
        ownerId: z.uuid(),
        authUserId: z.uuid(),
      })
      .strict()
      .nullable()
      .default(null),
    logoutPending: z.boolean(),
    deletion: z
      .object({
        userId: z.uuid(),
        receipt: accountDeletionResponseSchema.nullable(),
      })
      .strict()
      .nullable(),
    deleted: z.boolean(),
    linkedLegacyOwnerIds: z.array(z.uuid()).max(100).default([]),
  })
  .strict()
  .refine(
    (state) =>
      (state.collection.kind !== 'guest' ||
        state.collection.id === state.guestId) &&
      (state.mode !== 'guest' || state.collection.kind === 'guest') &&
      (state.mode !== 'account' ||
        (state.account !== null &&
          state.collection.kind === 'account' &&
          state.collection.id === state.account.userId)) &&
      (!state.pendingSignIn?.guestId ||
        state.pendingSignIn.guestId === state.guestId) &&
      (!state.guestAdoption || state.guestAdoption.ownerId !== state.guestId) &&
      (!state.deletion ||
        (state.collection.kind === 'account' &&
          state.deletion.userId === state.collection.id)),
  );
export type ManagedIdentityState = z.infer<typeof managedIdentityStateSchema>;
export interface ManagedIdentityStorage {
  read(): Promise<ManagedIdentityState | null>;
  write(state: ManagedIdentityState): Promise<void>;
}
const key = 'justgo.identity.managed.v1';

/** Nonsecret installation/owner metadata. Provider tokens live in separate secure storage. */
export function createManagedIdentityStorage(): ManagedIdentityStorage {
  return {
    read: async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        return raw === null
          ? null
          : managedIdentityStateSchema.parse(JSON.parse(raw));
      } catch {
        throw new ProviderAuthError('STORAGE');
      }
    },
    write: async (state) => {
      try {
        await AsyncStorage.setItem(
          key,
          JSON.stringify(managedIdentityStateSchema.parse(state)),
        );
      } catch {
        throw new ProviderAuthError('STORAGE');
      }
    },
  };
}
