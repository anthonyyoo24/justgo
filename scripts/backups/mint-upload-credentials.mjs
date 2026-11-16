import { createHmac, createHash } from 'node:crypto';
import { appendFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readPolicy, endpointFor, prefixFor } from './configuration.mjs';

/**
 * Signs an uploader limited to PutObject and HeadObject on the two backup
 * prefixes. The parent stays in the mint step; the backup step gets only this.
 */
export function mintUploadCredentials(
  policy,
  accessKeyId,
  parentSecret,
  seconds,
  now = Date.now(),
) {
  if (
    !/^[a-f0-9]{32}$/.test(accessKeyId ?? '') ||
    !/^[a-f0-9]{64}$/.test(parentSecret ?? '') ||
    !Number.isInteger(seconds) ||
    seconds < 3600 ||
    seconds > 7 * 86400
  )
    throw new Error('Invalid offline credential inputs');
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const issued = Math.floor(now / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({
    bucket: policy.bucket,
    sub: policy.accountId,
    iss: accessKeyId,
    aud: new URL(endpointFor(policy)).host,
    iat: issued,
    exp: issued + seconds,
    actions: ['PutObject', 'HeadObject'],
    paths: {
      prefixPaths: [prefixFor(policy, 'database'), prefixFor(policy, 'ledger')],
      objectPaths: [],
    },
  });
  const unsigned = `${header}.${body}`;
  const jwt = `${unsigned}.${createHmac('sha256', parentSecret).update(unsigned).digest('base64url')}`;
  return {
    R2_UPLOAD_ACCESS_KEY_ID: accessKeyId,
    R2_UPLOAD_SECRET_ACCESS_KEY: createHash('sha256').update(jwt).digest('hex'),
    R2_UPLOAD_SESSION_TOKEN: Buffer.from(`jwt/${jwt}`).toString('base64'),
  };
}
export const backupWorkflowRef =
  'anthonyyoo24/justgo/.github/workflows/database-backups.yml@refs/heads/main';
export const workflowUploaderSeconds = 3600;

/**
 * In GitHub Actions only the main database-backups workflow may mint, and only
 * a one-hour uploader. It masks the values, then hands them to the next step
 * through GITHUB_ENV. Elsewhere, CI is refused and an operator gets a new
 * mode-0600 file. Nothing prints a credential.
 */
export async function main(
  env,
  io = { appendFile, writeFile, log: console.log },
) {
  const workflow = env.GITHUB_ACTIONS === 'true';
  if (workflow) {
    if (env.GITHUB_WORKFLOW_REF !== backupWorkflowRef || !env.GITHUB_ENV)
      throw new Error('Only the main database-backups workflow mints in CI');
    if (Number(env.R2_UPLOAD_TTL_SECONDS) !== workflowUploaderSeconds)
      throw new Error('Workflow uploaders last exactly one hour');
  } else if (env.CI)
    throw new Error('Parent R2 credentials are forbidden in CI');
  const policy = readPolicy(env.BACKUP_POLICY_JSON, env.BACKUP_POLICY_SHA256);
  const credentials = mintUploadCredentials(
    policy,
    env.R2_PARENT_ACCESS_KEY_ID,
    env.R2_PARENT_SECRET_ACCESS_KEY,
    Number(env.R2_UPLOAD_TTL_SECONDS),
  );
  if (workflow) {
    for (const value of Object.values(credentials))
      io.log(`::add-mask::${value}`);
    await io.appendFile(
      env.GITHUB_ENV,
      Object.entries(credentials)
        .map(([name, value]) => `${name}=${value}\n`)
        .join(''),
    );
    io.log('One-hour upload credentials passed to the backup step.');
    return;
  }
  if (!env.R2_CREDENTIAL_OUTPUT_FILE)
    throw new Error('Protected output file required');
  await io.writeFile(
    env.R2_CREDENTIAL_OUTPUT_FILE,
    JSON.stringify(credentials),
    { flag: 'wx', mode: 0o600 },
  );
  io.log('Scoped upload credentials written to the protected operator file.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.env).catch(() => {
    console.error('Upload credential preparation failed.');
    process.exitCode = 1;
  });
