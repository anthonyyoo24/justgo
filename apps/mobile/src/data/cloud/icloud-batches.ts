import {
  ICLOUD_PAGE_LIMIT,
  ICLOUD_WRITE_BYTE_LIMIT,
  ICloudError,
  iCloudUtf8Bytes,
  type ICloudValue,
} from '../../platform/icloud/model';

/** Bound the serialized bridge payload as well as CloudKit's record count. */
export function iCloudWriteBatches(
  records: readonly ICloudValue[],
): ICloudValue[][] {
  const batches: ICloudValue[][] = [];
  let batch: ICloudValue[] = [];
  let bytes = 2; // The JSON array's brackets.
  for (const record of records) {
    const recordBytes = iCloudUtf8Bytes(JSON.stringify(record));
    if (recordBytes + 2 > ICLOUD_WRITE_BYTE_LIMIT)
      throw new ICloudError('INVALID_DATA');
    const separatorBytes = batch.length ? 1 : 0;
    if (
      batch.length === ICLOUD_PAGE_LIMIT ||
      bytes + separatorBytes + recordBytes > ICLOUD_WRITE_BYTE_LIMIT
    ) {
      batches.push(batch);
      batch = [];
      bytes = 2;
    }
    bytes += (batch.length ? 1 : 0) + recordBytes;
    batch.push(record);
  }
  if (batch.length) batches.push(batch);
  return batches;
}
