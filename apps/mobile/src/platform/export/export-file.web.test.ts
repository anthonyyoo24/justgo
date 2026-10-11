import { saveExportFile } from './export-file.web';

const originalDocument = globalThis.document;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const link = { href: '', download: '', click: jest.fn(), remove: jest.fn() };
const create = jest.fn<string, [Blob]>(() => 'blob:export');
const revoke = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => link, body: { appendChild: jest.fn() } },
  });
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
});
afterAll(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: originalDocument,
  });
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});
it('downloads a local ZIP with the expected filename and releases its private object URL', async () => {
  const bytes = new Uint8Array([80, 75]);
  await expect(
    saveExportFile({ name: 'JustGO-data.zip', bytes }, () => {}),
  ).resolves.toBe('downloaded');
  expect(create.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
  expect(link.download).toBe('JustGO-data.zip');
  expect(link.click).toHaveBeenCalledTimes(1);
  expect(link.remove).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith('blob:export');
});
it('does not start a stale account download and still revokes its URL', async () => {
  await expect(
    saveExportFile({ name: 'JustGO-data.zip', bytes: new Uint8Array() }, () => {
      throw new Error('Account changed');
    }),
  ).rejects.toThrow('Account changed');
  expect(link.click).not.toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledWith('blob:export');
});
