import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, open } from 'node:fs/promises';
import { AwsClient } from 'aws4fetch';
import { endpointFor, prefixFor } from './configuration.mjs';

export function assertRetention(policy, lock, lifecycle) {
  const locks = lock?.rules?.filter((rule) => rule.enabled) ?? [];
  const expirations =
    lifecycle?.rules?.filter(
      (rule) => rule.enabled && rule.deleteObjectsTransition,
    ) ?? [];
  for (const kind of ['database', 'ledger']) {
    const prefix = prefixFor(policy, kind);
    const matches = locks.filter(
      (rule) =>
        prefix.startsWith(rule.prefix ?? '') ||
        (rule.prefix ?? '').startsWith(prefix),
    );
    if (
      !matches.some(
        (rule) =>
          rule.prefix === prefix &&
          rule.condition?.type === 'Age' &&
          rule.condition.maxAgeSeconds === policy.lockDays * 86400,
      ) ||
      matches.some(
        (rule) =>
          rule.condition?.type !== 'Age' ||
          rule.condition.maxAgeSeconds > policy.lockDays * 86400,
      )
    )
      throw new Error('Backup lock differs from approved policy');
    const expiry =
      (kind === 'database' ? policy.backupDays : policy.ledgerDays) * 86400;
    const rules = expirations.filter(
      (rule) =>
        prefix.startsWith(rule.conditions?.prefix ?? '') ||
        (rule.conditions?.prefix ?? '').startsWith(prefix),
    );
    if (
      !rules.some((rule) => rule.conditions?.prefix === prefix) ||
      rules.some(
        (rule) =>
          rule.deleteObjectsTransition.condition?.type !== 'Age' ||
          rule.deleteObjectsTransition.condition.maxAge !== expiry,
      )
    )
      throw new Error('Backup expiry differs from approved policy');
  }
}
export async function inspectRetention(policy, token, send = fetch) {
  if (!token) throw new Error('Read-only R2 inspection credential required');
  const base = `https://api.cloudflare.com/client/v4/accounts/${policy.accountId}/r2/buckets/${policy.bucket}`;
  const results = [];
  for (const path of [
    'lock',
    'lifecycle',
    'domains/managed',
    'domains/custom',
  ]) {
    const response = await send(`${base}/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'cf-r2-jurisdiction': policy.jurisdiction,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('R2 retention inspection failed');
    }
    const payload = await response.json();
    if (payload.success !== true)
      throw new Error('R2 retention inspection failed');
    results.push(payload.result);
  }
  assertRetention(policy, results[0], results[1]);
  if (
    results[2]?.enabled !== false ||
    !Array.isArray(results[3]?.domains) ||
    results[3].domains.some((domain) => domain.enabled !== false)
  )
    throw new Error('Recovery bucket must not be publicly accessible');
}
export async function artifactMetadata(path) {
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(22);
    await file.read(header, 0, 22, 0);
    if (!header.toString().startsWith('age-encryption.org/v1\n'))
      throw new Error('Only age ciphertext may be uploaded');
  } finally {
    await file.close();
  }
  const { size } = await stat(path);
  if (size < 100 || size > 2 * 1024 ** 3)
    throw new Error('Backup size outside supported range');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { bytes: size, sha256: hash.digest('hex') };
}
export async function uploadArtifact(
  policy,
  credentials,
  kind,
  path,
  id,
  metadata,
  send = fetch,
) {
  if (!/^[0-9TZ:.-]+-[a-f0-9-]{36}$/.test(id))
    throw new Error('Invalid artifact identity');
  const key = `${prefixFor(policy, kind)}${id}.age`;
  const url = `${endpointFor(policy)}/${policy.bucket}/${key}`;
  const signer = new AwsClient(credentials);
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(metadata.bytes),
    'x-amz-content-sha256': metadata.sha256,
    'x-amz-meta-sha256': metadata.sha256,
    'If-None-Match': '*',
  };
  // Sign headers independently to keep ciphertext streaming and avoid buffering.
  const signed = await signer.sign(url, { method: 'PUT', headers });
  const ciphertext = createReadStream(path);
  try {
    const response = await send(url, {
      method: 'PUT',
      headers: signed.headers,
      body: ciphertext,
      duplex: 'half',
      redirect: 'error',
      signal: AbortSignal.timeout(300000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Upload failed');
  } catch {
    // One mutation only: an uncertain result is resolved by exact ciphertext metadata.
  } finally {
    ciphertext.destroy();
  }
  const head = await signer.sign(url, { method: 'HEAD' });
  const response = await send(head, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  await response.body?.cancel();
  if (
    !response.ok ||
    response.headers.get('content-length') !== String(metadata.bytes) ||
    response.headers.get('x-amz-meta-sha256') !== metadata.sha256
  )
    throw new Error('Backup upload could not be verified');
  return { key, ...metadata };
}
