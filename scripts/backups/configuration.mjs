import { createHash } from 'node:crypto';
import { z } from 'zod';

const days = z.number().int().min(1).max(30);
const projectReference = /^[a-z0-9]{20}$/;
const sessionPoolerHost = /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/;
function validSourceProject(policy) {
  if (sessionPoolerHost.test(policy.sourceHost))
    return projectReference.test(policy.sourceProjectRef ?? '');
  return (
    policy.sourceProjectRef === undefined ||
    (projectReference.test(policy.sourceProjectRef) &&
      policy.sourceHost === `db.${policy.sourceProjectRef}.supabase.co`)
  );
}
export const policySchema = z
  .strictObject({
    version: z.literal(1),
    approvalReference: z.string().min(8).max(200),
    accountId: z.string().regex(/^[a-f0-9]{32}$/),
    bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
    environment: z.enum(['staging', 'production']),
    jurisdiction: z.enum(['default', 'eu', 'us', 'fedramp']),
    backupDays: days,
    ledgerDays: days,
    lockDays: days,
    ageRecipient: z.string().regex(/^age1[a-z0-9]{58}$/),
    sourceHost: z.string().regex(/^[a-z0-9.-]+$/),
    sourceDatabase: z.string().regex(/^[a-z0-9_]+$/),
    sourceProjectRef: z.string().regex(projectReference).optional(),
    allowCronJobRunDetailsDelete: z.boolean().optional(),
  })
  .refine(
    (p) =>
      p.lockDays <= Math.min(p.backupDays, p.ledgerDays) &&
      p.ledgerDays >= p.backupDays,
    'Ledger retention must cover backups; locks must not outlast expiry',
  )
  .refine(
    validSourceProject,
    'Supabase session-pooler sources require an approved project reference',
  )
  .refine(
    (p) =>
      p.allowCronJobRunDetailsDelete !== true ||
      (p.environment === 'staging' &&
        p.sourceProjectRef === 'kmcpcauaxlgpevkkenwd' &&
        p.sourceDatabase === 'postgres'),
    'Cron history DELETE exception is limited to the approved staging source',
  );

/**
 * Decide whether the accepted beta cron-history DELETE residual is enabled.
 * Revalidate the complete source-bound policy so a bare flag, production source or
 * different project cannot activate the exception. An absent policy keeps it off;
 * a supplied invalid policy throws instead of silently changing privilege checks.
 */
export function cronJobRunDetailsDeleteAllowed(policy) {
  return (
    policy !== undefined &&
    policySchema.parse(policy).allowCronJobRunDetailsDelete === true
  );
}

export function readPolicy(raw, approvedDigest) {
  if (
    !raw ||
    !/^[a-f0-9]{64}$/.test(approvedDigest ?? '') ||
    createHash('sha256').update(raw).digest('hex') !== approvedDigest
  )
    throw new Error('Backup policy is not approved');
  return policySchema.parse(JSON.parse(raw));
}
export function prefixFor(policy, kind) {
  if (!['database', 'ledger'].includes(kind))
    throw new Error('Invalid backup kind');
  return `${policy.environment}/${kind}/`;
}
export function endpointFor(policy) {
  return `https://${policy.accountId}${policy.jurisdiction === 'default' ? '' : `.${policy.jurisdiction}`}.r2.cloudflarestorage.com`;
}
export function databaseConnection(value, policy) {
  const url = new URL(value);
  const user = sessionPoolerHost.test(policy.sourceHost)
    ? `justgo_backup.${policy.sourceProjectRef}`
    : 'justgo_backup';
  if (
    !validSourceProject(policy) ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== policy.sourceHost ||
    url.pathname !== `/${policy.sourceDatabase}` ||
    decodeURIComponent(url.username) !== user ||
    !url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== '5432')
  )
    throw new Error('Backup database target mismatch');
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname))
    throw new Error('Hosted backup needs a verified TLS origin');
  return {
    host: url.hostname,
    port: 5432,
    database: policy.sourceDatabase,
    // Supavisor routes by project-qualified login; current_user must still be
    // justgo_backup, as independently verified by verifyBackupRole after connect.
    user,
    password: decodeURIComponent(url.password),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    statement_timeout: 300000,
    options: '-c default_transaction_read_only=on',
  };
}
export function databaseSource(policy) {
  if (!validSourceProject(policy))
    throw new Error('Backup database project mismatch');
  // A shared pooler hostname/database identifies many projects. Bind receipts
  // and restore evidence to the approved tenant as well as the transport host.
  const project = sessionPoolerHost.test(policy.sourceHost)
    ? `${policy.sourceProjectRef}@`
    : '';
  return `${project}${policy.sourceHost}/${policy.sourceDatabase}`;
}
export function pgEnvironment(config, rootCert) {
  return {
    PATH: process.env.PATH,
    PGHOST: config.host,
    PGPORT: String(config.port),
    PGDATABASE: config.database,
    PGUSER: config.user,
    PGPASSWORD: config.password,
    PGSSLMODE:
      config.ssl === false &&
      ['localhost', '127.0.0.1', '::1'].includes(config.host)
        ? 'disable'
        : 'verify-full',
    PGSSLROOTCERT: rootCert,
    PGCONNECT_TIMEOUT: '10',
    PGOPTIONS:
      '-c default_transaction_read_only=on -c statement_timeout=300000',
  };
}

/** The signed token is verified by R2. Locally reject broader uploader authority. */
export function uploadCredentials(env, policy, now = Date.now()) {
  try {
    const token = Buffer.from(env.R2_UPLOAD_SESSION_TOKEN, 'base64').toString(
      'utf8',
    );
    if (!token.startsWith('jwt/')) throw new Error();
    const jwt = token.slice(4);
    const [header, body, signature] = jwt.split('.');
    const h = JSON.parse(Buffer.from(header, 'base64url').toString());
    const c = JSON.parse(Buffer.from(body, 'base64url').toString());
    const paths = [prefixFor(policy, 'database'), prefixFor(policy, 'ledger')];
    if (
      h.alg !== 'HS256' ||
      !signature ||
      c.sub !== policy.accountId ||
      c.iss !== env.R2_UPLOAD_ACCESS_KEY_ID ||
      c.aud !== new URL(endpointFor(policy)).host ||
      c.bucket !== policy.bucket ||
      c.scope !== undefined ||
      !Number.isInteger(c.exp) ||
      c.exp * 1000 < now + 20 * 60000 ||
      !Number.isInteger(c.iat) ||
      c.iat * 1000 > now ||
      !Array.isArray(c.actions) ||
      c.actions.length !== 2 ||
      !c.actions.includes('PutObject') ||
      !c.actions.includes('HeadObject') ||
      c.paths?.objectPaths?.length ||
      c.paths?.prefixPaths?.length !== 2 ||
      !paths.every((path) => c.paths.prefixPaths.includes(path)) ||
      createHash('sha256').update(jwt).digest('hex') !==
        env.R2_UPLOAD_SECRET_ACCESS_KEY
    )
      throw new Error();
    return {
      accessKeyId: env.R2_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.R2_UPLOAD_SECRET_ACCESS_KEY,
      sessionToken: env.R2_UPLOAD_SESSION_TOKEN,
      service: 's3',
      region: 'auto',
      retries: 0,
    };
  } catch {
    throw new Error(
      'Uploader requires unexpired, bucket-scoped PutObject/HeadObject credentials',
    );
  }
}
