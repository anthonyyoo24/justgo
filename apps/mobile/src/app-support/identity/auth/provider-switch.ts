import { z } from 'zod';
import { okSchema } from '@justgo/contracts';
import type { IdentityApi } from '../api';
import { ApiError } from '../../../lib/network/http';
import type { SecureStorageDriver } from '../../../platform/auth/secure-storage';

const key = 'justgo.auth.provider-switch-proof.v1';
const proofSchema = z
  .object({
    token: z.string().min(1),
    authUserId: z.uuid(),
  })
  .strict();

/** The old bearer stays in secure storage until its app session is revoked. */
export function providerSwitchProof(storage: SecureStorageDriver) {
  return {
    async read() {
      const raw = await storage.getItem(key);
      return raw === null ? null : proofSchema.parse(JSON.parse(raw));
    },
    async write(proof: z.infer<typeof proofSchema>) {
      await storage.setItem(key, JSON.stringify(proofSchema.parse(proof)));
    },
    async clear() {
      await storage.removeItem(key);
    },
    async revoke(api: IdentityApi, signal: AbortSignal) {
      const raw = await storage.getItem(key);
      if (raw === null) return;
      const proof = proofSchema.parse(JSON.parse(raw));
      try {
        await api.request(
          'POST',
          '/auth/logout',
          okSchema,
          { scope: 'session' },
          proof.token,
          signal,
        );
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          !['UNAUTHORIZED', 'SESSION_REVOKED', 'SESSION_EXPIRED'].includes(
            error.code,
          )
        )
          throw error;
      }
      await storage.removeItem(key);
    },
  };
}
