import { ReflectionController } from './controller';
import { AccountRepository } from '../../data/activity/repository';
import { ApiError } from '../../lib/network/http';
import {
  MemoryStorage,
  backend,
  card,
  input,
  deferred,
  owner,
  today,
  uuid,
  zone,
} from '../../../test-support/journal';
let repository: AccountRepository;
let controller: ReflectionController;
let storage: MemoryStorage;
let finished: jest.Mock;
let current: boolean;
let transport: ReturnType<typeof backend>;
beforeEach(async () => {
  storage = new MemoryStorage();
  transport = backend();
  repository = new AccountRepository({
    accountId: owner,
    storage,
    transport,
    today,
    timeZone: zone,
  });
  repository.setEnvironment({ active: true, online: false });
  await repository.complete(input(), card);
  finished = jest.fn();
  current = true;
  controller = new ReflectionController(repository, uuid(1), finished, {
    id: () => uuid(2),
    isCurrent: () => current,
  });
  controller.connect();
});
afterEach(() => {
  controller.dispose();
  repository.dispose();
});
it.each([false, true])(
  'opens an editable reflection when delayed hydration supplies the attempt (saved reflection: %s)',
  async (editing) => {
    if (editing)
      await repository.submitReflection(uuid(1), uuid(8), {
        feeling: 'a_lot_better',
        text: 'Retained writing',
      });
    const raw = storage.values.get(`justgo:v1:${owner}:journal`)!;
    controller.dispose();
    repository.dispose();
    const read = deferred<string | null>();
    jest.spyOn(storage, 'getItem').mockImplementationOnce(() => read.promise);
    repository = new AccountRepository({
      accountId: owner,
      storage,
      transport,
      today,
      timeZone: zone,
    });
    repository.setEnvironment({ active: true, online: false });
    const hydration = repository.hydrate();
    controller = new ReflectionController(repository, uuid(1), finished, {
      id: () => uuid(9),
    });
    controller.connect();
    expect(controller.getSnapshot().phase).toBe('missing');
    read.resolve(raw);
    await hydration;
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'ready',
      editing,
      text: editing ? 'Retained writing' : '',
      feeling: editing ? 'a_lot_better' : null,
    });
    controller.setText('New explicit submission');
    await controller.submit();
    expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
      'New explicit submission',
    );
    expect(finished).toHaveBeenCalledTimes(1);
  },
);

