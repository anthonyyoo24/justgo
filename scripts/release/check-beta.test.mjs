import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  betaApiOrigin,
  betaDiagnosticsMode,
  checkBetaRelease,
} from './check-beta.mjs';

const eas = JSON.parse(
  readFileSync(new URL('../../apps/mobile/eas.json', import.meta.url)),
);
const document = `<!-- legal-version: synthetic-beta -->
<!-- publication-status: owner-approved -->
<!-- effective-date: 2026-10-24 -->
<!-- public:start -->
# Synthetic notice

Disposable release configuration test.
<!-- public:end -->`;
const documents = {
  'PRIVACY_POLICY_DRAFT.md':
    document + '\n<!-- deployment-host: cloudflare -->\n',
  'TERMS_DRAFT.md': document,
};
function candidate() {
  return {
    eas: structuredClone(eas),
    documents: { ...documents },
    environment: {
      EXPO_PUBLIC_SUPABASE_URL: 'https://kmcpcauaxlgpevkkenwd.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_disposable',
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:
        '12345-disposable-ios.apps.googleusercontent.com',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:
        '12345-disposable-web.apps.googleusercontent.com',
      EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME:
        'com.googleusercontent.apps.12345-disposable-ios',
      EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER: 'iCloud.com.anthonyyoo.justgo',
      EXPO_PUBLIC_PRIVACY_POLICY_URL:
        'https://justgo-notices.vercel.app/privacy/',
      EXPO_PUBLIC_TERMS_URL: 'https://justgo-notices.vercel.app/terms/',
    },
  };
}

function diagnosticsCandidate() {
  const value = candidate();
  value.diagnostics = true;
  value.documents['PRIVACY_POLICY_DRAFT.md'] = value.documents[
    'PRIVACY_POLICY_DRAFT.md'
  ].replace(
    '<!-- public:start -->',
    '<!-- diagnostics-scope: essential-errors-only -->\n<!-- public:start -->',
  );
  Object.assign(value.environment, {
    EXPO_PUBLIC_SENTRY_DSN:
      'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@o123.ingest.us.sentry.io/4512279181459456',
    BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION: 'synthetic-beta',
    SENTRY_AUTH_TOKEN: 'disposable-private-upload-token',
  });
  return value;
}

test('diagnostics mode defaults off and accepts only explicit boolean strings', () => {
  assert.deepEqual(betaDiagnosticsMode({}), {
    diagnosticsEnabled: false,
    buildProfile: 'beta',
  });
  assert.deepEqual(betaDiagnosticsMode({ RELEASE_DIAGNOSTICS: 'true' }), {
    diagnosticsEnabled: true,
    buildProfile: 'beta-diagnostics',
  });
  assert.equal(
    betaDiagnosticsMode({ RELEASE_DIAGNOSTICS: 'false' }).diagnosticsEnabled,
    false,
  );
  for (const value of ['', '1', 'TRUE', true, false])
    assert.throws(() => betaDiagnosticsMode({ RELEASE_DIAGNOSTICS: value }));
});

test('the optional diagnostics profile inherits the original off profile without changing its defaults', () => {
  assert.equal(eas.build.beta.env.EXPO_PUBLIC_SENTRY_ENABLED, 'false');
  assert.equal(eas.build.development.env.EXPO_PUBLIC_SENTRY_ENABLED, 'false');
  assert.deepEqual(checkBetaRelease(diagnosticsCandidate()), []);
  const value = diagnosticsCandidate();
  value.operation = 'submit';
  delete value.environment.SENTRY_AUTH_TOKEN;
  assert.deepEqual(checkBetaRelease(value), []);
});

test('diagnostics requires the reviewed destination, upload credential and intact upload enforcement', () => {
  for (const [key, setting] of [
    ['EXPO_PUBLIC_SENTRY_DSN', undefined],
    ['EXPO_PUBLIC_SENTRY_DSN', 'https://private@other.example/1'],
    [
      'EXPO_PUBLIC_SENTRY_DSN',
      'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@o123.ingest.us.sentry.io/123',
    ],
    ['EXPO_PUBLIC_SENTRY_ENVIRONMENT', 'production'],
    ['SENTRY_ENVIRONMENT', 'development'],
    ['SENTRY_AUTH_TOKEN', ''],
    ['SENTRY_AUTH_TOKEN', '   '],
    ['SENTRY_AUTH_TOKEN', undefined],
    ['SENTRY_DISABLE_AUTO_UPLOAD', 'true'],
    ['SENTRY_ALLOW_FAILURE', 'true'],
  ]) {
    const value = diagnosticsCandidate();
    value.environment[key] = setting;
    if (key === 'EXPO_PUBLIC_SENTRY_ENVIRONMENT')
      value.eas.build['beta-diagnostics'].env[key] = setting;
    const errors = checkBetaRelease(value);
    assert.ok(errors.length, `Unsafe diagnostics ${key} passed`);
    assert.ok(!errors.join().includes('disposable-private-upload-token'));
  }
});

