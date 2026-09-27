import type { AccountClient } from '../../lib/account-client';
import { ApiError } from '../../lib/http';
import { ReflectionController } from './controller';

const attemptId = '00000000-0000-4000-8000-000000000001';
const record = (overrides: Record<string, unknown> = {}) => ({
  attemptId,
  revision: 0,
  status: 'none',
  feelingVersion: 1,
  feeling: null,
  text: null,
  inputMethod: null,
  updatedAt: null,
  ...overrides,
});
const make = (request: jest.Mock) => {
  const finished = jest.fn();
  let next = 1;
  const controller = new ReflectionController(
    { request } as unknown as Pick<AccountClient, 'request'>,
    attemptId,
    finished,
    () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
  );
  return { controller, finished };
};

it('skips an empty reflection without inventing a neutral feeling', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(record())
    .mockResolvedValueOnce(record({ revision: 1, status: 'skipped' }));
  const { controller, finished } = make(request);
  await controller.load();
  expect(controller.getSnapshot().feeling).toBeNull();
  await controller.submit();
  expect(request).toHaveBeenLastCalledWith(
    `/v1/reflections/${attemptId}/skip`,
    expect.anything(),
    {
      body: { actionId: expect.any(String), expectedRevision: 0 },
      signal: expect.anything(),
    },
  );
  expect(finished).toHaveBeenCalledTimes(1);
  controller.dispose();
});

it('saves text alone and retries an uncertain final write with the same action', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(record())
    .mockRejectedValueOnce(new ApiError('NETWORK'))
    .mockResolvedValueOnce(
      record({ revision: 1, status: 'submitted', text: 'I tried.' }),
    );
  const { controller, finished } = make(request);
  await controller.load();
  controller.setText('I tried.');
  await controller.submit();
  expect(controller.getSnapshot().text).toBe('I tried.');
  expect(controller.getSnapshot().pendingFinal).toBe(true);
  expect(finished).not.toHaveBeenCalled();
  await controller.submit();
  const first = request.mock.calls[1][2].body;
  const second = request.mock.calls[2][2].body;
  expect(first).toEqual(second);
  expect(first.feeling).toBeNull();
  expect(first.text).toBe('I tried.');
  expect(finished).toHaveBeenCalledTimes(1);
  controller.dispose();
});

it('uses the confirmed draft revision when submitting a feeling', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(record())
    .mockResolvedValueOnce(
      record({ revision: 1, status: 'draft', feeling: 'a_little_better' }),
    )
    .mockResolvedValueOnce(
      record({ revision: 2, status: 'submitted', feeling: 'a_little_better' }),
    );
  const { controller, finished } = make(request);
  await controller.load();
  controller.setFeeling('a_little_better');
  await controller.retryDraft();
  await controller.submit();
  expect(request.mock.calls[2][2].body).toMatchObject({
    expectedRevision: 1,
    feeling: 'a_little_better',
    text: null,
  });
  expect(finished).toHaveBeenCalledTimes(1);
  controller.dispose();
});

it('keeps local edits after a conflicting draft and requires an explicit resolution', async () => {
  jest.useFakeTimers();
  const request = jest
    .fn()
    .mockResolvedValueOnce(record())
    .mockRejectedValueOnce(new ApiError('CONFLICT'))
    .mockResolvedValueOnce(
      record({ revision: 2, status: 'draft', text: 'Other device' }),
    );
  const { controller } = make(request);
  await controller.load();
  controller.setText('My local words');
  jest.advanceTimersByTime(700);
  await Promise.resolve();
  await Promise.resolve();
  expect(controller.getSnapshot().text).toBe('My local words');
  expect(controller.getSnapshot().conflict).toBe(true);
  await controller.useLatest();
  expect(controller.getSnapshot().text).toBe('Other device');
  expect(controller.getSnapshot().revision).toBe(2);
  controller.dispose();
  jest.useRealTimers();
});
