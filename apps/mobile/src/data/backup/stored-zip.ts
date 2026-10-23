import { strFromU8, strToU8 } from 'fflate';

const journalName = 'journal.json';
const exportNames = [journalName, 'activity.csv', 'data.json', 'README.txt'];

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes)
    value = (crcTable[(value ^ byte) & 255] ?? 0) ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/**
 * Accept our original single-entry backup or the four-entry account export.
 * Every member must be stored, contiguous, uniquely named and CRC-valid. Only
 * JSON members are decoded without extracting paths. No inflation, ZIP64,
 * encryption, arbitrary members or data descriptors are supported.
 */
export function readStoredBackupZip(bytes: Uint8Array): {
  journal: string | null;
  data: string | null;
} {
  const invalid = () => new Error('Invalid journal archive');
  if (bytes.length < 22) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  const end = bytes.length - 22;
  const count = u16(end + 10);
  if (
    u32(end) !== 0x06054b50 ||
    u16(end + 4) !== 0 ||
    u16(end + 6) !== 0 ||
    u16(end + 8) !== count ||
    (count !== 1 && count !== 3 && count !== exportNames.length) ||
    u16(end + 20) !== 0
  )
    throw invalid();
  const centralStart = u32(end + 16);
  if (centralStart + u32(end + 12) !== end) throw invalid();
  const names = new Set<string>();
  let local = 0;
  let central = centralStart;
  let journal: Uint8Array | undefined;
  let dataFile: Uint8Array | undefined;
  for (let index = 0; index < count; index += 1) {
    if (central + 46 > end || local + 30 > centralStart) throw invalid();
    const nameLength = u16(central + 28);
    const size = u32(central + 24);
    const dataStart = local + 30 + nameLength;
    const dataEnd = dataStart + size;
    const centralEnd = central + 46 + nameLength;
    if (centralEnd > end || dataEnd > centralStart) throw invalid();
    const nameData = bytes.subarray(central + 46, centralEnd);
    const name = strFromU8(nameData);
    const expected = strToU8(name);
    if (
      !exportNames.includes(name) ||
      (count === 1 && name !== journalName) ||
      (count === 3 && name === journalName) ||
      names.has(name) ||
      expected.length !== nameLength ||
      !expected.every((byte, offset) => byte === nameData[offset]) ||
      u32(local) !== 0x04034b50 ||
      u16(local + 4) !== 20 ||
      u16(local + 6) !== 0 ||
      u16(local + 8) !== 0 ||
      u32(local + 18) !== size ||
      u32(local + 22) !== size ||
      u16(local + 26) !== nameLength ||
      u16(local + 28) !== 0 ||
      u32(central) !== 0x02014b50 ||
      u16(central + 6) !== 20 ||
      u16(central + 8) !== 0 ||
      u16(central + 10) !== 0 ||
      u32(central + 12) !== u32(local + 10) ||
      u32(central + 16) !== u32(local + 14) ||
      u32(central + 20) !== size ||
      u16(central + 30) !== 0 ||
      u16(central + 32) !== 0 ||
      u16(central + 34) !== 0 ||
      u16(central + 36) !== 0 ||
      u32(central + 38) !== 0 ||
      u32(central + 42) !== local ||
      !nameData.every((byte, offset) => bytes[local + 30 + offset] === byte)
    )
      throw invalid();
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(data) !== u32(local + 14)) throw invalid();
    if (name === journalName) journal = data;
    if (name === 'data.json') dataFile = data;
    names.add(name);
    local = dataEnd;
    central = centralEnd;
  }
  if (local !== centralStart || central !== end || (!journal && count !== 3))
    throw invalid();
  const decode = (data: Uint8Array): string => {
    const text = strFromU8(data);
    const encoded = strToU8(text);
    if (
      encoded.length !== data.length ||
      !encoded.every((byte, index) => byte === data[index])
    )
      throw invalid();
    return text;
  };
  return {
    journal: journal ? decode(journal) : null,
    data: dataFile ? decode(dataFile) : null,
  };
}

export function readStoredJournalZip(bytes: Uint8Array): string {
  const journal = readStoredBackupZip(bytes).journal;
  if (!journal) throw new Error('No journal in archive');
  return journal;
}
