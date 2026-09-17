import { z } from 'zod';
import {
  secretSchema,
  sessionProposalSchema,
  sessionResponseSchema,
  transferStartSchema,
} from '@justgo/contracts';

export const credentialSchema = z
  .object({ id: z.uuid(), secret: secretSchema })
  .strict();
export const deviceStateSchema = z
  .object({
    deviceId: z.uuid(),
    selectedId: z.uuid().nullable(),
    session: z
      .object({ token: secretSchema, info: sessionResponseSchema })
      .nullable(),
    pending: z
      .discriminatedUnion('kind', [
        z.object({
          kind: z.literal('bootstrap'),
          credentialId: z.uuid(),
          secret: secretSchema,
          proposal: sessionProposalSchema,
        }),
        z.object({
          kind: z.literal('recover'),
          credentialId: z.uuid(),
          proposal: sessionProposalSchema,
        }),
        z.object({ kind: z.literal('renew'), proposal: sessionProposalSchema }),
        z.object({
          kind: z.literal('transfer'),
          credentialId: z.uuid(),
          input: transferStartSchema,
        }),
      ])
      .nullable(),
    savedKey: z
      .object({ id: z.uuid(), secret: secretSchema, registered: z.boolean() })
      .nullable(),
    // New sync credentials registered after an explicit fallback recovery.
    registration: z.object({ id: z.uuid(), secret: secretSchema }).nullable(),
  })
  .strict();
export type DeviceState = z.infer<typeof deviceStateSchema>;
export type StoredCredential = z.infer<typeof credentialSchema>;
export interface CredentialVault {
  readonly kind: 'keychain' | 'memory';
  read(): Promise<DeviceState | null>;
  write(value: DeviceState): Promise<void>;
  credentials(): Promise<StoredCredential[]>;
  add(value: StoredCredential): Promise<void>;
}
// Explicit development browser preview: no localStorage, cookies, IndexedDB, or journal cache.
export function createMemoryVault(): CredentialVault {
  let state: DeviceState | null = null;
  const credentials: StoredCredential[] = [];
  return {
    kind: 'memory',
    read: async () => (state ? deviceStateSchema.parse(state) : null),
    write: async (value) => {
      state = deviceStateSchema.parse(value);
    },
    credentials: async () => credentials.map((value) => ({ ...value })),
    add: async (value) => {
      const old = credentials.find((c) => c.id === value.id);
      if (old && old.secret !== value.secret)
        throw new Error('Credential collision');
      if (!old) credentials.push({ ...value });
    },
  };
}