test('diagnostics cannot use an unapproved, unpublished or unrelated notice', () => {
  for (const mutate of [
    (value) => {
      value.documents['PRIVACY_POLICY_DRAFT.md'] = document;
    },
    (value) => {
      value.documents['PRIVACY_POLICY_DRAFT.md'] = value.documents[
        'PRIVACY_POLICY_DRAFT.md'
      ].replace('owner-approved', 'owner-review-required');
    },
    (value) => {
      value.documents['PRIVACY_POLICY_DRAFT.md'] = value.documents[
        'PRIVACY_POLICY_DRAFT.md'
      ].replace('2026-10-24', 'pending');
    },
    (value) => {
      value.environment.BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION = '';
    },
    (value) => {
      value.environment.BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION =
        'older-notice';
    },
    (value) => {
      value.documents['PRIVACY_POLICY_DRAFT.md'] +=
        '\n<!-- diagnostics-scope: another-scope -->';
    },
  ]) {
    const value = diagnosticsCandidate();
    mutate(value);
    assert.ok(checkBetaRelease(value).length);
  }
});

test('diagnostics cannot bypass the original profile or inherited capability guards', () => {
  for (const mutate of [
    (value) => {
      value.eas.build['beta-diagnostics'].extends = 'development';
    },
    (value) => {
      delete value.eas.build['beta-diagnostics'];
    },
    (value) => {
      value.eas.build.beta.extends = 'development';
    },
    (value) => {
      value.eas.build['beta-diagnostics'].env.EXPO_PUBLIC_SENTRY_ENABLED =
        'false';
    },
    (value) => {
      delete value.eas.build.beta.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER;
    },
    (value) => {
      value.eas.build['beta-diagnostics'].env.ICLOUD_CONTAINER_ENVIRONMENT =
        'Production';
    },
    (value) => {
      value.diagnostics = 'false';
    },
    (value) => {
      value.eas.build.beta.ios = { simulator: true };
      value.eas.build['beta-diagnostics'].ios = {};
    },
  ]) {
    const value = diagnosticsCandidate();
    mutate(value);
    assert.ok(checkBetaRelease(value).length);
  }
});

test('an approved notice needs Cloudflare hosting approval and matching diagnostics publication attestation', () => {
  const value = diagnosticsCandidate();
  value.documents['PRIVACY_POLICY_DRAFT.md'] = readFileSync(
    new URL('../../docs/legal/PRIVACY_POLICY_DRAFT.md', import.meta.url),
    'utf8',
  ).replace(/^<!-- deployment-host: cloudflare -->\r?\n?/gm, '');
  for (const version of [undefined, '', 'mismatched-synthetic-notice']) {
    value.environment.BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION = version;
    assert.ok(checkBetaRelease(value).length);
  }
  // Synthetic attestation only; this unit test performs no publication or activation.
  value.environment.BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION = value.documents[
    'PRIVACY_POLICY_DRAFT.md'
  ].match(/^<!-- legal-version: (.+) -->$/m)[1];
  assert.ok(
    checkBetaRelease(value).some((error) =>
      error.includes('Cloudflare hosting approval'),
    ),
  );
  value.documents['PRIVACY_POLICY_DRAFT.md'] +=
    '\n<!-- deployment-host: cloudflare -->\n';
  assert.deepEqual(checkBetaRelease(value), []);
});

test('admits a store-signed staging candidate and the verified App Store upload target', () => {
  assert.deepEqual(checkBetaRelease(candidate()), []);
  assert.deepEqual(
    checkBetaRelease({ ...candidate(), operation: 'submit' }),
    [],
  );
});

