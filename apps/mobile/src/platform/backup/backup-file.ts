import {
  getDocumentAsync,
  type DocumentPickerResult,
} from 'expo-document-picker';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

export function clearBackupFiles(): void {
  // This picker is used only for journal restore. It creates private cache
  // copies, never files in the user's chosen Files/iCloud Drive location.
  const directory = new Directory(Paths.cache, 'DocumentPicker');
  if (directory.exists) directory.delete();
}

export async function pickBackupFile(
  maxBytes: number,
  check: () => void,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  check();
  if (signal.aborted) return null;
  clearBackupFiles();
  let result: DocumentPickerResult;
  try {
    result = await getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed'],
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch (error) {
    // A provider can fail after the SDK has started copying private bytes.
    clearBackupFiles();
    throw error;
  }
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset || result.assets.length !== 1) {
    clearBackupFiles();
    throw new Error('Choose one backup file.');
  }
  const file = new File(asset.uri);
  const ownedDirectory = new Directory(Paths.cache, 'DocumentPicker');
  // Refuse unexpected provider paths; only the SDK-created cache copy is ours
  // to remove. The SDK uses random names beneath this exact cache directory.
  if (file.parentDirectory.uri !== ownedDirectory.uri)
    throw new Error('The backup could not be copied safely.');
  try {
    check();
    if (signal.aborted) return null;
    if (!file.exists || file.size <= 0)
      throw new Error('The backup could not be read.');
    if (
      file.size > maxBytes ||
      (asset.size !== undefined && asset.size > maxBytes)
    )
      throw new Error('The backup exceeds the supported size limit.');
    const handle = file.open(FileMode.ReadOnly);
    let bytes: Uint8Array;
    try {
      // Bound the read itself, including if the cache file changes after stat.
      bytes = handle.readBytes(maxBytes + 1);
    } finally {
      handle.close();
    }
    if (bytes.length > maxBytes)
      throw new Error('The backup exceeds the supported size limit.');
    check();
    return signal.aborted ? null : bytes;
  } finally {
    if (file.exists) file.delete();
  }
}
