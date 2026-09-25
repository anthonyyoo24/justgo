import { QueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import {
  venues,
  type Attempt,
  type ChallengeQueue,
  type ChallengeState,
} from '@justgo/contracts';
import { ChallengeController } from './controller';
import { ApiError } from '../../lib/http';
import { accountKey } from '../../lib/account-client';
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
const card = {
  id: 'ST-01',
  challengeId: 'hello',
  revisionId: 'hello-v1',
  levelId: 'level-1' as const,
  venue: 'streets' as const,
  text: 'Say hello.',
  durationSeconds: 300,
};
const queue: ChallengeQueue = {
  venue: 'streets',
  version: 0,
  cards: [card, { ...card, id: 'ST-02' }],
};
const active: Attempt = {
  id: '00000000-0000-4000-8000-000000000001',
  card,
  status: 'active',
  startedAt: '2026-09-24T16:00:00.000Z',
  deadlineAt: '2026-09-24T16:05:00.000Z',
  endedAt: null,
  elapsedSeconds: null,
  timeZone: null,
  completionDate: null,
};
const base: ChallengeState = {
  selectedVenue: 'streets',
  active: null,
  latestOutcome: null,
  serverNow: '2026-09-24T16:00:00.000Z',
};
it('ignores cache construction and unrelated account/access events while projecting its own data changes', () => {
  const queries = new QueryClient();
  const controller = new ChallengeController({ queries, request: jest.fn() });
  controller.changeAccount('owner');
  const listener = jest.fn();
  controller.subscribe(listener);
  const accessKey = accountKey('owner', 'access');
  const queueKey = accountKey('owner', 'challenges', 'queue', 'streets');
  // Query construction happens during useQuery's render, before subscription.
  queries.getQueryCache().build(queries, { queryKey: accessKey });
  queries.getQueryCache().build(queries, { queryKey: queueKey });
  queries.setQueryData(accessKey, { status: 'verified' });
  queries.setQueryData(
    accountKey('someone-else', 'challenges', 'queue', 'streets'),
    queue,
  );
  expect(listener).not.toHaveBeenCalled();
  queries.setQueryData(queueKey, queue);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().queues.streets).toEqual(queue);
  queries.removeQueries({ queryKey: queueKey, exact: true });
  expect(listener).toHaveBeenCalledTimes(2);
  expect(controller.getSnapshot().queues.streets).toBeUndefined();
  queries.clear();
});
function fixture(
  handler?: (path: string, body: unknown) => unknown | Promise<unknown>,
) {
  const calls = jest.fn(async (path: string, options?: { body?: unknown }) => {
    const handled = await handler?.(path, options?.body);
    if (handled !== undefined) return handled;
    if (path === '/v1/challenges/state') return base;
    const venue = venues.find((v) => path.endsWith(`/queue/${v.id}`));
    if (venue)
      return {
        ...queue,
        venue: venue.id,
        cards: queue.cards.map((c) => ({ ...c, venue: venue.id })),
      };
    return { ok: true };
  });
  const controller = new ChallengeController(
    {
      queries: new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
      }),
      request: async <T>(
        path: string,
        schema: z.ZodType<T>,
        options?: { body?: unknown },
      ) => schema.parse(await calls(path, options)),
    },
    () => active.id,
  );
  controller.changeAccount('owner');
  return { controller, calls };
}
it('retains matching start inputs after an uncertain response and prevents duplicate actions', async () => {
  let saves = 0;
  const bodies: unknown[] = [];
  const { controller } = fixture((path, body) => {
    if (path.endsWith('/start')) {
      bodies.push(body);
      if (++saves === 1) throw new ApiError('TIMEOUT');
      return { attempt: active, serverNow: base.serverNow };
    }
    if (path.endsWith('/state') && saves > 1) return { ...base, active };
  });
  await controller.refresh();
  await controller.act(1);
  expect(controller.getSnapshot().state?.active).toBeNull();
  expect(controller.getSnapshot().pending?.kind).toBe('start');
  await controller.act(1);
  expect(saves).toBe(1);
  await controller.select('gym');
  expect(controller.getSnapshot().selected).toBe('streets');
  await controller.retry();
  expect(bodies[1]).toEqual(bodies[0]);
  expect(controller.getSnapshot().state?.active).toEqual(active);
  expect(controller.getSnapshot().pending).toBeNull();
});
it('shows success only after confirmed completion and keeps the same frozen time zone on retry', async () => {
  let saved = false;
  const bodies: unknown[] = [];
  const done = {
    ...active,
    status: 'completed',
    endedAt: base.serverNow,
    completionDate: '2026-09-24',
    timeZone: 'UTC',
    elapsedSeconds: 0,
  };
  const { controller } = fixture((path, body) => {
    if (path.endsWith('/state'))
      return { ...base, active: saved ? null : active };
    if (path.endsWith('/finish')) {
      bodies.push(body);
      if (!saved) {
        saved = true;
        throw new ApiError('NETWORK');
      }
      return { attempt: done, serverNow: base.serverNow };
    }
  });
  await controller.refresh();
  await controller.finish('completed');
  expect(controller.getSnapshot().success).toBeNull();
  await controller.finish('given_up');
  expect(bodies).toHaveLength(1);
  await controller.retry();
  expect(bodies[1]).toEqual(bodies[0]);
  expect(controller.getSnapshot().success?.id).toBe(active.id);
});
it('recovers the original active attempt after a new controller loads', async () => {
  const { controller } = fixture((path) =>
    path.endsWith('/state') ? { ...base, active } : undefined,
  );
  await controller.refresh();
  expect(controller.getSnapshot().state?.active?.deadlineAt).toBe(
    active.deadlineAt,
  );
});
it('discards late responses and pending actions on account changes', async () => {
  let resolve!: (x: unknown) => void;
  const { controller } = fixture((path) =>
    path.endsWith('/start')
      ? new Promise((r) => {
          resolve = r;
        })
      : undefined,
  );
  await controller.refresh();
  const saving = controller.act(1);
  await Promise.resolve();
  controller.changeAccount('another');
  resolve({ attempt: active, serverNow: base.serverNow });
  await saving;
  expect(controller.getSnapshot().state).toBeNull();
  expect(controller.getSnapshot().success).toBeNull();
  expect(controller.getSnapshot().pending).toBeNull();
});
it('refreshes canonical state after another device wins a start', async () => {
  let conflict = false;
  const { controller } = fixture((path) => {
    if (path.endsWith('/start')) {
      conflict = true;
      throw new ApiError('CONFLICT');
    }
    if (path.endsWith('/state') && conflict) return { ...base, active };
  });
  await controller.refresh();
  await controller.act(1);
  expect(controller.getSnapshot().state?.active).toEqual(active);
  expect(controller.getSnapshot().pending).toBeNull();
});
