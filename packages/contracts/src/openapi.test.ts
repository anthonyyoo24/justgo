import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { secretSchema, transferCodeSchema } from './identity.ts';
import { managedOpenApiDocument, openApiDocument } from './openapi.ts';

type Json = Record<string, unknown>;
type Field = [schema: unknown, at: string, name: string];

const secretPatterns = new Set(
  [secretSchema, transferCodeSchema].map(
    (schema) => z.toJSONSchema(schema).pattern,
  ),
);
const secretWord =
  /token|secret|bearer|credential|recovery|proof|password|passphrase|apikey|session|jwt|nonce|authorization|cookie/;
const methods = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'];

const isJson = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];
const entries = (value: unknown): [string, unknown][] =>
  isJson(value) ? Object.entries(value) : [];

// An identifier such as sessionId names a record, never the bearer itself.
function isSecretName(name: string): boolean {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const last = words.at(-1);
  return (
    last !== 'id' &&
    last !== 'ids' &&
    (words.includes('otp') || secretWord.test(words.join('')))
  );
}

function pointer(root: unknown, ref: string): unknown {
  return ref
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .reduce<unknown>(
      (node, key) =>
        isJson(node) ? node[key.replace(/~1/g, '/').replace(/~0/g, '~')] : {},
      root,
    );
}

const target = (document: Json, root: unknown, ref: string) =>
  pointer(ref.startsWith('#/components/') ? document : root, ref);

function deref(
  document: Json,
  value: unknown,
  root: unknown = document,
): unknown {
  return isJson(value) && typeof value.$ref === 'string'
    ? deref(document, target(document, root, value.$ref), root)
    : value;
}

const schemasOf = (value: unknown): unknown[] =>
  isJson(value)
    ? [
        ...list(value.schema),
        ...entries(value.content).map(([, media]) =>
          isJson(media) ? media.schema : undefined,
        ),
      ]
    : [];

// A secret-named list of records with ids, such as the credential list,
// describes the secrets. Each record's own fields are still checked.
function describesRecords(document: Json, root: unknown, schema: unknown) {
  const value = deref(document, schema, root);
  const record = isJson(value) ? deref(document, value.items, root) : undefined;
  return (
    isJson(record) && isJson(record.properties) && 'id' in record.properties
  );
}

function secretFields(
  document: Json,
  root: unknown,
  [schema, at, name]: Field,
  ancestors: ReadonlySet<unknown> = new Set(),
): string[] {
  if (!isJson(schema) || ancestors.has(schema)) return [];
  const ref = typeof schema.$ref === 'string' ? schema.$ref : undefined;
  const children: Field[] = [
    ...(ref === undefined
      ? []
      : [[target(document, root, ref), at, ''] satisfies Field]),
    ...['allOf', 'oneOf', 'anyOf', 'not'].flatMap((key) =>
      list(schema[key]).map((child): Field => [child, at, '']),
    ),
    ...[...list(schema.prefixItems), ...list(schema.items)].map(
      (child): Field => [child, `${at}[]`, ''],
    ),
    ...entries(schema.properties).map(([key, child]): Field => [
      child,
      at ? `${at}.${key}` : key,
      key,
    ]),
    ...[
      ...list(schema.additionalProperties).filter(isJson),
      ...entries(schema.patternProperties).map(([, child]) => child),
    ].map((child): Field => [child, `${at}{}`, '']),
    ...list(schema.propertyNames).map((child): Field => [
      child,
      `${at}{key}`,
      '',
    ]),
  ];
  const secret =
    (typeof schema.pattern === 'string' &&
      secretPatterns.has(schema.pattern)) ||
    (isSecretName(name) && !describesRecords(document, root, schema));
  const inner = new Set([...ancestors, schema]);
  return [
    ...(secret ? [at || name] : []),
    ...children.flatMap((child) => secretFields(document, root, child, inner)),
  ];
}

const isSecret = (document: Json, value: unknown, name: string) =>
  isSecretName(name) ||
  schemasOf(value).some(
    (schema) => secretFields(document, schema, [schema, '', '']).length > 0,
  );

