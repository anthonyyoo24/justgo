import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  bootstrapSchema,
  credentialCreateSchema,
  credentialsResponseSchema,
  devicesResponseSchema,
  idSchema,
  okSchema,
  renewSchema,
  secretSchema,
  sessionResponseSchema,
  transferApproveSchema,
  transferInspectSchema,
  transferInspectionResponseSchema,
  transferProofSchema,
  transferResponseSchema,
  transferStartSchema,
} from '@justgo/contracts';
import { IdentityError, type IdentityService } from './service.js';
import { rateAddress } from './address.js';

function bearer(request: FastifyRequest) {
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
  app.post('/bootstrap', { preHandler: sensitive }, async (request) =>
    sessionResponseSchema.parse(
      await service.bootstrap(parse(bootstrapSchema, request.body)),
    ),
  );
  app.post('/recover', { preHandler: sensitive }, async (request) =>
    sessionResponseSchema.parse(
      await service.bootstrap(parse(bootstrapSchema, request.body), false),
    ),
  );
  app.post('/renew', async (request) =>
    sessionResponseSchema.parse(
      await service.renew(bearer(request), parse(renewSchema, request.body)),
    ),
  );
  app.get('/me', async (request) =>
    sessionResponseSchema.parse(await service.me(bearer(request))),
  );
  app.get('/devices', async (request) =>
    devicesResponseSchema.parse(await service.listDevices(bearer(request))),
  );
  app.post('/devices/:id/revoke', async (request) =>
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
  app.post('/credentials/:id/revoke', async (request) =>
    okSchema.parse(
      await service.revokeCredential(
        bearer(request),
        parse(idSchema, request.params).id,
      ),
    ),
  );
  app.post('/transfers/start', { preHandler: sensitive }, async (request) =>
    transferResponseSchema.parse(
      await service.startTransfer(parse(transferStartSchema, request.body)),
    ),
  );
  app.post('/transfers/inspect', { preHandler: sensitive }, async (request) =>
    transferInspectionResponseSchema.parse(
      await service.inspectTransfer(
        bearer(request),
        parse(transferInspectSchema, request.body).code,
      ),
    ),
  );
  app.post('/transfers/approve', { preHandler: sensitive }, async (request) => {
    const data = parse(transferApproveSchema, request.body);
    return okSchema.parse(
      await service.approveTransfer(
        bearer(request),
        data.code,
        data.verification,
      ),
    );
  });
  app.post('/transfers/cancel', async (request) =>
    okSchema.parse(
      await service.cancelTransfer(
        bearer(request),
        parse(transferInspectSchema, request.body).code,
      ),
    ),
  );
  app.post('/transfers/redeem', { preHandler: sensitive }, async (request) => {
    const data = parse(transferProofSchema, request.body);
    return sessionResponseSchema.parse(
      await service.redeemTransfer(data.code, data.claimSecret),
    );
  });
}
