import type { Pool } from 'pg';
import { describe, it, expect, vi } from 'vitest';
import { retryManagedAuthDeletions } from '../../scripts/auth-deletion-cleanup.js';
describe('accepted Auth deletion cleanup', () => {
  it('retries only a bounded pending batch, marks completed work and retains failed cleanup', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { user_id: 'owner-a', auth_user_id: 'auth-a' },
          { user_id: 'owner-b', auth_user_id: 'auth-b' },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const erase = vi.fn(async (id: string) => {
      if (id === 'auth-b') throw new Error('private provider failure');
    });
    expect(
      await retryManagedAuthDeletions({ query } as unknown as Pool, erase, 2),
    ).toEqual({ completed: 1, failed: 1 });
    expect(query.mock.calls[0]?.[1]).toEqual([2]);
    expect(query.mock.calls[0]?.[0]).toContain('u.deleted_at is not null');
    expect(query.mock.calls[1]?.[1]).toEqual(['owner-a', 'auth-a']);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rejects unbounded batches before querying and keeps uncertain completion retryable', async () => {
    const query = vi.fn();
    for (const limit of [0, 101, 1.5])
      await expect(
        retryManagedAuthDeletions(
          { query } as unknown as Pool,
          async () => {},
          limit,
        ),
      ).rejects.toThrow('batch size');
    expect(query).not.toHaveBeenCalled();
    query
      .mockResolvedValueOnce({
        rows: [{ user_id: 'owner', auth_user_id: 'auth' }],
      })
      .mockRejectedValueOnce(new Error('database unavailable'));
    expect(
      await retryManagedAuthDeletions(
        { query } as unknown as Pool,
        async () => {},
      ),
    ).toEqual({ completed: 0, failed: 1 });
  });
});