function operationsOf(document: Json) {
  return entries(document.paths).flatMap(([path, item]) =>
    methods.flatMap((method) => {
      const operation = isJson(item) ? deref(document, item[method]) : null;
      return isJson(operation)
        ? [{ path, label: `${method.toUpperCase()} ${path}`, operation }]
        : [];
    }),
  );
}

// Bearers ride in the security scheme's Authorization header or a TLS body,
// never in a URL or cookie.
function urlSecrets(document: Json): string[] {
  const findings: string[] = [];
  for (const [path, item] of entries(document.paths)) {
    for (const [, name = ''] of path.matchAll(/\{([^}]+)\}/g))
      if (isSecretName(name)) findings.push(`${path} {${name}}`);
    const parameters = [
      ...list(isJson(item) ? item.parameters : undefined).map(
        (parameter) => [path, parameter] as const,
      ),
      ...operationsOf(document)
        .filter((operation) => operation.path === path)
        .flatMap(({ label, operation }) =>
          list(operation.parameters).map(
            (parameter) => [label, parameter] as const,
          ),
        ),
    ];
    for (const [where, reference] of parameters) {
      const parameter = deref(document, reference);
      if (!isJson(parameter)) continue;
      const name = String(parameter.name);
      const found =
        parameter.in === 'cookie' ||
        (parameter.in === 'header'
          ? /^(authorization|cookie)$/i.test(name)
          : isSecret(document, parameter, name));
      if (found) findings.push(`${where} ${String(parameter.in)} ${name}`);
    }
  }
  const schemes = isJson(document.components)
    ? document.components.securitySchemes
    : undefined;
  for (const [name, scheme] of entries(schemes))
    if (isJson(scheme) && scheme.type === 'apiKey' && scheme.in !== 'header')
      findings.push(`securityScheme ${name} in ${String(scheme.in)}`);
  return findings.sort();
}

function responseSecrets(document: Json): string[] {
  return operationsOf(document)
    .flatMap(({ label, operation }) =>
      entries(operation.responses).flatMap(([status, reference]) => {
        const response = deref(document, reference);
        if (!isJson(response)) return [];
        return [
          ...entries(response.content).flatMap(([, media]) => {
            const schema = isJson(media) ? media.schema : undefined;
            return secretFields(document, schema, [schema, '', '']);
          }),
          ...entries(response.headers)
            .filter(([header, value]) =>
              isSecret(document, deref(document, value), header),
            )
            .map(([header]) => `header ${header}`),
        ].map((field) => `${label} ${status} ${field}`);
      }),
    )
    .sort();
}

describe.each([
  ['legacy', openApiDocument],
  ['managed', managedOpenApiDocument],
])('the %s OpenAPI document', (_, document) => {
  it('puts no bearer in a path, query, cookie or hand-declared Authorization header', () => {
    expect(urlSecrets(document)).toEqual([]);
  });

  // Credential digests are SHA-256 fingerprints of stored proofs, never bearers.
  it('returns no bearer secret, only the deletion receipt credential digests', () => {
    expect(responseSecrets(document)).toEqual([
      'DELETE /v1/account 200 credentialDigests',
      'DELETE /v1/account 200 credentialDigests[]',
    ]);
  });
});

