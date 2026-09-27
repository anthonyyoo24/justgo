import { z } from 'zod';
import * as challenges from './challenges.ts';
import * as identity from './identity.ts';
import { accessResponseSchema } from './access.ts';

const json = (schema: z.ZodType) => ({
  'application/json': { schema: z.toJSONSchema(schema) },
});
function operation(
  response: z.ZodType,
  body?: z.ZodType,
  authenticated = true,
) {
  return {
    security: authenticated ? [{ deviceSession: [] }] : [],
    ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
    responses: {
      '200': { description: 'Validated response', content: json(response) },
      default: {
        description: 'Typed failure; never includes secrets or supplied values',
        content: json(identity.identityErrorSchema),
      },
    },
  };
}
export const openApiDocument = {
  openapi: '3.1.0',
  info: { title: 'JustGO API', version: '0.4.0' },
  components: {
    securitySchemes: {
      deviceSession: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Opaque device session',
      },
    },
  },
  paths: {
    '/v1/challenges/state': { get: operation(challenges.challengeStateSchema) },
    '/v1/challenges/venue': {
      post: operation(identity.okSchema, challenges.selectVenueSchema),
    },
    '/v1/challenges/skip': {
      post: operation(challenges.queueSchema, challenges.skipChallengeSchema),
    },
    '/v1/challenges/start': {
      post: operation(
        challenges.attemptResultSchema,
        challenges.startAttemptSchema,
      ),
    },
    '/v1/challenges/finish': {
      post: operation(
        challenges.attemptResultSchema,
        challenges.finishAttemptSchema,
      ),
    },
    '/v1/challenges/queue/{venue}': {
      parameters: [
        {
          name: 'venue',
          in: 'path',
          required: true,
          schema: z.toJSONSchema(challenges.venueSchema),
        },
      ],
      get: operation(challenges.queueSchema),
    },
    '/v1/challenges/attempt/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      get: operation(challenges.attemptResultSchema),
    },
    '/v1/access': { get: operation(accessResponseSchema) },
    '/v1/identity/bootstrap': {
      post: operation(
        identity.sessionResponseSchema,
        identity.bootstrapSchema,
        false,
      ),
    },
    '/v1/identity/recover': {
      post: operation(
        identity.sessionResponseSchema,
        identity.bootstrapSchema,
        false,
      ),
    },
    '/v1/identity/renew': {
      post: operation(identity.sessionResponseSchema, identity.renewSchema),
    },
    '/v1/identity/me': { get: operation(identity.sessionResponseSchema) },
    '/v1/identity/devices': { get: operation(identity.devicesResponseSchema) },
    '/v1/identity/credentials': {
      get: operation(identity.credentialsResponseSchema),
      post: operation(identity.okSchema, identity.credentialCreateSchema),
    },
    ...Object.fromEntries(
      ['devices', 'credentials'].map((resource) => [
        `/v1/identity/${resource}/{id}/revoke`,
        {
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          post: operation(identity.okSchema, z.object({}).strict()),
        },
      ]),
    ),
    '/v1/identity/transfers/start': {
      post: operation(
        identity.transferResponseSchema,
        identity.transferStartSchema,
        false,
      ),
    },
    '/v1/identity/transfers/inspect': {
      post: operation(
        identity.transferInspectionResponseSchema,
        identity.transferInspectSchema,
      ),
    },
    '/v1/identity/transfers/approve': {
      post: operation(identity.okSchema, identity.transferApproveSchema),
    },
    '/v1/identity/transfers/cancel': {
      post: operation(identity.okSchema, identity.transferInspectSchema),
    },
    '/v1/identity/transfers/redeem': {
      post: operation(
        identity.sessionResponseSchema,
        identity.transferProofSchema,
        false,
      ),
    },
  },
};