test('profile values override unrelated shell build settings, matching EAS precedence', () => {
  const value = candidate();
  Object.assign(value.environment, {
    IOS_BUNDLE_IDENTIFIER: 'wrong.shell',
    EXPO_PUBLIC_API_URL: 'http://localhost:3000',
    EXPO_PUBLIC_SENTRY_ENABLED: 'true',
  });
  assert.deepEqual(checkBetaRelease(value), []);
});

test('iOS env overrides common diagnostics mode in both enabled and disabled candidates', () => {
  for (const [factory, enabled] of [
    [candidate, 'true'],
    [diagnosticsCandidate, 'false'],
  ]) {
    const value = factory();
    value.eas.build.beta.ios = {
      env: { EXPO_PUBLIC_SENTRY_ENABLED: enabled },
    };
    assert.ok(
      checkBetaRelease(value).some((error) =>
        error.includes('selected diagnostics mode'),
      ),
    );
  }
  const ordinary = candidate();
  ordinary.environment.EXPO_PUBLIC_SENTRY_ENABLED = 'true';
  ordinary.eas.build.beta.ios = {
    env: { EXPO_PUBLIC_SENTRY_ENABLED: 'false' },
  };
  ordinary.eas.build['beta-diagnostics'].ios = {
    env: { EXPO_PUBLIC_SENTRY_ENABLED: 'true' },
  };
  assert.deepEqual(checkBetaRelease(ordinary), []);
});

test('inherits iOS env before applying platform overrides, including child iOS precedence', () => {
  const value = diagnosticsCandidate();
  const dsn = value.environment.EXPO_PUBLIC_SENTRY_DSN;
  delete value.environment.EXPO_PUBLIC_SENTRY_DSN;
  value.eas.build['beta-diagnostics'].env.EXPO_PUBLIC_SENTRY_ENVIRONMENT =
    'production';
  value.eas.build.beta.ios = {
    env: {
      EXPO_PUBLIC_SENTRY_DSN: dsn,
      EXPO_PUBLIC_SENTRY_ENVIRONMENT: 'staging',
      EXPO_PUBLIC_SENTRY_ENABLED: 'false',
    },
  };
  value.eas.build['beta-diagnostics'].ios = {
    env: { EXPO_PUBLIC_SENTRY_ENABLED: 'true' },
  };
  assert.deepEqual(checkBetaRelease(value), []);
  value.eas.build['beta-diagnostics'].ios.env.EXPO_PUBLIC_SENTRY_DSN =
    'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@o123.ingest.us.sentry.io/123';
  assert.ok(
    checkBetaRelease(value).some((error) =>
      error.includes('reviewed mobile US project DSN'),
    ),
  );
});

test('checks the effective iOS build settings after platform overrides', () => {
  const value = diagnosticsCandidate();
  Object.assign(value.eas.build.beta, {
    node: '20.0.0',
    environment: 'production',
    autoIncrement: false,
    ios: { node: '24.18.0', environment: 'preview', autoIncrement: true },
  });
  assert.deepEqual(checkBetaRelease(value), []);
  value.eas.build['beta-diagnostics'].ios = { node: '22.0.0' };
  assert.ok(
    checkBetaRelease(value).some((error) =>
      error.includes('pinned Node runtime'),
    ),
  );
});

test('checks effective iOS identity/API/Auth and enabled diagnostics destinations', () => {
  for (const factory of [candidate, diagnosticsCandidate]) {
    for (const profile of [
      'beta',
      ...(factory === diagnosticsCandidate ? ['beta-diagnostics'] : []),
    ]) {
      for (const [key, setting] of [
        ['IOS_BUNDLE_IDENTIFIER', 'another.app'],
        ['EXPO_PUBLIC_API_URL', 'https://another-api.vercel.app'],
        ['EXPO_PUBLIC_SUPABASE_URL', 'https://another.supabase.co'],
        ...(factory === diagnosticsCandidate
          ? [
              [
                'EXPO_PUBLIC_SENTRY_DSN',
                'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@o123.ingest.us.sentry.io/123',
              ],
            ]
          : []),
      ]) {
        const value = factory();
        value.eas.build[profile].ios = { env: { [key]: setting } };
        assert.ok(
          checkBetaRelease(value).length,
          `Unsafe ${profile}.ios.env.${key} passed`,
        );
      }
    }
  }
});