it('finds secrets through every name, position and keyword', () => {
  const secret = z.toJSONSchema(secretSchema);
  const text = { type: 'string' };
  const object = (properties: Json) => ({ type: 'object', properties });
  const probe = {
    components: {
      securitySchemes: {
        header: { type: 'apiKey', in: 'header', name: 'X-Key' },
        url: { type: 'apiKey', in: 'query', name: 'key' },
      },
      parameters: { token: { name: 'token', in: 'query', schema: {} } },
      headers: { Next: { schema: secret } },
      schemas: {
        Session: object({ sessionToken: text }),
      },
    },
    paths: {
      '/probe/{recoveryCode}': {
        parameters: [
          { name: 'recoveryCode', in: 'path', schema: text },
          { name: 'sessionId', in: 'path', schema: text },
        ],
        get: {
          parameters: [
            { $ref: '#/components/parameters/token' },
            { name: 'next', in: 'cookie', schema: secret },
            { name: 'sid', in: 'cookie', schema: text },
            { name: 'jwt', in: 'query', schema: text },
            {
              name: 'filter',
              in: 'query',
              content: {
                'application/json': { schema: object({ owner: secret }) },
              },
            },
            { name: 'Authorization', in: 'header', schema: secret },
            { name: 'cookie', in: 'header', schema: text },
            { name: 'X-Device-Token', in: 'header', schema: secret },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
          ],
          responses: {
            '200': {
              headers: {
                'X-Refresh-Token': { schema: text },
                'Set-Cookie': { schema: text },
                'X-Next': { $ref: '#/components/headers/Next' },
                'X-Trace': { content: { 'text/plain': { schema: secret } } },
                'X-Request-Id': { schema: text },
              },
              content: {
                'application/json': {
                  schema: {
                    allOf: [{ $ref: '#/components/schemas/Session' }],
                    properties: {
                      claims: {
                        type: 'array',
                        items: { oneOf: [{ $ref: '#/$defs/claim' }] },
                      },
                      byDevice: {
                        type: 'object',
                        additionalProperties: { anyOf: [secret] },
                      },
                      byKey: { type: 'object', propertyNames: secret },
                      byPattern: {
                        type: 'object',
                        patternProperties: { '^d': secret },
                      },
                      other: { not: secret },
                      refreshToken: object({ value: text }),
                      accessToken: object({ id: text, value: text }),
                      names: object({
                        session: text,
                        jwt: text,
                        otpCode: text,
                        OTPCode: text,
                        nonce: text,
                        authorization: text,
                        cookie: text,
                        refresh_token: text,
                        apiKey: text,
                        sessionId: text,
                        footprint: text,
                      }),
                      credentials: {
                        type: 'array',
                        items: object({ id: text, createdAt: text }),
                      },
                    },
                    $defs: { claim: object({ claimSecret: text }) },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  expect(urlSecrets(probe)).toEqual(
    [
      '/probe/{recoveryCode} {recoveryCode}',
      '/probe/{recoveryCode} path recoveryCode',
      'GET /probe/{recoveryCode} cookie next',
      'GET /probe/{recoveryCode} cookie sid',
      'GET /probe/{recoveryCode} header Authorization',
      'GET /probe/{recoveryCode} header cookie',
      'GET /probe/{recoveryCode} query filter',
      'GET /probe/{recoveryCode} query jwt',
      'GET /probe/{recoveryCode} query token',
      'securityScheme url in query',
    ].sort(),
  );
  expect(responseSecrets(probe)).toEqual(
    [
      'GET /probe/{recoveryCode} 200 accessToken',
      'GET /probe/{recoveryCode} 200 byDevice{}',
      'GET /probe/{recoveryCode} 200 byKey{key}',
      'GET /probe/{recoveryCode} 200 byPattern{}',
      'GET /probe/{recoveryCode} 200 claims[].claimSecret',
      'GET /probe/{recoveryCode} 200 header Set-Cookie',
      'GET /probe/{recoveryCode} 200 header X-Next',
      'GET /probe/{recoveryCode} 200 header X-Trace',
      'GET /probe/{recoveryCode} 200 header X-Refresh-Token',
      'GET /probe/{recoveryCode} 200 names.apiKey',
      'GET /probe/{recoveryCode} 200 names.authorization',
      'GET /probe/{recoveryCode} 200 names.cookie',
      'GET /probe/{recoveryCode} 200 names.jwt',
      'GET /probe/{recoveryCode} 200 names.nonce',
      'GET /probe/{recoveryCode} 200 names.OTPCode',
      'GET /probe/{recoveryCode} 200 names.otpCode',
      'GET /probe/{recoveryCode} 200 names.refresh_token',
      'GET /probe/{recoveryCode} 200 names.session',
      'GET /probe/{recoveryCode} 200 other',
      'GET /probe/{recoveryCode} 200 refreshToken',
      'GET /probe/{recoveryCode} 200 sessionToken',
    ].sort(),
  );
});
