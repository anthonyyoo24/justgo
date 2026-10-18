import {
  CURRENT_ACCEPTANCE_VERSIONS,
  type AcceptanceReceipt,
} from '@justgo/contracts';
import { AcceptanceController } from './controller';
import type { AccountClient } from '../../lib/network/account-client';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const acceptedAt = '2026-10-17T12:00:00.000Z';
const receipt = (userId = a): AcceptanceReceipt => ({
  userId,
  ...CURRENT_ACCEPTANCE_VERSIONS,
  acceptedAt,
});
const response = (
  userId = a,
  value: AcceptanceReceipt | null = receipt(userId),
  analyticsRestricted = false,
) => ({ userId, receipt: value, analyticsRestricted });
const event = { userId: a, occurredAt: '2026-10-17T12:01:00.000Z' };
const identity = (userId: string | null = a, busy = false) => ({
  initialized: true,
  busy,
  account: userId ? { userId } : null,
  deletionStatus: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(
  handler: (write: boolean) => unknown | Promise<unknown> = () => response(),
) {
  const calls = jest.fn(handler);
  const client: Pick<AccountClient, 'request' | 'ownsAccount'> = {
    ownsAccount: () => true,
    request: async (_path, schema, options) =>
      schema.parse(await calls(options?.method === 'PUT')),
  };
  const controller = new AcceptanceController(client);
  return { controller, calls, client };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it('never loads or forwards before identity hydration and server confirmation', async () => {
  const pending = deferred<ReturnType<typeof response>>();
  const s = setup(() => pending.promise);
  s.controller.changeIdentity({ ...identity(), initialized: false });
  expect(s.calls).not.toHaveBeenCalled();
  expect(s.controller.capture(event)).toBeNull();
  s.controller.changeIdentity(identity());
  expect(s.controller.getSnapshot().status).toBe('loading');
  expect(s.controller.capture(event)).toBeNull();
  pending.resolve(response());
  await pending.promise;
  await settle();
  expect(s.controller.getSnapshot()).toMatchObject({
    status: 'accepted',
    confirmed: true,
  });
  expect(s.controller.capture(event)).not.toBeNull();
  expect(
    s.controller.capture({ ...event, occurredAt: '2026-10-17T11:59:59.999Z' }),
  ).toBeNull();
});

it('saves current versions and suppresses duplicate writes and refreshes while saving', async () => {
  const pending = deferred<ReturnType<typeof response>>();
  const s = setup((write) => (write ? pending.promise : response(a, null)));
  s.controller.changeIdentity(identity());
  await settle();
  expect(s.controller.getSnapshot().status).toBe('required');
  const spy = jest.spyOn(s.client, 'request');
  const first = s.controller.accept();
  await expect(s.controller.accept()).resolves.toBe(false);
  await s.controller.refresh();
  expect(s.calls).toHaveBeenCalledTimes(2);
  expect(spy).toHaveBeenCalledWith(
    '/v1/account/acceptance',
    expect.anything(),
    expect.objectContaining({
      method: 'PUT',
      body: CURRENT_ACCEPTANCE_VERSIONS,
    }),
  );
  pending.resolve(response());
  await expect(first).resolves.toBe(true);
  expect(s.controller.getSnapshot().saving).toBe(false);
});

it('cannot apply a late account response after recovery or deletion', async () => {
  const pending = deferred<ReturnType<typeof response>>();
  const s = setup(() => pending.promise);
  s.controller.changeIdentity(identity());
  s.controller.changeIdentity(identity(b));
  pending.resolve(response());
  await settle();
  expect(s.controller.getSnapshot()).toMatchObject({
    userId: b,
    receipt: null,
    confirmed: false,
    status: 'error',
  });
  expect(s.controller.capture(event)).toBeNull();
  s.controller.changeIdentity({ ...identity(b), deletionStatus: 'pending' });
  expect(s.controller.getSnapshot()).toMatchObject({
    userId: null,
    receipt: null,
    confirmed: false,
  });
  await expect(s.controller.accept()).resolves.toBe(false);
});

it('fences previously captured work across a same-account recovery operation and privacy invalidation', async () => {
  const s = setup();
  s.controller.changeIdentity(identity());
  await settle();
  const ticket = s.controller.capture(event)!;
  expect(s.controller.canDeliver(ticket)).toBe(true);
  s.controller.changeIdentity(identity(a, true));
  expect(s.controller.canDeliver(ticket)).toBe(false);
  s.controller.changeIdentity(identity());
  expect(s.controller.canDeliver(ticket)).toBe(false);
  const newer = s.controller.capture(event)!;
  expect(s.controller.canDeliver(newer)).toBe(true);
  s.controller.invalidate();
  expect(s.controller.canDeliver(newer)).toBe(false);
  await s.controller.refresh();
  expect(s.controller.canDeliver(newer)).toBe(false);
  expect(s.controller.capture(event)).not.toBeNull();
});

it('keeps legal acceptance separate from a permanent analytics privacy restriction', async () => {
  const s = setup(() => response(a, receipt(), true));
  s.controller.changeIdentity(identity());
  await settle();
  expect(s.controller.getSnapshot().status).toBe('accepted');
  expect(s.controller.capture(event)).toBeNull();
  await s.controller.accept();
  expect(s.controller.capture(event)).toBeNull();
});

it('reports safe retry feedback for read/write failures without losing the connected owner', async () => {
  const s = setup(() => {
    throw new Error('private server message');
  });
  s.controller.changeIdentity(identity());
  await settle();
  expect(s.controller.getSnapshot()).toMatchObject({
    userId: a,
    status: 'error',
    confirmed: false,
  });
  expect(s.controller.getSnapshot().message).toContain('Please try again.');
  expect(s.controller.getSnapshot().message).not.toContain('online');
  await expect(s.controller.accept()).resolves.toBe(false);
  expect(s.controller.getSnapshot().message).toBe(
    'Couldn’t save your acceptance. Please try again.',
  );
  expect(s.controller.getSnapshot().message).not.toContain('private');
  s.calls.mockImplementation(() => response());
  await expect(s.controller.accept()).resolves.toBe(true);
  const ticket = s.controller.capture(event)!;
  s.calls.mockImplementationOnce(() => {
    throw new Error('offline');
  });
  await s.controller.refresh();
  expect(s.controller.getSnapshot()).toMatchObject({
    status: 'accepted',
    confirmed: false,
  });
  expect(s.controller.canDeliver(ticket)).toBe(false);
});

it('an old in-flight read cannot overwrite a confirmed acceptance write', async () => {
  const pending = deferred<ReturnType<typeof response>>();
  const s = setup((write) => (write ? response() : pending.promise));
  s.controller.changeIdentity(identity());
  await expect(s.controller.accept()).resolves.toBe(true);
  pending.resolve(response(a, null));
  await settle();
  expect(s.controller.getSnapshot()).toMatchObject({
    status: 'accepted',
    receipt: receipt(),
    confirmed: true,
  });
});

it('requires current owner versions and parks late work when unmounted', async () => {
  const s = setup(() => response(a, { ...receipt(), termsVersion: 'older' }));
  s.controller.changeIdentity(identity());
  await settle();
  expect(s.controller.getSnapshot().status).toBe('required');
  expect(s.controller.capture(event)).toBeNull();
  const pending = deferred<ReturnType<typeof response>>();
  s.calls.mockImplementation(() => pending.promise);
  const work = s.controller.refresh();
  s.controller.changeIdentity(identity(null));
  pending.resolve(response());
  await work;
  expect(s.controller.getSnapshot()).toMatchObject({
    status: 'disconnected',
    receipt: null,
  });
  expect(s.controller.capture(event)).toBeNull();
});

it('requires an active app and new confirmation after foregrounding', async () => {
  const s = setup();
  s.controller.setActive(false);
  s.controller.changeIdentity(identity());
  await settle();
  expect(s.controller.capture(event)).toBeNull();
  s.controller.setActive(true);
  expect(s.controller.capture(event)).toBeNull();
  await s.controller.refresh();
  expect(s.controller.capture(event)).not.toBeNull();
});
