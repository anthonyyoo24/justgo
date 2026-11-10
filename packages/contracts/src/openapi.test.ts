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
const secretName =
  /token|secret|bearer|credential|recovery|proof|password|passphrase|api.?key/i;
const methods = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'];

const isJson = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];
const entries = (value: unknown): [string, unknown][] =>
  isJson(value) ? Object.entries(value) : [];

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

function deref(document: Json, value: unknown): unknown {
  return isJson(value) && typeof value.$ref === 'string'
    ? deref(document, pointer(document, value.$ref))
    : value;
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
      : [
          [
            pointer(ref.startsWith('#/components/') ? document : root, ref),
            at,
            name,
          ] satisfies Field,
        ]),
    ...['allOf', 'oneOf', 'anyOf'].flatMap((key) =>
      list(schema[key]).map((child): Field => [child, at, name]),
    ),
    ...[...list(schema.prefixItems), ...list(schema.items)].map(
      (child): Field => [child, `${at}[]`, name],
    ),
    ...entries(schema.properties).map(([key, child]): Field => [
      child,
      at ? `${at}.${key}` : key,
      key,
    ]),
    ...list(schema.additionalProperties)
      .filter(isJson)
      .map((child): Field => [child, `${at}{}`, name]),
  ];
  const secret =
    (typeof schema.pattern === 'string' &&
      secretPatterns.has(schema.pattern)) ||
    (children.length === 0 && secretName.test(name));
  const inner = new Set([...ancestors, schema]);
  return [
    ...(secret ? [at || name] : []),
    ...children.flatMap((child) => secretFields(document, root, child, inner)),
  ];
}

const isSecret = (document: Json, schema: unknown, name: string) =>
  secretName.test(name) ||
  secretFields(document, schema, [schema, '', name]).length > 0;

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

// Bearers ride in the Authorization header or a TLS body, never in a URL or cookie.
function urlSecrets(document: Json): string[] {
  const findings: string[] = [];
  for (const [path, item] of entries(document.paths)) {
    for (const [, name = ''] of path.matchAll(/\{([^}]+)\}/g))
      if (secretName.test(name)) findings.push(`${path} {${name}}`);
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
      if (!isJson(parameter) || parameter.in === 'header') continue;
      const name = String(parameter.name);
      if (isSecret(document, parameter.schema, name))
        findings.push(`${where} ${String(parameter.in)} ${name}`);
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
              isSecret(
                document,
                isJson(value) ? value.schema : undefined,
                header,
              ),
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
  it('puts no secret-shaped field in a path, query or cookie', () => {
    expect(urlSecrets(document)).toEqual([]);
  });

  // Credential digests are SHA-256 fingerprints of stored proofs, never bearers.
  it('returns no bearer secret, only the deletion receipt credential digests', () => {
    expect(responseSecrets(document)).toEqual([
      'DELETE /v1/account 200 credentialDigests[]',
    ]);
  });
});

it('finds secrets through refs, compositions, items, maps and headers', () => {
  const secret = z.toJSONSchema(secretSchema);
  const probe = {
    components: {
      securitySchemes: {
        header: { type: 'apiKey', in: 'header', name: 'X-Key' },
        url: { type: 'apiKey', in: 'query', name: 'key' },
      },
      parameters: { token: { name: 'token', in: 'query', schema: {} } },
      schemas: {
        Session: {
          type: 'object',
          properties: { sessionToken: { type: 'string' } },
        },
      },
    },
    paths: {
      '/probe/{recoveryCode}': {
        parameters: [
          { name: 'recoveryCode', in: 'path', schema: { type: 'string' } },
        ],
        get: {
          parameters: [
            { $ref: '#/components/parameters/token' },
            { name: 'next', in: 'cookie', schema: secret },
            { name: 'Authorization', in: 'header', schema: secret },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
          ],
          responses: {
            '200': {
              headers: { 'X-Refresh-Token': { schema: { type: 'string' } } },
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
                      credentials: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: { id: { type: 'string' } },
                        },
                      },
                    },
                    $defs: {
                      claim: {
                        type: 'object',
                        properties: { claimSecret: { type: 'string' } },
                      },
                    },
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
      'GET /probe/{recoveryCode} query token',
      'securityScheme url in query',
    ].sort(),
  );
  expect(responseSecrets(probe)).toEqual(
    [
      'GET /probe/{recoveryCode} 200 byDevice{}',
      'GET /probe/{recoveryCode} 200 claims[].claimSecret',
      'GET /probe/{recoveryCode} 200 header X-Refresh-Token',
      'GET /probe/{recoveryCode} 200 sessionToken',
    ].sort(),
  );
});
