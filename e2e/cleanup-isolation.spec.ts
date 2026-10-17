import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { test, expect } from './support/fixtures';
import { journeyApiUrl, journeyEnvironment } from './support/environment';

const secret = () => randomBytes(32).toString('hex');
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const outsiders = ['rejected', 'accepted'].map((outcome) => ({
  outcome,
  userId: randomUUID(),
  credential: secret(),
  deviceId: randomUUID(),
  sessionId: randomUUID(),
  sessionToken: secret(),
}));
const outsiderRateKey = secret();
let database: Pool;

test.beforeAll(async () => {
  database = new Pool({
    connectionString: journeyEnvironment(process.env).migrationUrl,
    ssl: false,
    max: 1,
  });
  await database.query(
    'insert into justgo.identity_rate_buckets (key,count,window_start) values ($1,7,now())',
    [outsiderRateKey],
  );
  // These accounts predate the browser requests and are not owned by its fixture API.
  for (const account of outsiders) {
    await database.query('begin');
    try {
      await database.query('insert into justgo.users (id) values ($1)', [
        account.userId,
      ]);
      await database.query(
        'insert into justgo.devices (id,user_id) values ($1,$2)',
        [account.deviceId, account.userId],
      );
      await database.query(
        "insert into justgo.recovery_credentials (id,user_id,digest,kind) values ($1,$2,$3,'sync')",
        [randomUUID(), account.userId, digest(account.credential)],
      );
      await database.query(
        "insert into justgo.device_sessions (id,user_id,device_id,digest,expires_at) values ($1,$2,$3,$4,now()+interval '1 day')",
        [
          account.sessionId,
          account.userId,
          account.deviceId,
          digest(account.sessionToken),
        ],
      );
      await database.query('commit');
    } catch (error) {
      await database.query('rollback');
      throw error;
    }
  }
});

for (const account of outsiders) {
  test(`${account.outcome} bootstrap cannot authorize cleanup of an existing account`, async ({
    page,
  }) => {
    await page.goto('/recovery');
    const status = await page.evaluate(
      async ({ url, body }) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        return response.status;
      },
      {
        url: `${journeyApiUrl}/v1/sessions`,
        body: {
          kind: 'bootstrap',
          credential: account.credential,
          deviceId: account.deviceId,
          sessionId: account.sessionId,
          sessionToken:
            account.outcome === 'accepted' ? account.sessionToken : secret(),
        },
      },
    );
    expect(status).toBe(account.outcome === 'accepted' ? 200 : 409);
  });
}

test('each case retains the real 120-request identity limit', async ({
  request,
  fixtureDatabase,
}) => {
  // The database fixture resets only this server's budgets before the case.
  expect(
    (
      await fixtureDatabase.query(
        'select count from justgo.identity_rate_buckets where key=$1',
        [outsiderRateKey],
      )
    ).rows,
  ).toEqual([{ count: 7 }]);
  for (let index = 0; index < 120; index++)
    expect((await request.get(`${journeyApiUrl}/v1/devices`)).status()).toBe(
      401,
    );
  const limited = await request.get(`${journeyApiUrl}/v1/devices`);
  expect(limited.status()).toBe(429);
  expect(await limited.json()).toMatchObject({ code: 'RATE_LIMITED' });
  expect(limited.headers()['retry-after']).toBe('600');
});

test('a later case has a fresh allowance without clearing unrelated rate buckets', async ({
  request,
  fixtureDatabase,
}) => {
  expect((await request.get(`${journeyApiUrl}/v1/devices`)).status()).toBe(401);
  expect(
    (
      await fixtureDatabase.query(
        'select count from justgo.identity_rate_buckets where key=$1',
        [outsiderRateKey],
      )
    ).rows,
  ).toEqual([{ count: 7 }]);
});

test.afterAll(async () => {
  if (!database) return;
  const ids = outsiders.map((account) => account.userId);
  try {
    // Runs after each page fixture's privileged teardown, catching either nomination path.
    const remaining = await database.query(
      'select id from justgo.users where id=any($1::uuid[])',
      [ids],
    );
    expect(remaining.rows).toHaveLength(outsiders.length);
  } finally {
    try {
      for (const table of [
        'device_sessions',
        'recovery_credentials',
        'devices',
      ])
        await database.query(
          `delete from justgo.${table} where user_id=any($1::uuid[])`,
          [ids],
        );
      await database.query(
        'delete from justgo.users where id=any($1::uuid[])',
        [ids],
      );
      await database.query(
        'delete from justgo.identity_rate_buckets where key=$1',
        [outsiderRateKey],
      );
    } finally {
      await database.end();
    }
  }
});
