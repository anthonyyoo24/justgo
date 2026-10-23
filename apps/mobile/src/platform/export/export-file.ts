import { File, Directory, Paths } from 'expo-file-system';
import { Platform, Share } from 'react-native';

let exportSequence = 0;

export async function saveExportFile(
  archive: { name: string; bytes: Uint8Array },
  check: () => void,
): Promise<'shared' | 'cancelled' | 'downloaded'> {
  // Android file sharing needs a content-URI adapter in the later Android release.
  if (Platform.OS !== 'ios') throw new Error('File export unavailable');
  const root = new Directory(Paths.cache, 'justgo-exports');
  root.create({ idempotent: true });
  let folder: Directory;
  do {
    folder = new Directory(root, `share-${Date.now()}-${++exportSequence}`);
  } while (folder.exists);
  try {
    // Each share owns its files until the system sheet finishes. A backup and
    // account export may be open together, including with the same filename.
    folder.create();
    const file = new File(folder, archive.name);
    file.create();
    file.write(archive.bytes);
    check();
    const result = await Share.share({ url: file.uri });
    return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } finally {
    if (folder.exists) folder.delete();
  }
}

export async function clearExportFiles(): Promise<void> {
  const folder = new Directory(Paths.cache, 'justgo-exports');
  if (folder.exists) folder.delete();
}
