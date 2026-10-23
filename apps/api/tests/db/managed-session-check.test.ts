import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  checkManagedSessionHelper,
  managedSessionCheckBody,
} from '../../src/db/managed-session-check.js';
import { managedSessionHelper } from './fixtures/managed-session-check.js';

describe('private live-session capability readiness', () => {
  const probe = (rows: unknown[]) =>
    ({ query: vi.fn().mockResolvedValue({ rows }) }) as unknown as Pool;

  it('accepts only the audited operator helper without reading private rows', async () => {
    const pool = probe([managedSessionHelper()]);
    await expect(checkManagedSessionHelper(pool)).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the operator helper has not been installed', async () => {
    await expect(checkManagedSessionHelper(probe([]))).rejects.toThrow(
      'readiness check failed',
    );
  });

  it.each([
    ['body', 'select true;'],
    ['owner', 'justgo_runtime'],
    ['schema_owner', 'justgo_migrator'],
    ['language', 'plpgsql'],
    ['security_definer', false],
    ['strict', false],
    ['volatility', 'i'],
    ['configuration', ['search_path=public']],
    ['configuration', null],
    ['arguments', ['auth_user_id', 'session_id']],
    ['arguments', null],
    ['boolean_result', false],
    ['schema_acl_ok', false],
    ['function_acl_ok', false],
    ['runtime_usage', false],
    ['runtime_execute', false],
    ['runtime_create', true],
    ['other_roles_exposed', true],
    ['runtime_owner_access', true],
    ['runtime_auth_access', true],
  ])('rejects unsafe or incompatible %s metadata (%#)', async (key, value) => {
    const helper = { ...managedSessionHelper(), [key]: value };
    await expect(checkManagedSessionHelper(probe([helper]))).rejects.toThrow(
      'readiness check failed',
    );
  });

  it('keeps the versioned operator body aligned with the deployed-code fingerprint', () => {
    const operator = readFileSync(
      new URL(
        '../../scripts/managed-auth/session-check-v1.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const body = operator.split('$session_check$')[1];
    expect(body?.trim()).toBe(managedSessionCheckBody);
  });
});