test('rejects effective upload bypasses at each common and iOS inheritance level', () => {
  for (const profile of ['beta', 'beta-diagnostics']) {
    for (const platform of [false, true]) {
      for (const key of [
        'SENTRY_DISABLE_AUTO_UPLOAD',
        'SENTRY_ALLOW_FAILURE',
      ]) {
        const value = diagnosticsCandidate();
        value.environment[key] = '';
        const owner = platform
          ? (value.eas.build[profile].ios = { env: {} })
          : value.eas.build[profile];
        owner.env[key] = 'true';
        assert.ok(
          checkBetaRelease(value).some((error) =>
            error.includes('must not bypass'),
          ),
          `${profile}${platform ? '.ios' : ''}.env.${key}`,
        );
      }
    }
  }
});

test('profile env cannot embed trusted upload credentials or publication attestations', () => {
  for (const profile of ['beta', 'beta-diagnostics']) {
    for (const platform of [false, true]) {
      for (const key of [
        'SENTRY_AUTH_TOKEN',
        'BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION',
      ]) {
        const value = diagnosticsCandidate();
        const owner = platform
          ? (value.eas.build[profile].ios = { env: {} })
          : value.eas.build[profile];
        owner.env[key] = 'embedded-trusted-input';
        const errors = checkBetaRelease(value);
        assert.ok(
          errors.some((error) =>
            error.includes('trusted external environment'),
          ),
        );
        assert.ok(!errors.join().includes('embedded-trusted-input'));
        delete value.environment[key];
        owner.env[key] =
          key === 'SENTRY_AUTH_TOKEN'
            ? 'embedded-trusted-input'
            : 'synthetic-beta';
        assert.ok(
          checkBetaRelease(value).some((error) =>
            error.includes(
              key === 'SENTRY_AUTH_TOKEN'
                ? 'private SENTRY_AUTH_TOKEN'
                : 'attest its exact version',
            ),
          ),
        );
      }
    }
  }
});

test('iOS CloudKit overrides retain the guarded container/environment pair', () => {
  for (const factory of [candidate, diagnosticsCandidate]) {
    for (const profile of [
      'beta',
      ...(factory === diagnosticsCandidate ? ['beta-diagnostics'] : []),
    ]) {
      for (const key of [
        'EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER',
        'ICLOUD_CONTAINER_ENVIRONMENT',
      ]) {
        const value = factory();
        value.eas.build[profile].ios = {
          env: { [key]: value.eas.build.beta.env[key] },
        };
        assert.ok(
          checkBetaRelease(value).some((error) =>
            error.includes('must be paired'),
          ),
        );
      }
      const value = factory();
      value.eas.build[profile].ios = {
        env: {
          EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER:
            'iCloud.com.anthonyyoo.justgo',
          ICLOUD_CONTAINER_ENVIRONMENT: 'Production',
        },
      };
      assert.deepEqual(checkBetaRelease(value), []);
    }
  }
});

test('rejects the wrong distribution, inherited/dev/simulator build and unsafe versions', () => {
  for (const mutate of [
    (value) => {
      value.eas.build.beta.distribution = 'internal';
    },
    (value) => {
      value.eas.build.beta.developmentClient = true;
    },
    (value) => {
      value.eas.build.beta.ios = { simulator: true };
    },
    (value) => {
      value.eas.build.beta.ios = { buildConfiguration: 'Debug' };
    },
    (value) => {
      value.eas.build.beta.extends = 'development';
    },
    (value) => {
      value.eas.build.beta.environment = 'production';
    },
    (value) => {
      value.eas.build.beta.node = '20';
    },
    (value) => {
      value.eas.cli.version = 'latest';
    },
    (value) => {
      value.eas.cli.appVersionSource = 'local';
    },
    (value) => {
      value.eas.cli.requireCommit = false;
    },
    (value) => {
      value.eas.build.beta.autoIncrement = false;
    },
    (value) => {
      value.eas.build.production.autoIncrement = false;
    },
    (value) => {
      delete value.eas.build.beta;
    },
  ]) {
    const value = candidate();
    mutate(value);
    assert.ok(
      checkBetaRelease(value).length,
      'Unsafe build configuration passed',
    );
  }
});

