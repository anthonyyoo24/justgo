import { afterEach, expect, it, vi } from 'vitest';
import { readConfig } from '../../src/config.js';
import { createDatabase } from '../../src/db/client.js';
import { IdentityService } from '../../src/identity/service.js';
import { createSuperwallErasure } from '../../src/identity/superwall-erasure.js';
import { buildRuntimeApp } from '../../src/runtime-app.js';
import {
  createConnectKey,
  testBilling,
} from '../../scripts/apple-test-store.js';

const built = vi.hoisted(() => [] as unknown[]);
vi.mock('../../src/identity/superwall-erasure.js', async (original) => {
  const actual =
    await original<typeof import('../../src/identity/superwall-erasure.js')>();
  return {
    ...actual,
    createSuperwallErasure: vi.fn(actual.createSuperwallErasure),
  };
});
vi.mock('../../src/identity/service.js', async (original) => {
  const actual =
    await original<typeof import('../../src/identity/service.js')>();
  class RecordedIdentityService extends actual.IdentityService {
    constructor(...args: ConstructorParameters<typeof actual.IdentityService>) {
      super(...args);
      built.push(this);
    }
  }
  return { ...actual, IdentityService: RecordedIdentityService };
});

afterEach(() => {
  built.length = 0;
  vi.mocked(createSuperwallErasure).mockClear();
});

async function config(billing: boolean) {
  const { pem } = await createConnectKey();
  return readConfig({
    APPLE_IAP_KEY_ID: testBilling.keyId,
    APPLE_IAP_ISSUER_ID: testBilling.issuerId,
    APPLE_BUNDLE_ID: testBilling.bundleId,
    APPLE_IAP_PRIVATE_KEY: pem,
    APPLE_IAP_ENVIRONMENT: testBilling.environment,
    SUPERWALL_WEBHOOK_SECRET: `whsec_${Buffer.alloc(24, 7).toString('base64')}`,
    BILLING_REPAIR_SECRET: 'r'.repeat(32),
    SUPERWALL_API_KEY: 'superwall-erasure-synthetic-key',
    SUPERWALL_APPLICATION_ID: '60560',
    ...(billing ? { BILLING_ENABLED: 'true' } : {}),
    // The pool never connects.
    DATABASE_URL: 'postgresql://justgo@127.0.0.1:1/unused',
    DATABASE_SSL: 'disable',
  });
}

it('gives the runtime identity service the Superwall erasure when billing is on', async () => {
  const billing = await config(true);
  const database = createDatabase(billing);
  try {
    buildRuntimeApp(billing, database);
  } finally {
    await database.pool.end();
  }
  expect(createSuperwallErasure).toHaveBeenCalledExactlyOnceWith({
    apiKey: 'superwall-erasure-synthetic-key',
    applicationId: '60560',
  });
  expect(built).toHaveLength(1);
  const identity = built[0] as IdentityService;
  expect(identity.superwallErasure).toBe(
    vi.mocked(createSuperwallErasure).mock.results[0]?.value,
  );
});

it('leaves the erasure out when billing is off', async () => {
  const free = await config(false);
  const database = createDatabase(free);
  try {
    buildRuntimeApp(free, database);
  } finally {
    await database.pool.end();
  }
  expect(createSuperwallErasure).not.toHaveBeenCalled();
  expect((built[0] as IdentityService).superwallErasure).toBeUndefined();
});
