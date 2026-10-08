import { z } from 'zod';
import * as challenges from './activity/challenges.ts';
import * as identity from './identity.ts';
import * as attempts from './activity/attempts.ts';
import * as progress from './activity/progress.ts';
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
      ...(body
        ? {
            '413': {
              description:
                'REQUEST_TOO_LARGE: body exceeds 32 KiB; do not retry unchanged input',
              content: json(
                identity.identityErrorSchema.extend({
                  code: z.literal('REQUEST_TOO_LARGE'),
                }),
              ),
            },
            '415': {
              description:
                'UNSUPPORTED_MEDIA_TYPE: unsupported request content type; do not retry unchanged input',
              content: json(
                identity.identityErrorSchema.extend({
                  code: z.literal('UNSUPPORTED_MEDIA_TYPE'),
                }),
              ),
            },
          }
        : {}),
      default: {
        description: 'Typed failure; never includes secrets or supplied values',
        content: json(identity.identityErrorSchema),
      },
    },
  };
}
export const openApiDocument = {
  openapi: '3.1.0',
  info: { title: 'JustGO API', version: '0.6.0' },
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
    '/v1/challenges': { get: operation(challenges.catalogSchema) },
    '/v1/attempts': {
      get: {
        ...operation(progress.progressDayResponseSchema),
        parameters: [
          {
            name: 'date',
            in: 'query',
            required: true,
            schema: z.toJSONSchema(progress.calendarDateSchema),
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string' },
          },
        ],
      },
      post: {
        ...operation(
          attempts.attemptResultSchema,
          attempts.createAttemptSchema,
        ),
        responses: {
          ...operation(
            attempts.attemptResultSchema,
            attempts.createAttemptSchema,
          ).responses,
          '201': {
            description: 'Created completed attempt',
            content: json(attempts.attemptResultSchema),
          },
        },
      },
    },
    '/v1/attempts/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      patch: {
        ...operation(
          attempts.patchAttemptResponseSchema,
          attempts.patchAttemptSchema,
        ),
        responses: {
          ...operation(
            attempts.patchAttemptResponseSchema,
            attempts.patchAttemptSchema,
          ).responses,
          '409': {
            description:
              'Altered operation reuse or stale reflection revision; only genuine revision conflicts include owner-scoped currentAttempt',
            content: json(
              z.union([
                identity.identityErrorSchema.extend({
                  code: z.literal('CONFLICT'),
                }),
                attempts.reflectionConflictSchema,
              ]),
            ),
          },
        },
      },
    },
    '/v1/progress/summary': {
      parameters: [
        {
          name: 'timeZone',
          in: 'query',
          required: true,
          schema: z.toJSONSchema(challenges.timeZoneSchema),
        },
      ],
      get: operation(progress.progressSummarySchema),
    },
    '/v1/progress/calendar': {
      parameters: [
        {
          name: 'month',
          in: 'query',
          required: true,
          schema: z.toJSONSchema(progress.calendarMonthSchema),
        },
      ],
      get: operation(progress.progressCalendarSchema),
    },
    '/v1/access': { get: operation(accessResponseSchema) },
    '/v1/sessions': {
      post: {
        ...operation(
          identity.sessionResponseSchema,
          identity.sessionCreateSchema,
          false,
        ),
        description:
          'Create or recover a session with bootstrap/recovery credentials or transfer claimant proof. The renewal kind requires the current bearer session; all proof material stays in the body or Authorization header.',
        security: [{}, { deviceSession: [] }],
      },
    },
    '/v1/sessions/current': { get: operation(identity.sessionResponseSchema) },
    '/v1/devices': { get: operation(identity.devicesResponseSchema) },
    '/v1/credentials': {
      get: operation(identity.credentialsResponseSchema),
      post: operation(identity.okSchema, identity.credentialCreateSchema),
    },
    ...Object.fromEntries(
      ['devices', 'credentials'].map((resource) => [
        `/v1/${resource}/{id}`,
        {
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          delete: operation(identity.okSchema),
        },
      ]),
    ),
    '/v1/transfers': {
      post: operation(
        identity.transferResponseSchema,
        identity.transferStartSchema,
        false,
      ),
    },
    '/v1/transfers/{id}': {
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      delete: operation(identity.okSchema, identity.transferInspectSchema),
    },
    '/v1/transfer-inspections': {
      post: operation(
        identity.transferInspectionResponseSchema,
        identity.transferInspectSchema,
      ),
    },
    '/v1/transfer-approvals': {
      post: operation(identity.okSchema, identity.transferApproveSchema),
    },
  },
};
