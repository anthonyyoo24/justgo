import { z } from 'zod';
import * as challenges from './activity/challenges.ts';
import * as identity from './identity.ts';
import { identityErrorSchema } from './errors.ts';
import * as attempts from './activity/attempts.ts';
import * as progress from './activity/progress.ts';
import { accessResponseSchema } from './access.ts';
import { completionExportPageSchema } from './data-export.ts';
import * as managed from './managed-auth.ts';
import * as sync from './data-sync.ts';

const accountWriteBudget =
  'Requests adding new records share a server-configured per-account ten-minute write budget; fully identical accepted retries do not consume another slot. Exhaustion returns 429 RATE_LIMITED with Retry-After seconds.';
const accountExportBudget =
  'History, journal and account export pages share a separate server-configured per-account ten-minute budget. Exhaustion returns 429 RATE_LIMITED with Retry-After seconds.';

const json = (schema: z.ZodType) => ({
  'application/json': { schema: z.toJSONSchema(schema) },
});
function operation(
  response: z.ZodType,
  body?: z.ZodType,
  authenticated = true,
  bodyLimit = '32 KiB',
) {
  return {
    security: authenticated ? [{ deviceSession: [] }] : [],
    ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
    responses: {
      '200': { description: 'Validated response', content: json(response) },
      ...(body
        ? {
            '413': {
              description: `REQUEST_TOO_LARGE: body exceeds ${bodyLimit}; do not retry unchanged input`,
              content: json(
                identityErrorSchema.extend({
                  code: z.literal('REQUEST_TOO_LARGE'),
                }),
              ),
            },
            '415': {
              description:
                'UNSUPPORTED_MEDIA_TYPE: unsupported request content type; do not retry unchanged input',
              content: json(
                identityErrorSchema.extend({
                  code: z.literal('UNSUPPORTED_MEDIA_TYPE'),
                }),
              ),
            },
          }
        : {}),
      default: {
        description:
          'Typed failure; never includes secrets or supplied values. 4xx statuses are client errors identified by code, and an unlisted 4xx uses INVALID_REQUEST. 503 UNAVAILABLE is a transient service failure.',
        content: json(identityErrorSchema),
      },
    },
  };
}
export const openApiDocument = {
  openapi: '3.1.0',
  info: { title: 'JustGO API', version: '0.13.0' },
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
    '/v1/auth/session': {
      post: {
        ...operation(
          managed.managedSessionResponseSchema,
          managed.managedSessionRequestSchema,
        ),
        description:
          'Verify a Supabase Apple/Google bearer session and map its subject to a canonical owner. Optional legacySessionToken proves ownership for the initial legacy link; email and metadata never confer ownership.',
      },
      get: {
        ...operation(managed.managedSessionResponseSchema),
        description:
          'Recheck the provider user, live Auth session, local revocation and canonical owner deletion state. Returns the current data epoch.',
      },
    },
    '/v1/auth/logout': {
      post: operation(identity.okSchema, managed.managedLogoutRequestSchema),
    },
    '/v1/guest/access': {
      get: {
        ...operation(accessResponseSchema, undefined, false),
        description:
          'Account-free trusted guest access policy. Production denies by default until verified guest purchase support exists; an explicit bounded staging beta window can allow testing.',
      },
    },
    '/v1/guest/challenges': {
      get: {
        ...operation(challenges.catalogSchema, undefined, false),
        description:
          'Active catalog under the same trusted guest access policy; creates no account and accepts no private data.',
      },
    },
    '/v1/completion-restores': {
      post: {
        ...operation(
          sync.completionRestoreResponseSchema,
          sync.completionRestoreRequestSchema,
          true,
          '4 MiB',
        ),
        description: `Atomic owner-only import of up to 50 bounded completion contexts, without entitlement or private journal fields. expectedEpoch must match. Identical IDs replay; changed contexts conflict; deleted IDs remain blocked unless a user-confirmed import explicitly supplies restoreDeleted:true. Routine sync never sets that flag. ${accountWriteBudget}`,
      },
      get: {
        ...operation(sync.completionRestorePageSchema),
        description: `Owner-only UUID-ordered history page, up to 50 records, with dataEpoch and nextCursor. Enumerate from the beginning on a later sync to reconcile concurrent inserts. ${accountExportBudget}`,
        parameters: [
          {
            name: 'cursor',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 50 },
          },
        ],
      },
    },
    '/v1/journal-sync': {
      post: {
        ...operation(
          sync.journalSyncResponseSchema,
          sync.journalSyncRequestSchema,
          true,
          '4 MiB',
        ),
        description: `Managed signed-in journal sync only. Immutable owner-scoped versions and parents preserve concurrent writing. A journal-only entry requires its strict historical context and creates no completion or rep. Existing completion context may be derived for older clients. Atomic batches up to 50 require expectedEpoch; restoreDeleted is reserved for a user-confirmed import. ${accountWriteBudget}`,
      },
      get: {
        ...operation(sync.journalSyncPageSchema),
        description: `Managed signed-in journal versions, UUID-ordered pages up to 50. A full enumeration on later sync reconciles concurrent inserts. ${accountExportBudget}`,
        parameters: [
          {
            name: 'cursor',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 50 },
          },
        ],
      },
    },
    '/v1/data': {
      delete: {
        ...operation(
          sync.dataDeletionResponseSchema,
          sync.dataDeletionRequestSchema,
        ),
        description:
          'Delete owner completion and journal data while retaining the account and entitlement. Advances the data epoch and tombstones deleted completion IDs. Retry the same expectedEpoch for its durable receipt without deleting newly saved data.',
      },
    },
    '/v1/account': {
      delete: {
        ...operation(
          identity.accountDeletionResponseSchema,
          identity.accountDeletionRequestSchema,
        ),
        description:
          'Permanently removes owned activity, devices, sessions and transfers without paid access. Managed account success also requires hard deletion of its Supabase Auth profile; durable cleanup retries survive provider failure. Retains minimal revocation/deletion safety records. Retry a lost response with the exact original bearer token, including after provider deletion. Does not cancel an Apple subscription.',
      },
    },
    '/v1/account/export': {
      get: {
        ...operation(completionExportPageSchema),
        description: `Owner-only data export, available without paid access. Follow nextCursor until null; pages contain up to 50 completion records without private journal fields in ID order. Each page is read in an owner transaction; concurrent changes on other devices may be reflected between pages. No credentials, session tokens or diagnostics are returned. ${accountExportBudget}`,
        parameters: [
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
      },
    },
    '/v1/challenges': { get: operation(challenges.catalogSchema) },
    '/v1/attempts': {
      get: {
        ...operation(progress.completionProgressDayResponseSchema),
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
          attempts.completionAttemptResultSchema,
          attempts.createAttemptSchema,
        ),
        description: accountWriteBudget,
        responses: {
          ...operation(
            attempts.completionAttemptResultSchema,
            attempts.createAttemptSchema,
          ).responses,
          '201': {
            description: 'Created completed attempt',
            content: json(attempts.completionAttemptResultSchema),
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
        security: [],
        description:
          'Retired private journal write. Update the client and preserve pending content locally. The body is not read, accepted or replayed.',
        responses: {
          '410': {
            description:
              'PRIVATE_JOURNAL_LOCAL: permanent retirement; never retry private input',
            content: json(
              identityErrorSchema.extend({
                code: z.literal('PRIVATE_JOURNAL_LOCAL'),
              }),
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
          'Create or recover a session with bootstrap/recovery credentials or transfer claimant proof. The renewal kind requires the current bearer session; all proof material stays in the body or Authorization header. Account creation does not accept or record legal notice versions or agreement.',
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
      delete: {
        ...operation(
          identity.transferCancelResponseSchema,
          identity.transferCancelSchema,
          false,
        ),
        description:
          'Cancel with either the approving account bearer session and code, or the receiving phone’s complete original transfer proposal. The receiving proof can invalidate a proposal before its start request arrives; exact retries cannot recreate it. A redeemed result means completion already won the race and must be reconciled using the original session proof.',
        security: [{}, { deviceSession: [] }],
      },
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

const retiredManagedPaths = new Set([
  '/v1/devices',
  '/v1/devices/{id}',
  '/v1/credentials',
  '/v1/credentials/{id}',
  '/v1/transfers',
  '/v1/transfers/{id}',
  '/v1/transfer-inspections',
  '/v1/transfer-approvals',
]);
export const managedOpenApiDocument = {
  ...openApiDocument,
  paths: {
    ...Object.fromEntries(
      Object.entries(openApiDocument.paths).filter(
        ([path]) => !retiredManagedPaths.has(path),
      ),
    ),
    '/v1/sessions': {
      post: {
        ...operation(
          identity.sessionResponseSchema,
          z.discriminatedUnion('kind', [
            identity.bootstrapSchema
              .extend({ kind: z.literal('recovery') })
              .strict(),
            identity.renewSchema
              .extend({ kind: z.literal('renewal') })
              .strict(),
          ]),
          false,
        ),
        description:
          'Existing-proof recovery and renewal only for migrating unlinked installations. New legacy bootstrap and transfer redemption are retired with HTTP410. Successful managed linking revokes legacy credentials and sessions.',
        security: [{}, { deviceSession: [] }],
      },
    },
  },
};
