export async function saveExportFile(
  archive: { name: string; bytes: Uint8Array },
  check: () => void,
): Promise<'shared' | 'cancelled' | 'downloaded'> {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(archive.bytes)], { type: 'application/zip' }),
  );
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = archive.name;
    document.body.appendChild(link);
    check();
    link.click();
    // Allow the browser to consume the URL before releasing private bytes.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return 'downloaded';
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