test('rejects different API/Auth owners and preserves native account capabilities', () => {
  for (const [area, name, setting] of [
    ['profile', 'IOS_BUNDLE_IDENTIFIER', 'another.app'],
    ['profile', 'EXPO_PUBLIC_API_URL', 'https://another-api.vercel.app'],
    ['profile', 'EXPO_PUBLIC_API_URL', 'https://justgo-two.vercel.app'],
    ['profile', 'EXPO_PUBLIC_API_URL', `${betaApiOrigin}/other`],
    ['environment', 'EXPO_PUBLIC_SUPABASE_URL', 'https://another.supabase.co'],
    ['environment', 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', 'unconfigured'],
    ['environment', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'unconfigured'],
    [
      'environment',
      'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME',
      'com.googleusercontent.apps.wrong',
    ],
    [
      'profile',
      'EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER',
      'iCloud.another.app',
    ],
    ['profile', 'ICLOUD_CONTAINER_ENVIRONMENT', 'Development'],
    ['profile', 'EXPO_PUBLIC_SENTRY_ENABLED', 'true'],
    ['environment', 'JUSTGO_JOURNEY_FIXTURES', '1'],
    ['environment', 'EXPO_PUBLIC_JUSTGO_JOURNEY_FIXTURE', '1'],
  ]) {
    const value = candidate();
    (area === 'profile' ? value.eas.build.beta.env : value.environment)[name] =
      setting;
    assert.ok(checkBetaRelease(value).length, `Unsafe ${name} passed`);
  }
});

test('rejects a partial CloudKit profile before remote environment loading', () => {
  const value = candidate();
  delete value.eas.build.beta.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER;
  assert.ok(
    checkBetaRelease(value).some((error) => error.includes('must be paired')),
  );
});

test('rejects missing, local, credential-bearing and draft legal destinations', () => {
  for (const url of [
    undefined,
    'http://localhost:8095/privacy/',
    'https://127.0.0.1/privacy/',
    'https://[::1]/privacy/',
    'https://notices.local/privacy/',
    'https://notices.localhost./privacy/',
    'https://user:credential@notices.vercel.app/privacy/',
    'https://notices.vercel.app/privacy/?token=private',
    'https://notices.vercel.app/privacy/#fragment',
    'https://notices.vercel.app/terms/',
    `${betaApiOrigin}/legal/privacy`,
    `${betaApiOrigin}/privacy/`,
    'invalid',
  ]) {
    const value = candidate();
    value.environment.EXPO_PUBLIC_PRIVACY_POLICY_URL = url;
    assert.ok(
      checkBetaRelease(value).some((error) =>
        error.includes('EXPO_PUBLIC_PRIVACY_POLICY_URL'),
      ),
    );
  }
});

test('reuses actual publication validation, never treating preview wording as approval', () => {
  for (const source of [
    document.replace('owner-approved', 'owner-review-required'),
    document.replace('2026-10-24', 'pending'),
    document.replace('2026-10-24', '2026-02-30'),
    document.replace('Disposable release configuration test.', '[TODO]'),
    '',
    undefined,
  ]) {
    const value = candidate();
    value.documents['TERMS_DRAFT.md'] = source;
    assert.ok(
      checkBetaRelease(value).some((error) =>
        error.startsWith('TERMS_DRAFT.md'),
      ),
    );
  }
});

test('distinguishes public configuration from secret Auth keys without echoing values', () => {
  const key = (role) =>
    `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  const value = candidate();
  value.environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key('anon');
  assert.deepEqual(checkBetaRelease(value), []);
  for (const secret of [
    'sb_secret_disposable',
    key('service_role'),
    key('authenticated'),
    'header.invalid.signature',
    '',
    undefined,
  ]) {
    value.environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = secret;
    const errors = checkBetaRelease(value);
    assert.ok(errors.some((error) => error.includes('public Supabase')));
    if (secret) assert.ok(!errors.join().includes(secret));
  }
});

test('requires an explicit operation and verified App Store ID/team before uploading', () => {
  const value = candidate();
  assert.ok(checkBetaRelease({ ...value, operation: 'release' }).length);
  for (const id of ['', undefined, 'pending', '1234']) {
    value.eas.submit.beta.ios.ascAppId = id;
    assert.ok(
      checkBetaRelease({ ...value, operation: 'submit' }).some((error) =>
        error.includes('ascAppId'),
      ),
    );
    assert.deepEqual(checkBetaRelease(value), []);
  }
  value.eas.submit.beta.ios.ascAppId = '6821022390';
  value.eas.submit.beta.ios.appleTeamId = 'OTHER';
  assert.ok(
    checkBetaRelease({ ...value, operation: 'submit' }).some((error) =>
      error.includes('Apple team'),
    ),
  );
});
