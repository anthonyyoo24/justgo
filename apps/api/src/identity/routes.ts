import { bearer } from '../http/bearer.js';
import { parse } from '../http/parse.js';
import { z } from 'zod';
import type { ApiApp, ApiContext } from '../http/request.js';
import { parseRequestBody, requestBody } from '../http/request.js';
import {
  credentialCreateSchema,
  credentialsResponseSchema,
  devicesResponseSchema,
  idSchema,
  okSchema,
  sessionCreateSchema,
  sessionResponseSchema,
  transferApproveSchema,
  transferCancelSchema,
  transferCancelResponseSchema,
  transferInspectSchema,
  transferInspectionResponseSchema,
  transferResponseSchema,
  transferStartSchema,
  accountDeletionRequestSchema,
  accountDeletionResponseSchema,
} from '@justgo/contracts';
import { DeleteAccountService } from './delete-account.js';
import type { IdentityService } from './service.js';
import { ApiError } from '../http/api-error.js';
import { rateAddress } from './address.js';

export function identityRoutes(
  app: ApiApp,
  service: IdentityService,
  onVercel = false,
  legacyIdentityEnabled = true,
) {
  const general = async (request: ApiContext, next: () => Promise<void>) => {
    // The connection address is authoritative; arbitrary forwarding headers are not trusted.
    await service.rateLimit(
      rateAddress(request.get('clientAddress'), request.req.header(), onVercel),
      'identity',
      120,
    );
    await next();
  };
  const sensitive = async (request: ApiContext, next: () => Promise<void>) => {
    await service.rateLimit(
      rateAddress(request.get('clientAddress'), request.req.header(), onVercel),
      'recovery',
    );
    await next();
  };
  app.delete('/account', general, parseRequestBody(), async (request) => {
    const token = bearer(request);
    parse(accountDeletionRequestSchema, requestBody(request));
    return request.json(
      accountDeletionResponseSchema.parse(
        await new DeleteAccountService(service).delete(token),
      ),
    );
  });
  app.post(
    '/sessions',
    general,
    parseRequestBody(),
    async (request, next) => {
      // Classify before full validation so malformed recovery proofs also use
      // the stricter budget. Renewals retain their existing general budget.
      const renewal = z
        .object({ kind: z.literal('renewal') })
        .safeParse(requestBody(request));
      if (!renewal.success) await sensitive(request, next);
      else await next();
    },
    async (request) => {
      const data = parse(sessionCreateSchema, requestBody(request));
      if (
        !legacyIdentityEnabled &&
        (data.kind === 'bootstrap' || data.kind === 'transfer')
      )
        throw new ApiError('CREDENTIAL_REJECTED', 410);
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
      return request.json(sessionResponseSchema.parse(session));
    },
  );
  app.get('/sessions/current', general, async (request) =>
    request.json(
      sessionResponseSchema.parse(await service.me(bearer(request))),
    ),
  );
  // Existing-proof recovery/renewal remains while unlinked installations migrate.
  if (!legacyIdentityEnabled) return;
  app.get('/devices', general, async (request) =>
    request.json(
      devicesResponseSchema.parse(await service.listDevices(bearer(request))),
    ),
  );
  app.delete('/devices/:id', general, parseRequestBody(), async (request) =>
    request.json(
      okSchema.parse(
        await service.revokeDevice(
          bearer(request),
          parse(idSchema, request.req.param()).id,
        ),
      ),
    ),
  );
  app.get('/credentials', general, async (request) =>
    request.json(
      credentialsResponseSchema.parse(
        await service.listCredentials(bearer(request)),
      ),
    ),
  );
  app.post('/credentials', general, parseRequestBody(), async (request) =>
    request.json(
      okSchema.parse(
        await service.addCredential(
          bearer(request),
          parse(credentialCreateSchema, requestBody(request)),
        ),
      ),
    ),
  );
  app.delete('/credentials/:id', general, parseRequestBody(), async (request) =>
    request.json(
      okSchema.parse(
        await service.revokeCredential(
          bearer(request),
          parse(idSchema, request.req.param()).id,
        ),
      ),
    ),
  );
  app.post(
    '/transfers',
    general,
    parseRequestBody(),
    sensitive,
    async (request) =>
      request.json(
        transferResponseSchema.parse(
          await service.startTransfer(
            parse(transferStartSchema, requestBody(request)),
          ),
        ),
      ),
  );
  app.post(
    '/transfer-inspections',
    general,
    parseRequestBody(),
    sensitive,
    async (request) =>
      request.json(
        transferInspectionResponseSchema.parse(
          await service.inspectTransfer(
            bearer(request),
            parse(transferInspectSchema, requestBody(request)).code,
          ),
        ),
      ),
  );
  app.post(
    '/transfer-approvals',
    general,
    parseRequestBody(),
    sensitive,
    async (request) => {
      const data = parse(transferApproveSchema, requestBody(request));
      return request.json(
        okSchema.parse(
          await service.approveTransfer(
            bearer(request),
            data.code,
            data.verification,
          ),
        ),
      );
    },
  );
  app.delete(
    '/transfers/:id',
    general,
    parseRequestBody(),
    sensitive,
    async (request) => {
      const id = parse(idSchema, request.req.param()).id;
      const data = parse(transferCancelSchema, requestBody(request));
      if ('claimSecret' in data) {
        if (data.id !== id) throw new ApiError('INVALID_REQUEST', 400);
        return request.json(
          transferCancelResponseSchema.parse(
            await service.cancelReceivingTransfer(data),
          ),
        );
      }
      return request.json(
        okSchema.parse(
          await service.cancelTransfer(bearer(request), id, data.code),
        ),
      );
    },
  );
}
