import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readPolicy,
  uploadCredentials,
  databaseConnection,
  databaseSource,
  endpointFor,
  prefixFor,
  cronJobRunDetailsDeleteAllowed,
} from './configuration.mjs';
import {
  assertRetention,
  artifactMetadata,
  uploadArtifact,
  inspectRetention,
} from './storage.mjs';
import { localRestoreConnection } from './restore-local.mjs';
import { checkIn } from './monitor.mjs';
import {
  captureLedger,
  ledgerTables,
  verifyMigrationRegistry,
} from './snapshot.mjs';
import { validateRecovery } from './recovery.mjs';

const policy = {
  version: 1,
  approvalReference: 'synthetic-owner-approval',
  accountId: 'a'.repeat(32),
  bucket: 'justgo-test',
  environment: 'staging',
  jurisdiction: 'default',
  backupDays: 7,
  ledgerDays: 7,
  lockDays: 7,
  ageRecipient: `age1${'a'.repeat(58)}`,
  sourceHost: 'db.synthetic.supabase.co',
  sourceDatabase: 'postgres',
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
function credentials(claims = {}) {
  const encoded = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const now = Date.now();
  const jwt = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ sub: policy.accountId, iss: 'synthetic-access', aud: new URL(endpointFor(policy)).host, bucket: policy.bucket, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600, actions: ['PutObject', 'HeadObject'], paths: { prefixPaths: ['staging/database/', 'staging/ledger/'], objectPaths: [] }, ...claims })}.synthetic-signature`;
  return {
    R2_UPLOAD_ACCESS_KEY_ID: 'synthetic-access',
    R2_UPLOAD_SECRET_ACCESS_KEY: digest(jwt),
    R2_UPLOAD_SESSION_TOKEN: Buffer.from(`jwt/${jwt}`).toString('base64'),
  };
}
const lock = {
  rules: ['database', 'ledger'].map((kind) => ({
    enabled: true,
    prefix: prefixFor(policy, kind),
    condition: { type: 'Age', maxAgeSeconds: 604800 },
  })),
};
const lifecycle = {
  rules: ['database', 'ledger'].map((kind) => ({
    enabled: true,
    conditions: { prefix: prefixFor(policy, kind) },
    deleteObjectsTransition: { condition: { type: 'Age', maxAge: 604800 } },
  })),
};

test('policy requires exact separately approved bytes and compatible ledger/expiry periods', () => {
  const raw = JSON.stringify(policy);
  assert.deepEqual(readPolicy(raw, digest(raw)), policy);
  assert.throws(() => readPolicy(raw, 'a'.repeat(64)), /not approved/);
  for (const change of [
    { lockDays: 8 },
    { ledgerDays: 6 },
    { ageRecipient: 'AGE-SECRET-KEY-private' },
    { unexpected: true },
  ]) {
    const value = JSON.stringify({ ...policy, ...change });
    assert.throws(() => readPolicy(value, digest(value)));
  }
});
test('cron history DELETE requires explicit approved bytes for the current staging source', () => {
  const approved = {
    ...policy,
    sourceHost: 'db.kmcpcauaxlgpevkkenwd.supabase.co',
    sourceProjectRef: 'kmcpcauaxlgpevkkenwd',
    allowCronJobRunDetailsDelete: true,
  };
  const raw = JSON.stringify(approved);
  assert.equal(
    cronJobRunDetailsDeleteAllowed(readPolicy(raw, digest(raw))),
    true,
  );
  const pooler = JSON.stringify({
    ...approved,
    sourceHost: 'aws-0-ca-central-1.pooler.supabase.com',
  });
  assert.equal(
    cronJobRunDetailsDeleteAllowed(readPolicy(pooler, digest(pooler))),
    true,
  );
  assert.throws(
    () => readPolicy(raw, digest(JSON.stringify(policy))),
    /not approved/,
  );
  assert.equal(cronJobRunDetailsDeleteAllowed(undefined), false);
  assert.equal(cronJobRunDetailsDeleteAllowed(policy), false);
  assert.equal(
    cronJobRunDetailsDeleteAllowed({
      ...policy,
      environment: 'production',
      allowCronJobRunDetailsDelete: false,
    }),
    false,
  );
  for (const change of [
    { environment: 'production' },
    { sourceDatabase: 'other' },
    { sourceProjectRef: undefined },
    {
      sourceProjectRef: 'a'.repeat(20),
      sourceHost: `db.${'a'.repeat(20)}.supabase.co`,
    },
    { sourceHost: 'db.foreign.supabase.co' },
    { allowCronJobRunDetailsDelete: 'true' },
  ]) {
    const candidate = JSON.stringify({ ...approved, ...change });
    assert.throws(() => readPolicy(candidate, digest(candidate)));
  }
});
test('database backup source is fixed, verified TLS, dedicated reader with no URL override', () => {
  const value =
    'postgres://justgo_backup:synthetic@db.synthetic.supabase.co:5432/postgres';
  assert.equal(databaseConnection(value, policy).ssl.rejectUnauthorized, true);
  assert.equal(databaseSource(policy), 'db.synthetic.supabase.co/postgres');
  for (const bad of [
    value + '?sslmode=disable',
    value.replace('justgo_backup', 'postgres'),
    value.replace(':5432', ':6543'),
    value.replace('db.synthetic', 'db.other'),
    value + '#fragment',
  ])
    assert.throws(() => databaseConnection(bad, policy));
});
test('session-pooler backups bind the approved project login and recovery source', () => {
  const project = 'a'.repeat(20);
  const pooler = {
    ...policy,
    sourceHost: 'aws-0-ca-central-1.pooler.supabase.com',
    sourceProjectRef: project,
  };
  const raw = JSON.stringify(pooler);
  assert.deepEqual(readPolicy(raw, digest(raw)), pooler);
  const value = `postgres://justgo_backup.${project}:synthetic@${pooler.sourceHost}:5432/postgres`;
  const connection = databaseConnection(value, pooler);
  assert.equal(connection.user, `justgo_backup.${project}`);
  assert.equal(connection.ssl.rejectUnauthorized, true);
  assert.equal(connection.options, '-c default_transaction_read_only=on');
  assert.equal(
    databaseSource(pooler),
    `${project}@${pooler.sourceHost}/postgres`,
  );
  assert.notEqual(
    databaseSource(pooler),
    databaseSource({ ...pooler, sourceProjectRef: 'b'.repeat(20) }),
  );
  for (const bad of [
    value.replace(project, 'b'.repeat(20)),
    value.replace(`justgo_backup.${project}`, 'justgo_backup'),
    value.replace('justgo_backup', 'postgres'),
    value.replace(':5432', ':6543'),
    value.replace('aws-0-ca-central-1', 'aws-1-ca-central-1'),
    value.replace('/postgres', '/other'),
    value + '?sslmode=disable',
  ])
    assert.throws(() => databaseConnection(bad, pooler));
  for (const invalid of [
    { ...pooler, sourceProjectRef: undefined },
    { ...pooler, sourceProjectRef: 'bad' },
    { ...pooler, sourceHost: `db.${'b'.repeat(20)}.supabase.co` },
  ]) {
    const bytes = JSON.stringify(invalid);
    assert.throws(() => readPolicy(bytes, digest(bytes)));
    assert.throws(() => databaseConnection(value, invalid));
    assert.throws(() => databaseSource(invalid));
  }
});
test('uploader rejects long-lived, delete-capable, wildcard, stale or wrong-bucket credentials', () => {
  assert.equal(uploadCredentials(credentials(), policy).retries, 0);
  for (const claims of [
    { actions: ['PutObject', 'DeleteObject'] },
    { scope: 'object-read-write' },
    { bucket: 'elsewhere' },
    { exp: 1 },
    { paths: { prefixPaths: ['staging/'] } },
    { aud: 'malicious.test' },
  ])
    assert.throws(
      () => uploadCredentials(credentials(claims), policy),
      /PutObject/,
    );
  assert.throws(() => uploadCredentials({}, policy));
});
test('retention requires full matching prefixes and rejects conflicting indefinite/early expiry rules', () => {
  assertRetention(policy, lock, lifecycle);
  assert.throws(() => assertRetention(policy, { rules: [] }, lifecycle));
  assert.throws(() =>
    assertRetention(
      policy,
      {
        rules: [
          ...lock.rules,
          { enabled: true, prefix: '', condition: { type: 'Indefinite' } },
        ],
      },
      lifecycle,
    ),
  );
  assert.throws(() =>
    assertRetention(policy, lock, {
      rules: [
        ...lifecycle.rules,
        {
          enabled: true,
          conditions: { prefix: 'staging/' },
          deleteObjectsTransition: { condition: { type: 'Age', maxAge: 10 } },
        },
      ],
    }),
  );
  assert.throws(() =>
    assertRetention(policy, lock, { rules: lifecycle.rules.slice(1) }),
  );
});
test('retention inspection only reads exact account paths and fails on provider errors', async () => {
  const paths = [];
  await inspectRetention(policy, 'synthetic', async (url, init) => {
    paths.push(url);
    assert.equal(init.redirect, 'error');
    return Response.json({
      success: true,
      result: url.endsWith('/lock')
        ? lock
        : url.endsWith('/lifecycle')
          ? lifecycle
          : url.endsWith('/managed')
            ? { enabled: false }
            : { domains: [] },
    });
  });
  assert.equal(paths.length, 4);
  await assert.rejects(
    inspectRetention(
      policy,
      'synthetic',
      async () => new Response('', { status: 403 }),
    ),
    /inspection/,
  );
});
test('only ciphertext uploads; uncertain PUT is read back once without a second mutation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'justgo-backup-test-'));
  try {
    const path = join(dir, 'sample.age');
    await writeFile(path, 'private journal plaintext');
    await assert.rejects(artifactMetadata(path), /ciphertext/);
    await writeFile(path, 'age-encryption.org/v1\n' + 'x'.repeat(200));
    const metadata = await artifactMetadata(path);
    const calls = [];
    const send = async (input, init) => {
      const method = init.method ?? input.method;
      calls.push(method);
      if (method === 'PUT') {
        for await (const chunk of init.body) assert.ok(chunk.length);
        throw new Error('uncertain');
      }
      return new Response(null, {
        headers: {
          'content-length': String(metadata.bytes),
          'x-amz-meta-sha256': metadata.sha256,
        },
      });
    };
    const result = await uploadArtifact(
      policy,
      uploadCredentials(credentials(), policy),
      'database',
      path,
      '2026-10-28T00:00:00.000Z-00000000-0000-4000-8000-000000000000',
      metadata,
      send,
    );
    assert.deepEqual(calls, ['PUT', 'HEAD']);
    assert.equal(result.sha256, metadata.sha256);
    await assert.rejects(
      uploadArtifact(
        policy,
        uploadCredentials(credentials(), policy),
        'ledger',
        path,
        '2026-10-28T00:00:00.000Z-00000000-0000-4000-8000-000000000000',
        metadata,
        async (input, init) => {
          if (init.method === 'PUT')
            for await (const chunk of init.body) assert.ok(chunk.length);
          return new Response(null, { status: 404 });
        },
      ),
      /verified/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('monitor emits fixed classification only and observes delivery failure', async () => {
  const dsn = `https://${'b'.repeat(32)}@o123.ingest.us.sentry.io/456`;
  const id = await checkIn(
    dsn,
    'justgo-staging-backup-health',
    'in_progress',
    undefined,
    async (url, init) => {
      assert.equal(url, 'https://o123.ingest.us.sentry.io/api/456/envelope/');
      const payload = JSON.parse(init.body.split('\n')[2]);
      assert.deepEqual(Object.keys(payload), [
        'check_in_id',
        'monitor_slug',
        'status',
      ]);
      return new Response(null, { status: 200 });
    },
  );
  assert.match(id, /^[a-f0-9]{32}$/);
  await assert.rejects(
    checkIn(
      dsn,
      'justgo-staging-backup-health',
      'ok',
      id,
      async () => new Response('', { status: 503 }),
    ),
    /delivery/,
  );
  for (const oldSlug of ['justgo-staging-ledger', 'justgo-staging-database'])
    await assert.rejects(
      checkIn(dsn, oldSlug, 'ok', id, async () => assert.fail('no request')),
      /configuration/,
    );
});
test('ledger covers independent app and Auth state but never reads private writing', async () => {
  const statements = [];
  const encoded = await captureLedger(
    {
      query: async (sql) => {
        statements.push(sql);
        return { rows: [] };
      },
    },
    { capturedAt: '2026-10-28T00:00:00.000Z' },
  );
  const ledger = JSON.parse(encoded);
  assert.deepEqual(Object.keys(ledger.tables), [
    ...Object.keys(ledgerTables),
    'auth_users',
    'auth_sessions',
    'auth_refresh_tokens',
  ]);
  assert.doesNotMatch(
    statements.join('\n'),
    /journal_versions|reflection|from justgo.attempts/,
  );
  assert.match(statements.join('\n'), /data_epoch,data_deleted_at/);
});
test('migration count is not frozen at historical 19', async () => {
  await assert.rejects(
    verifyMigrationRegistry(
      { query: async () => ({ rows: [] }) },
      new URL('../../apps/api/drizzle/', import.meta.url).pathname,
    ),
    /migrations differ/,
  );
});
test('restore accepts only disposable loopback target and a complete writer-fenced newer ledger', () => {
  assert.equal(
    localRestoreConnection(
      'postgres://postgres:x@127.0.0.1:5432/justgo_restore_aabbccddeeff',
    ).ssl,
    false,
  );
  for (const value of [
    'postgres://postgres:x@db.example/justgo_restore_aabbccddeeff',
    'postgres://postgres:x@127.0.0.1/justgo_test',
    'postgres://postgres:x@127.0.0.1/justgo_restore_aabbccddeeff?host=hosted',
  ])
    assert.throws(() => localRestoreConnection(value));
  const evidence = {
    version: 1,
    approvalReference: 'synthetic-recovery',
    source: 'source/postgres',
    databaseSha256: 'a'.repeat(64),
    databaseCapturedAt: '2026-10-27T04:43:00.000Z',
    ledgerSha256: 'b'.repeat(64),
    migrationDigest: 'c'.repeat(64),
    writesFencedAt: '2026-10-28T01:00:00.000Z',
    currentLedgerConfirmedAt: '2026-10-28T01:05:00.000Z',
    invalidateAllSessions: true,
  };
  const ledger = {
    format: 'justgo-recovery-ledger',
    version: 1,
    source: 'source/postgres',
    sourceSha: 'd'.repeat(40),
    capturedAt: '2026-10-28T01:02:00.000Z',
    migrationDigest: 'c'.repeat(64),
    tables: Object.fromEntries(
      [
        ...Object.keys(ledgerTables),
        'auth_users',
        'auth_sessions',
        'auth_refresh_tokens',
      ].map((name) => [name, []]),
    ),
  };
  const artifacts = {
    databaseSha256: evidence.databaseSha256,
    ledgerSha256: evidence.ledgerSha256,
  };
  assert.deepEqual(validateRecovery(ledger, evidence, artifacts), evidence);
  assert.throws(
    () =>
      validateRecovery(
        { ...ledger, capturedAt: '2026-10-28T00:23:00.000Z' },
        evidence,
        artifacts,
      ),
    /writers closed/,
  );
  assert.throws(
    () => validateRecovery({ ...ledger, tables: {} }, evidence, artifacts),
    /Incomplete/,
  );
  assert.throws(
    () =>
      validateRecovery(
        ledger,
        { ...evidence, databaseCapturedAt: '2026-10-28T02:00:00.000Z' },
        artifacts,
      ),
    /writers closed/,
  );
  assert.throws(() =>
    validateRecovery(
      ledger,
      { ...evidence, invalidateAllSessions: false },
      artifacts,
    ),
  );
  assert.throws(
    () =>
      validateRecovery(ledger, evidence, {
        ...artifacts,
        ledgerSha256: 'f'.repeat(64),
      }),
    /writers closed/,
  );
});
test('scheduled copies remain opt-in, protected, pinned, sequential and publish no artifacts', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/database-backups.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /vars.JUSTGO_BACKUPS_ENABLED == 'approved'/);
  assert.match(workflow, /environment: database-backups/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /43 4 \* \* \*/);
  assert.match(workflow, /23 \* \* \* \*/);
  assert.match(workflow, /apt.postgresql.org.sh -y/);
  assert.doesNotMatch(
    workflow,
    /upload-artifact@|AGE_SECRET|OFFLINE_KEY|R2_PARENT/,
  );
  assert.match(workflow, /checkout@[a-f0-9]{40}/);
  assert.match(workflow, /github.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /BACKUP_ACTIONS_TOKEN: \$\{\{ github.token \}\}/);
  assert.doesNotMatch(
    workflow,
    /actions: write|secrets\.(?:GH|GITHUB|BACKUP_ACTIONS)_TOKEN/,
  );
  const expression = workflow.match(/^run-name: \$\{\{ (.+) \}\}$/m)?.[1];
  assert.ok(expression);
  // The expression is repository source, not provider input. Exercise the exact
  // title selection used to distinguish successful database and ledger runs.
  const title = new Function('github', 'inputs', `return (${expression});`);
  for (const [event, schedule, kind, expected] of [
    ['schedule', '43 4 * * *', undefined, 'database'],
    ['schedule', '23 * * * *', undefined, 'ledger'],
    ['workflow_dispatch', undefined, 'database', 'database'],
    ['workflow_dispatch', undefined, 'ledger', 'ledger'],
  ])
    assert.equal(
      title({ event_name: event, event: { schedule } }, { kind }),
      `Encrypted ${expected} recovery copy`,
    );
});

test('offline credential minting signs only upload/readback with bounded expiry', async () => {
  const { mintUploadCredentials } =
    await import('./mint-upload-credentials.mjs');
  const { createHmac } = await import('node:crypto');
  const now = Date.now();
  const values = mintUploadCredentials(
    policy,
    'd'.repeat(32),
    'e'.repeat(64),
    86400,
    now,
  );
  assert.equal(
    uploadCredentials(values, policy, now).accessKeyId,
    'd'.repeat(32),
  );
  const jwt = Buffer.from(values.R2_UPLOAD_SESSION_TOKEN, 'base64')
    .toString()
    .slice(4);
  const [header, payload, signature] = jwt.split('.');
  assert.equal(
    signature,
    createHmac('sha256', 'e'.repeat(64))
      .update(`${header}.${payload}`)
      .digest('base64url'),
  );
  assert.throws(
    () =>
      mintUploadCredentials(policy, 'd'.repeat(32), 'e'.repeat(64), 8 * 86400),
    /inputs/,
  );
  assert.doesNotMatch(JSON.stringify(values), new RegExp('e'.repeat(64)));
});
test('a public recovery bucket is refused even when retention rules match', async () => {
  await assert.rejects(
    inspectRetention(policy, 'synthetic', async (url) =>
      Response.json({
        success: true,
        result: url.endsWith('/lock')
          ? lock
          : url.endsWith('/lifecycle')
            ? lifecycle
            : url.endsWith('/managed')
              ? { enabled: true }
              : { domains: [] },
      }),
    ),
    /publicly accessible/,
  );
});