it('reconciles hydration completed between construction and subscription, including rejected writing', async () => {
  await repository.submitReflection(uuid(1), uuid(8), {
    text: 'Rejected writing',
  });
  const journal = structuredClone(repository.store.getState().journal);
  const patch = journal.operations.find(
    (operation) => operation.kind === 'patch',
  )!;
  patch.state = 'rejected';
  patch.code = 'INVALID_REQUEST';
  storage.values.set(`justgo:v1:${owner}:journal`, JSON.stringify(journal));
  controller.dispose();
  repository.dispose();
  repository = new AccountRepository({
    accountId: owner,
    storage,
    transport,
    today,
    timeZone: zone,
  });
  repository.setEnvironment({ active: true, online: false });
  controller = new ReflectionController(repository, uuid(1), finished);
  expect(controller.getSnapshot().phase).toBe('missing');
  await repository.hydrate();
  controller.connect();
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    text: 'Rejected writing',
    editing: true,
  });
  expect(controller.getSnapshot().error).toMatch(/wasn’t accepted/);
  await controller.submit();
  expect(controller.getSnapshot().error).toMatch(/unchanged submission/);
  expect(finished).not.toHaveBeenCalled();
});
it('keeps typing private and skips an empty reflection exactly once', async () => {
  controller.setText('  ');
  await controller.submit();
  await controller.submit();
  expect(finished).toHaveBeenCalledTimes(1);
  expect(repository.store.getState().journal.operations).toHaveLength(1);
});
it('saves text with its whitespace and feeling only on explicit submission', async () => {
  controller.setFeeling('a_little_better');
  controller.setText(' I tried. ');
  expect(repository.getAttempt(uuid(1))?.reflection).toBeNull();
  await controller.submit();
  expect(repository.getAttempt(uuid(1))?.reflection).toMatchObject({
    feeling: 'a_little_better',
    text: ' I tried. ',
  });
  expect(finished).toHaveBeenCalledTimes(1);
});
it('offers keep editing, discard or save on dirty close without submitting a draft', async () => {
  controller.setText('Writing');
  controller.close();
  expect(controller.getSnapshot().dismissOpen).toBe(true);
  controller.keepEditing();
  expect(controller.getSnapshot().dismissOpen).toBe(false);
  controller.close();
  controller.discard();
  expect(finished).toHaveBeenCalledTimes(1);
  expect(repository.getAttempt(uuid(1))?.reflection).toBeNull();
});
it('clean close does not write and a disposed or missing editor cannot submit', async () => {
  controller.close();
  expect(finished).toHaveBeenCalledTimes(1);
  controller.dispose();
  await controller.submit();
  controller = new ReflectionController(repository, uuid(99), finished);
  controller.setFeeling('a_lot_better');
  controller.setText('missing');
  await controller.submit();
  expect(controller.getSnapshot().phase).toBe('missing');
  expect(finished).toHaveBeenCalledTimes(1);
});
it('coalesces dirty-close saves and preserves text typed during a slow write', async () => {
  controller.setText('First');
  controller.close();
  const block = deferred<void>();
  storage.blocked = block;
  const first = controller.submit();
  expect(controller.submit()).toBe(first);
  controller.close();
  controller.discard();
  controller.setFeeling('a_lot_better');
  controller.setText('Newer');
  block.resolve();
  await first;
  expect(finished).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({
    text: 'Newer',
    editing: true,
    submitting: false,
    dismissOpen: false,
  });
  expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe('First');
});
it.each(['account change', 'unmount'])(
  'fences late reflection navigation after %s',
  async (boundary) => {
    controller.setText('First');
    const block = deferred<void>();
    storage.blocked = block;
    const work = controller.submit();
    if (boundary === 'account change') current = false;
    else controller.dispose();
    block.resolve();
    await work;
    expect(finished).not.toHaveBeenCalled();
  },
);
it('validates length and empty edits without losing the input', async () => {
  controller.setText('x'.repeat(10001));
  await controller.submit();
  expect(controller.getSnapshot().error).toMatch(/10,000/);
  expect(controller.getSnapshot().text).toHaveLength(10001);
  await repository.submitReflection(uuid(1), uuid(8), { text: 'Saved' });
  controller.dispose();
  controller = new ReflectionController(repository, uuid(1), finished, {
    id: () => uuid(9),
  });
  controller.setFeeling('a_lot_better');
  expect(controller.getSnapshot().feeling).toBeNull();
  controller.setText('');
  await controller.submit();
  expect(controller.getSnapshot().error).toMatch(/Add some text/);
});
it('edits text while preserving saved feelings, and adopts remote recovery only in an untouched editor', async () => {
  await repository.submitReflection(uuid(1), uuid(8), {
    feeling: 'a_lot_better',
    text: 'Saved',
  });
  expect(controller.getSnapshot()).toMatchObject({
    feeling: 'a_lot_better',
    text: 'Saved',
    editing: true,
  });
  controller.setText('Unsent');
  await repository.submitReflection(uuid(1), uuid(9), { text: 'Remote' });
  expect(controller.getSnapshot().text).toBe('Unsent');
  await controller.submit();
  expect(repository.getAttempt(uuid(1))?.reflection).toMatchObject({
    text: 'Unsent',
    feeling: 'a_lot_better',
  });
});
it('retains input after a refused submission and allows a corrected retry', async () => {
  const submit = jest
    .spyOn(repository, 'submitReflection')
    .mockRejectedValueOnce(new Error('refused'));
  controller.setText('Retained');
  await controller.submit();
  expect(controller.getSnapshot()).toMatchObject({
    text: 'Retained',
    submitting: false,
  });
  expect(controller.getSnapshot().error).toBeTruthy();
  await controller.submit();
  expect(submit).toHaveBeenCalledTimes(2);
  expect(finished).toHaveBeenCalledTimes(1);
});
it('retains rejected writing, refuses unchanged Save, and submits a changed correction through the repository', async () => {
  const patch = jest
    .spyOn(transport, 'patch')
    .mockRejectedValueOnce(
      new ApiError('INVALID_REQUEST', 'fixture-reference'),
    );
  controller.setFeeling('a_lot_better');
  controller.setText('Rejected writing');
  await controller.submit();
  repository.setEnvironment({ active: true, online: true });
  await repository.synchronize();
  expect(
    repository.store
      .getState()
      .journal.operations.some(
        (op) => op.kind === 'patch' && op.state === 'rejected',
      ),
  ).toBe(true);
  controller.dispose();
  finished.mockClear();
  controller = new ReflectionController(repository, uuid(1), finished, {
    id: () => uuid(3),
  });
  controller.connect();
  expect(controller.getSnapshot()).toMatchObject({
    text: 'Rejected writing',
    feeling: 'a_lot_better',
  });
  expect(controller.getSnapshot().error).toMatch(/wasn’t accepted/);
  const submit = jest.spyOn(repository, 'submitReflection');
  await controller.submit();
  expect(submit).not.toHaveBeenCalled();
  expect(finished).not.toHaveBeenCalled();
  expect(controller.getSnapshot().error).toMatch(/unchanged submission/);
  controller.setText('Corrected writing');
  await controller.submit();
  await repository.synchronize();
  expect(finished).toHaveBeenCalledTimes(1);
  expect(patch).toHaveBeenCalledTimes(2);
  expect(transport.records.get(uuid(1))?.reflection).toMatchObject({
    text: 'Corrected writing',
    feeling: 'a_lot_better',
    revision: 1,
  });
});
