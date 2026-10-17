/** Public destinations cannot carry credentials or use non-HTTPS schemes. */
export function publicHttpsUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? '');
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
