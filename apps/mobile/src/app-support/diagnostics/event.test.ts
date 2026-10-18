import {
  diagnosticEvent,
  diagnosticFilename,
  type DiagnosticBuild,
} from './event';
const build: DiagnosticBuild = {
  version: '0.1.0',
  build: '17',
  os: 'ios',
  osVersion: '26.1',
  environment: 'staging',
};
const secret =
  'PRIVATE reflection recovery-key bearer-token a_lot_worse someone@example.com';
const id = 'a'.repeat(32);
const event = () => ({
  event_id: id,
  timestamp: 123,
  level: 'fatal',
  message: secret,
  user: { id: secret, ip_address: '192.0.2.1', email: secret },
  request: { headers: { authorization: secret }, url: secret, data: secret },
  breadcrumbs: [{ message: secret }],
  tags: { feeling: secret },
  extra: { react: secret },
  contexts: { device: { id: secret }, app: { installation_id: secret } },
  modules: { [secret]: secret },
  transaction: secret,
  fingerprint: [secret],
  sdk: { name: secret },
  exception: {
    values: [
      {
        type: secret,
        value: secret,
        mechanism: { type: secret, handled: false, data: secret },
        stacktrace: {
          frames: [
            {
              filename:
                'http://localhost:8081/node_modules/expo-router/entry.bundle?token=secret',
              function: 'renderScreen',
              lineno: 7,
              colno: 4,
              vars: { secret },
              pre_context: [secret],
              context_line: secret,
              abs_path: secret,
              in_app: true,
            },
          ],
        },
      },
    ],
  },
  debug_meta: {
    images: [
      {
        type: 'sourcemap',
        debug_id: '12345678-1234-1234-1234-123456789abc',
        code_file: secret,
      },
    ],
  },
});
it('rebuilds the complete payload, preserving technical stack locations and symbols only', () => {
  const safe = diagnosticEvent(event(), build);
  expect(JSON.stringify(safe)).not.toContain(secret);
  expect(safe).toMatchObject({
    event_id: id,
    timestamp: 123,
    release: 'justgo-mobile@0.1.0',
    dist: '17',
    user: { ip_address: '0.0.0.0' },
    contexts: {
      app: { app_version: '0.1.0', app_build: '17' },
      os: { name: 'iOS', version: '26.1' },
    },
    exception: {
      values: [
        {
          type: 'ApplicationError',
          value: 'The application encountered an error.',
          mechanism: { type: 'generic', handled: false },
          stacktrace: {
            frames: [
              {
                filename: 'app:///index.bundle',
                lineno: 7,
                colno: 4,
                in_app: true,
              },
            ],
          },
        },
      ],
    },
  });
  expect(Object.keys(safe!)).toEqual([
    'event_id',
    'timestamp',
    'type',
    'platform',
    'level',
    'release',
    'dist',
    'environment',
    'user',
    'contexts',
    'exception',
    'debug_meta',
  ]);
});
it('ignores messages, non-errors, corrupt payloads and hostile getters', () => {
  for (const input of [
    null,
    1,
    {},
    { message: secret },
    { type: 'transaction' },
    { exception: { values: [] } },
    { exception: { values: [null] } },
  ])
    expect(diagnosticEvent(input, build)).toBeNull();
  expect(
    diagnosticEvent(
      {
        get exception() {
          throw Error(secret);
        },
      },
      build,
    ),
  ).toBeNull();
});
it('drops untrusted versions, IDs, frames, coordinates and debug images without serializing them', () => {
  const safe = diagnosticEvent(
    {
      event_id: secret,
      timestamp: Infinity,
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                null,
                { filename: secret },
                {
                  filename: 'app:///main.jsbundle',
                  function: secret,
                  lineno: -1,
                  colno: Infinity,
                },
              ],
            },
          },
        ],
      },
      debug_meta: { images: [null, { type: 'sourcemap', debug_id: secret }] },
    },
    { ...build, build: secret, version: secret, os: 'web', osVersion: secret },
  );
  expect(JSON.stringify(safe)).not.toContain(secret);
  expect(safe).toMatchObject({
    release: 'justgo-mobile@unknown',
    dist: 'unknown',
    contexts: { os: { name: 'Web', version: 'unknown' } },
    exception: {
      values: [
        { stacktrace: { frames: [{ filename: 'app:///main.jsbundle' }] } },
      ],
    },
  });
});
it('bounds frames and refuses machine paths, traversal and account/route URLs', () => {
  for (const value of [
    null,
    '/Users/private/data.txt',
    'https://example.com/account/123',
    'app:///src/../private.tsx',
  ])
    expect(diagnosticFilename(value)).toBeUndefined();
  expect(
    diagnosticFilename('http://localhost/src/view.tsx?token=secret'),
  ).toBeUndefined();
  expect(diagnosticFilename('app:///main.jsbundle')).toBe(
    'app:///main.jsbundle',
  );
  const input = event();
  input.exception.values[0]!.stacktrace.frames = Array.from(
    { length: 100 },
    () => input.exception.values[0]!.stacktrace.frames[0]!,
  );
  expect(
    diagnosticEvent(input, build)?.exception?.values?.[0]?.stacktrace?.frames,
  ).toHaveLength(64);
});

