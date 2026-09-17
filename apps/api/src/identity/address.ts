import { isIP } from 'node:net';
// Vercel overwrites this header at its edge. Never enable this for a directly exposed server.
export function rateAddress(
  ip: string,
  headers: Record<string, string | string[] | undefined>,
  onVercel: boolean,
): string {
  if (!onVercel) return ip;
  const value = headers['x-vercel-forwarded-for'];
  return typeof value === 'string' && isIP(value.trim()) ? value.trim() : ip;
}
