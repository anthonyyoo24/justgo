import {
  ICLOUD_PAGE_LIMIT,
  ICLOUD_WRITE_BYTE_LIMIT,
  iCloudValueSchema,
  type ICloudValue,
} from '../../platform/icloud/model';
import { uuid } from '../../../test-support/journal';
import { iCloudWriteBatches } from './icloud-batches';

it('keeps small uploads within the record limit and omits empty writes', () => {
  const records = Array.from({ length: 51 }, (_, index) => ({
    id: uuid(index + 1),
    value: '{}',
  }));
  const batches = iCloudWriteBatches(records);
  expect(batches.map((batch) => batch.length)).toEqual([50, 1]);
  expect(batches.flat()).toEqual(records);
  expect(iCloudWriteBatches([])).toEqual([]);
});

it('bounds actual serialized UTF-8 bytes including escaped JSON and array overhead', () => {
  const records = Array.from({ length: 50 }, (_, index) =>
    iCloudValueSchema.parse({
      id: uuid(index + 1),
      value: JSON.stringify({
        text: '界'.repeat(10_000),
        instruction: '界'.repeat(10_000),
        escaped: '\n"\\',
      }),
    }),
  );
  expect(Buffer.byteLength(JSON.stringify(records), 'utf8')).toBeGreaterThan(
    3_000_000,
  );
  const batches = iCloudWriteBatches(records);
  expect(batches.length).toBeGreaterThan(1);
  for (const batch of batches) {
    expect(batch.length).toBeLessThanOrEqual(ICLOUD_PAGE_LIMIT);
    expect(
      Buffer.byteLength(JSON.stringify(batch), 'utf8'),
    ).toBeLessThanOrEqual(ICLOUD_WRITE_BYTE_LIMIT);
  }
  expect(batches.flat()).toEqual(records);
});

it('rejects a single record that cannot fit rather than dispatching an oversized batch', () => {
  const record: ICloudValue = {
    id: uuid(1),
    value: 'x'.repeat(ICLOUD_WRITE_BYTE_LIMIT),
  };
  expect(() => iCloudWriteBatches([record])).toThrow('INVALID_DATA');
});
