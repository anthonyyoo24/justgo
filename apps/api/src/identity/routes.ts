import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  credentialCreateSchema,
  credentialsResponseSchema,
  devicesResponseSchema,
  idSchema,
  okSchema,
  secretSchema,
  sessionCreateSchema,
  sessionResponseSchema,
  transferApproveSchema,
  transferInspectSchema,
  transferInspectionResponseSchema,
  transferResponseSchema,
  transferStartSchema,
} from '@justgo/contracts';
import { IdentityError, type IdentityService } from './service.js';
import { rateAddress } from './address.js';

export function bearer(request: FastifyRequest) {
  const value = request.headers.authorization;
  const parsed = secretSchema.safeParse(
    value?.startsWith('Bearer ') ? value.slice(7) : undefined,
  );
  if (!parsed.success) throw new IdentityError('UNAUTHORIZED');
  return parsed.data;
}
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new IdentityError('INVALID_REQUEST', 400);
  return parsed.data;
}
export function identityRoutes(
  app: FastifyInstance,
  service: IdentityService,
  onVercel = false,
) {
  app.addHook('onRequest', async (request) => {
    // The connection address is authoritative; arbitrary forwarding headers are not trusted.
    await service.rateLimit(
      rateAddress(request.ip, request.headers, onVercel),
      'identity',
      120,
    );
  });
  const sensitive = async (request: FastifyRequest) =>
    service.rateLimit(
      rateAddress(request.ip, request.headers, onVercel),
      'recovery',
    );
  app.post(
    '/sessions',
    {
      preHandler: async (request) => {
        // Classify before full validation so malformed recovery proofs also use
        // the stricter budget. Renewals retain their existing general budget.
        const renewal = z
          .object({ kind: z.literal('renewal') })
          .safeParse(request.body);
        if (!renewal.success) await sensitive(request);
      },
    },
    async (request) => {
      const data = parse(sessionCreateSchema, request.body);
      let session;
      switch (data.kind) {
        case 'bootstrap':
          session = await service.bootstrap(data);
          break;
        case 'recovery':
          session = await service.bootstrap(data, false);
          break;
        case 'renewal':
          session = await service.renew(bearer(request), data);
          break;
        case 'transfer':
          session = await service.redeemTransfer(data.code, data.claimSecret);
          break;
      }
      return sessionResponseSchema.parse(session);
    },
  );
  app.get('/sessions/current', async (request) =>
    sessionResponseSchema.parse(await service.me(bearer(request))),
  );
  app.get('/devices', async (request) =>
    devicesResponseSchema.parse(await service.listDevices(bearer(request))),
  );
  app.delete('/devices/:id', async (request) =>
    okSchema.parse(
      await service.revokeDevice(
        bearer(request),
        parse(idSchema, request.params).id,
      ),
    ),
  );
  app.get('/credentials', async (request) =>
    credentialsResponseSchema.parse(
      await service.listCredentials(bearer(request)),
    ),
  );
  app.post('/credentials', async (request) =>
    okSchema.parse(
      await service.addCredential(
        bearer(request),
        parse(credentialCreateSchema, request.body),
      ),
    ),
  );
  app.delete('/credentials/:id', async (request) =>
    okSchema.parse(
      await service.revokeCredential(
        bearer(request),
        parse(idSchema, request.params).id,
      ),
    ),
  );
  app.post('/transfers', { preHandler: sensitive }, async (request) =>
    transferResponseSchema.parse(
      await service.startTransfer(parse(transferStartSchema, request.body)),
    ),
  );
  app.post(
    '/transfer-inspections',
    { preHandler: sensitive },
    async (request) =>
      transferInspectionResponseSchema.parse(
        await service.inspectTransfer(
          bearer(request),
          parse(transferInspectSchema, request.body).code,
        ),
      ),
  );
  app.post(
    '/transfer-approvals',
    { preHandler: sensitive },
    async (request) => {
      const data = parse(transferApproveSchema, request.body);
      return okSchema.parse(
        await service.approveTransfer(
          bearer(request),
          data.code,
          data.verification,
        ),
      );
    },
  );
  app.delete('/transfers/:id', async (request) =>
    okSchema.parse(
      await service.cancelTransfer(
        bearer(request),
        parse(idSchema, request.params).id,
        parse(transferInspectSchema, request.body).code,
      ),
    ),
  );
}
