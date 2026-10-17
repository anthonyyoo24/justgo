import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, expect } from 'vitest';
import { type TransferStart } from '@justgo/contracts';
import { createDatabase, poolOptions } from '../../../src/db/client.js';
import { readConfig } from '../../../src/config.js';
import { IdentityService } from '../../../src/identity/service.js';
import { buildApp } from '../../../src/build-app.js';
import { localTestDatabaseUrl } from '../../../scripts/local-test-database.js';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '3' });
for (const url of [config.DATABASE_URL, migrationUrl])
  localTestDatabaseUrl(url);
const db = createDatabase(config);
const admin = new Pool(
  poolOptions(readConfig({ ...process.env, DATABASE_URL: migrationUrl! })),
);
const rateKey = `isolated-identity-integration-tests-${randomUUID()}`;
const service = new IdentityService(db.db, {
  rateKey,
  rateLimit: 3,
});
const app = buildApp({
  logger: false,
  checkDatabase: async () => {},
  origins: ['http://localhost:8081'],
  identity: service,
});
const users = new Set<string>(),
  transfers = new Set<string>();
function retryAfterSeconds(value: unknown) {
  expect(typeof value).toBe('string');
  const seconds = Number(value);
  expect(Number.isInteger(seconds)).toBe(true);
  expect(seconds).toBeGreaterThanOrEqual(1);
  expect(seconds).toBeLessThanOrEqual(600);
  return seconds;
}
const secret = () => randomBytes(32).toString('hex');
const proposal = () => ({
  deviceId: randomUUID(),
  sessionId: randomUUID(),
  sessionToken: secret(),
});
const request = () => ({ ...proposal(), credential: secret() });
async function account(input = request()) {
  const session = await service.bootstrap(input);
  users.add(session.userId);
  return { input, session };
}
const transfer = (): TransferStart => ({
  id: randomUUID(),
  code: randomBytes(8).toString('hex').toUpperCase(),
  claimSecret: secret(),
  ...request(),
});
async function start(input = transfer()) {
  const result = await service.startTransfer(input);
  transfers.add(input.id);
  return { input, result };
}
let address = 0;
function nextAddress(subnet = 1) {
  return `127.${subnet}.0.${++address}`;
}
const post = (
  path: string,
  payload: unknown,
  token?: string,
  ip = nextAddress(),
) =>
  app.inject({
    method: 'POST',
    url: `/v1${path}`,
    payload: payload as object,
    remoteAddress: ip,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
const remove = (
  path: string,
  token: string,
  payload?: object,
  ip = nextAddress(),
) =>
  app.inject({
    method: 'DELETE',
    url: `/v1${path}`,
    remoteAddress: ip,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  });
afterAll(async () => {
  try {
    for (const id of transfers)
      await admin.query('delete from justgo.device_transfers where id=$1', [
        id,
      ]);
    for (const id of users) {
      for (const table of [
        'device_transfers',
        'device_sessions',
        'recovery_credentials',
        'devices',
      ])
        await admin.query(`delete from justgo.${table} where user_id=$1`, [id]);
      await admin.query('delete from justgo.users where id=$1', [id]);
    }
    // Rate keys contain only a test-specific HMAC namespace; don't truncate shared tables.
  } finally {
    await app.close();
    await Promise.all([db.pool.end(), admin.end()]);
  }
});
export {
  migrationUrl,
  config,
  db,
  admin,
  rateKey,
  service,
  app,
  users,
  transfers,
  retryAfterSeconds,
  secret,
  proposal,
  request,
  account,
  transfer,
  start,
  nextAddress,
  post,
  remove,
};
