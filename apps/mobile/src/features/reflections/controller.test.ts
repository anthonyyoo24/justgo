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
const make = (request: jest.Mock, fresh = false) => {
  const finished = jest.fn();
  let next = 1;
  const controller = new ReflectionController(
    { request } as unknown as Pick<AccountClient, 'request'>,
    attemptId,
    finished,
    {
      id: () => `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
      fresh,
    },
  );
  return { controller, finished };
};

it('starts a newly completed reflection ready without a GET', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(
      record({ revision: 1, status: 'submitted', feeling: 'a_little_better' }),
    );
  const { controller, finished } = make(request, true);
  expect(controller.getSnapshot().phase).toBe('ready');
  expect(request).not.toHaveBeenCalled();

  controller.setFeeling('a_little_better');
  await controller.submit();

  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith(
    `/v1/reflections/${attemptId}/final`,
    expect.anything(),
    {
      body: expect.objectContaining({
        expectedRevision: 0,
        feeling: 'a_little_better',
      }),
      signal: expect.anything(),
    },
  );
  expect(finished).toHaveBeenCalledTimes(1);
  controller.dispose();
});

it('detects a conflicting draft even when a fresh form skipped the initial GET', async () => {
  const request = jest
    .fn()
    .mockRejectedValueOnce(new ApiError('CONFLICT'))
    .mockResolvedValueOnce(
      record({ revision: 2, status: 'draft', text: 'Saved elsewhere' }),
    );
  const { controller } = make(request, true);
  controller.setText('My new note');

  await controller.submit();
  expect(controller.getSnapshot()).toMatchObject({
    conflict: true,
    text: 'My new note',
  });
  await controller.useLatest();
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    conflict: false,
    revision: 2,
    text: 'Saved elsewhere',
  });
  controller.dispose();
});

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
  expect(controller.getSnapshot().pendingAction).toBe('final');
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

it('keeps a failed discard-and-skip retry identified as a skip', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(record())
    .mockRejectedValueOnce(new ApiError('NETWORK'))
    .mockResolvedValueOnce(record({ revision: 1, status: 'skipped' }));
  const { controller, finished } = make(request);
  await controller.load();
  controller.setText('An unfinished note');

  await controller.discard();
  expect(controller.getSnapshot()).toMatchObject({
    text: 'An unfinished note',
    pendingAction: 'skip',
    error: 'Couldn’t skip. Retry to leave safely.',
  });
  expect(finished).not.toHaveBeenCalled();

  await controller.submit();
  expect(request.mock.calls[1][0]).toBe(`/v1/reflections/${attemptId}/skip`);
  expect(request.mock.calls[2][0]).toBe(`/v1/reflections/${attemptId}/skip`);
  expect(request.mock.calls[2][2].body).toEqual(request.mock.calls[1][2].body);
  expect(controller.getSnapshot()).toMatchObject({
    pendingAction: 'skip',
    saving: true,
  });
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

it('clears an autosaved feeling and can skip when the form is empty again', async () => {
  const request = jest
    .fn()
    .mockResolvedValueOnce(record())
    .mockResolvedValueOnce(
      record({ revision: 1, status: 'draft', feeling: 'a_little_better' }),
    )
    .mockResolvedValueOnce(record({ revision: 2, status: 'draft' }))
    .mockResolvedValueOnce(record({ revision: 3, status: 'skipped' }));
  const { controller, finished } = make(request);
  await controller.load();
  controller.setFeeling('a_little_better');
  await controller.retryDraft();
  controller.setFeeling(null);
  await controller.retryDraft();
  expect(request.mock.calls[2][2].body).toMatchObject({
    expectedRevision: 1,
    feeling: null,
    text: null,
  });
  expect(controller.getSnapshot().feeling).toBeNull();
  await controller.submit();
  expect(request.mock.calls[3][0]).toBe(`/v1/reflections/${attemptId}/skip`);
  expect(request.mock.calls[3][2].body.expectedRevision).toBe(2);
  expect(finished).toHaveBeenCalledTimes(1);
  controller.dispose();
});

it('keeps a draft failure visible through retry until the draft is saved', async () => {
  let finishRetry: ((response: ReturnType<typeof record>) => void) | undefined;
  const request = jest
    .fn()
    .mockResolvedValueOnce(record())
    .mockRejectedValueOnce(new ApiError('NETWORK'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRetry = resolve;
        }),
    );
  const { controller } = make(request);
  await controller.load();
  controller.setText('I showed up.');
  await controller.retryDraft();
  expect(controller.getSnapshot().draftError).toBe(true);
  const retry = controller.retryDraft();
  expect(controller.getSnapshot().draftError).toBe(true);
  finishRetry?.(record({ revision: 1, status: 'draft', text: 'I showed up.' }));
  await retry;
  expect(controller.getSnapshot().draftError).toBe(false);
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