it.each([
  'http://localhost:8081/.expo/.virtual-metro-entry.bundle?platform=ios&token=PRIVATE',
  'https://example.com/_expo/static/js/web/index-8d8db065ce1929f324f02f4e491278d2.js',
  'app:///entry-0123456789abcdef.js#PRIVATE',
  'app:///main-0123456789abcdef.ios.bundle',
  'app:///index.web.js',
])(
  'preserves only canonical stack and source-map locations for Expo bundle %s',
  (filename) => {
    const input = event();
    input.exception.values[0]!.stacktrace.frames[0]!.filename = filename;
    input.debug_meta.images[0]!.code_file = filename;
    const safe = diagnosticEvent(input, build);
    expect(safe?.exception?.values?.[0]?.stacktrace?.frames).toEqual([
      { filename: 'app:///index.bundle', lineno: 7, colno: 4, in_app: true },
    ]);
    expect(safe?.debug_meta?.images).toEqual([
      {
        type: 'sourcemap',
        debug_id: input.debug_meta.images[0]!.debug_id,
        code_file: 'app:///index.bundle',
      },
    ]);
    expect(JSON.stringify(safe)).not.toMatch(
      /PRIVATE|localhost|example\.com|_expo/,
    );
  },
);

it.each([
  'app:///entry-PRIVATE_REFLECTION.js',
  'app:///index-1234567.js',
  `app:///index-${'a'.repeat(65)}.js`,
  'app:///my-entry-0123456789abcdef.js',
  'app:///.virtual-metro-private.bundle',
])('rejects arbitrary or malformed bundle names: %s', (filename) => {
  expect(diagnosticFilename(filename)).toBeUndefined();
});

it('does not trust private text formatted as a valid source filename or JavaScript symbol', () => {
  const input = {
    exception: {
      values: [
        {
          stacktrace: {
            frames: [
              {
                filename: 'app:///src/PRIVATE_REFLECTION.tsx',
                function: 'Lonely',
                lineno: 4,
              },
              {
                filename: 'app:///main.jsbundle',
                function: 'Lonely',
                lineno: 1,
                colno: 55,
              },
            ],
          },
        },
      ],
    },
  };
  const safe = diagnosticEvent(input, build);
  expect(JSON.stringify(safe)).not.toMatch(/PRIVATE_REFLECTION|Lonely/);
  expect(safe?.exception?.values?.[0]?.stacktrace?.frames).toEqual([
    { filename: 'app:///main.jsbundle', lineno: 1, colno: 55 },
  ]);
});
