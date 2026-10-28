export function clearBackupFiles(): void {
  // Browser selection is read directly from the File; no app-controlled copy.
}

export function pickBackupFile(
  maxBytes: number,
  check: () => void,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  check();
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip,application/x-zip-compressed';
    input.style.display = 'none';
    let settled = false;
    const cleanup = () => {
      input.remove();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    };
    const choose = async () => {
      const file = input.files?.[0];
      if (!file) return cancel();
      try {
        check();
        if (file.size > maxBytes)
          throw new Error('The backup exceeds the supported size limit.');
        const bytes = new Uint8Array(
          await file.slice(0, maxBytes + 1).arrayBuffer(),
        );
        if (settled || signal.aborted) return;
        check();
        if (bytes.length > maxBytes)
          throw new Error('The backup exceeds the supported size limit.');
        settled = true;
        cleanup();
        resolve(bytes);
      } catch (error) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    };
    input.addEventListener('change', () => {
      // choose owns read failures and settles this selection promise.
      void choose();
    });
    input.addEventListener('cancel', cancel);
    signal.addEventListener('abort', cancel, { once: true });
    try {
      document.body.appendChild(input);
      input.click();
    } catch (error) {
      settled = true;
      cleanup();
      reject(error);
    }
  });
}
