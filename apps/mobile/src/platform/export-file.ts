import { File, Directory, Paths } from 'expo-file-system';
import { Platform, Share } from 'react-native';

export async function saveExportFile(
  archive: { name: string; bytes: Uint8Array },
  check: () => void,
): Promise<'shared' | 'cancelled' | 'downloaded'> {
  // Android file sharing needs a content-URI adapter in the later Android release.
  if (Platform.OS !== 'ios') throw new Error('File export unavailable');
  const folder = new Directory(Paths.cache, 'justgo-exports');
  // Remove any private export left after an interrupted app session.
  if (folder.exists) folder.delete();
  folder.create();
  try {
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
