import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, expect } from 'vitest';
import { poolOptions } from '../../../src/db/client.js';
import { readConfig } from '../../../src/config.js';
import { localTestDatabaseUrl } from '../../../scripts/local-test-database.js';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeUrl = process.env.DATABASE_URL;
for (const value of [migrationUrl, runtimeUrl]) {
  localTestDatabaseUrl(value);
}
const admin = new Pool(
  poolOptions(
    readConfig({
      ...process.env,
      DATABASE_URL: migrationUrl!,
      DATABASE_POOL_MAX: '1',
    }),
  ),
);
const runtime = new Pool(
  poolOptions(
    readConfig({
      ...process.env,
      DATABASE_URL: runtimeUrl!,
      DATABASE_POOL_MAX: '1',
    }),
  ),
);
const execute = promisify(execFile);
const base = new URL('../../../drizzle/', import.meta.url);
const schema = `phase07_rehearsal_${randomUUID().replaceAll('-', '')}`;
const rewrite = (source: string) =>
  source
    .replaceAll('"justgo"', `"${schema}"`)
    .replace(/\bjustgo\./g, `${schema}.`);
const owner = randomUUID();
const otherOwner = randomUUID();
const sharedAttempt = randomUUID();
const ids = [sharedAttempt, ...Array.from({ length: 6 }, () => randomUUID())];
const canonicalId = randomUUID();
const retiredAttemptId = randomUUID();
const receiptId = randomUUID();
const whitespaceTexts = [
  '',
  ' \t\r\n',
  '\u000b\u000c\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff',
];
const whitespaceIds = whitespaceTexts.map(() => randomUUID());
const journal = JSON.parse(
  await readFile(new URL('meta/_journal.json', base), 'utf8'),
) as { entries: { idx: number; tag: string }[] };
let snapshotFolder: string | undefined;

afterAll(async () => {
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    if (snapshotFolder)
      await rm(snapshotFolder, { recursive: true, force: true });
  } finally {
    await Promise.all([admin.end(), runtime.end()]);
  }
});

async function apply(source: string) {
  const connection = await admin.connect();
  try {
    await connection.query('BEGIN');
    await connection.query(rewrite(source));
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}
async function migration(index: number) {
  const entry = journal.entries.find((item) => item.idx === index)!;
  await apply(await readFile(new URL(`${entry.tag}.sql`, base), 'utf8'));
}
async function owned<T>(
  userId: string,
  action: (client: PoolClient) => Promise<T>,
) {
  const connection = await runtime.connect();
  try {
    await connection.query('BEGIN');
    await connection.query("select set_config('app.user_id',$1,true)", [
      userId,
    ]);
    const result = await action(connection);
    await connection.query('COMMIT');
    return result;
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}
type SnapshotTable = {
  name: string;
  columns: Record<
    string,
    {
      name: string;
      type: string;
      notNull: boolean;
      primaryKey: boolean;
      default?: unknown;
    }
  >;
  indexes: Record<
    string,
    {
      columns: { expression: string; asc: boolean }[];
      isUnique: boolean;
      where?: string;
    }
  >;
  foreignKeys: Record<
    string,
    { tableTo: string; columnsFrom: string[]; columnsTo: string[] }
  >;
  compositePrimaryKeys: Record<string, { columns: string[] }>;
  checkConstraints: Record<string, unknown>;
  policies: Record<
    string,
    {
      as?: string;
      for?: string;
      to?: string[];
      using?: string;
      withCheck?: string;
    }
  >;
  isRLSEnabled: boolean;
};
async function compareMetadata(index: number) {
  const snapshot = JSON.parse(
    await readFile(
      new URL(`meta/${String(index).padStart(4, '0')}_snapshot.json`, base),
      'utf8',
    ),
  ) as { tables: Record<string, SnapshotTable> };
  const tables = await admin.query<{
    name: string;
    enabled: boolean;
    forced: boolean;
  }>(
    `
    SELECT c.relname AS name,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname`,
    [schema],
  );
  expect(tables.rows.map((table) => table.name)).toEqual(
    Object.values(snapshot.tables)
      .map((table) => table.name)
      .sort(),
  );
  for (const table of Object.values(snapshot.tables)) {
    const actualTable = tables.rows.find((value) => value.name === table.name)!;
    expect(actualTable.enabled).toBe(table.isRLSEnabled);
    expect(actualTable.forced).toBe(true);
    const columns = await admin.query<{
      name: string;
      type: string;
      not_null: boolean;
    }>(
      `
      SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null
      FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attname`,
      [`${schema}.${table.name}`],
    );
    expect(columns.rows).toEqual(
      Object.values(table.columns)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((column) => ({
          name: column.name,
          type: column.type,
          not_null: column.notNull,
        })),
    );
    const constraints = await admin.query<{ name: string; kind: string }>(
      'SELECT conname AS name,contype AS kind FROM pg_constraint WHERE conrelid=$1::regclass',
      [`${schema}.${table.name}`],
    );
    const expectedNames = [
      ...Object.keys(table.checkConstraints),
      ...Object.keys(table.foreignKeys),
      ...Object.keys(table.compositePrimaryKeys),
    ];
    const expectedPrimary = Object.values(table.columns).some(
      (column) => column.primaryKey,
    )
      ? [`${table.name}_pkey`]
      : [];
    expect(constraints.rows.map((value) => value.name).sort()).toEqual(
      [...expectedNames, ...expectedPrimary].sort(),
    );
    const policies = await admin.query<{
      name: string;
      command: string;
      permissive: string;
      roles: string[];
      qual: string | null;
      check: string | null;
    }>(
      `
      SELECT policyname AS name,cmd AS command,permissive,roles::text[] AS roles,qual,with_check AS check FROM pg_policies WHERE schemaname=$1 AND tablename=$2 ORDER BY policyname`,
      [schema, table.name],
    );
    expect(policies.rows.map((value) => value.name)).toEqual(
      Object.keys(table.policies).sort(),
    );
    for (const policy of policies.rows) {
      const expected = table.policies[policy.name]!;
      expect(policy.command.toLowerCase()).toBe(
        (expected.for ?? 'all').toLowerCase(),
      );
      expect(policy.roles).toEqual(expected.to);
      expect(policy.permissive.toLowerCase()).toBe(
        (expected.as ?? 'permissive').toLowerCase(),
      );
      expect(Boolean(policy.qual)).toBe(Boolean(expected.using));
      expect(Boolean(policy.check)).toBe(Boolean(expected.withCheck));
    }
    const indexes = await admin.query<{ name: string; definition: string }>(
      'SELECT indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname=$1 AND tablename=$2',
      [schema, table.name],
    );
    expect(indexes.rows.map((value) => value.name).sort()).toEqual(
      [
        ...Object.keys(table.indexes),
        ...Object.keys(table.compositePrimaryKeys),
        ...expectedPrimary,
      ].sort(),
    );
    for (const [name, definition] of Object.entries(table.indexes)) {
      const actual = indexes.rows.find(
        (value) => value.name === name,
      )!.definition;
      expect(actual.includes('UNIQUE INDEX')).toBe(definition.isUnique);
      const normalize = (value: string) =>
        value
          .replaceAll('"', '')
          .replaceAll('justgo.', '')
          .replaceAll(`${schema}.`, '')
          .replaceAll(`${table.name}.`, '')
          .toLowerCase();
      expect(normalize(actual)).toContain(
        normalize(
          `(${definition.columns.map((column) => column.expression).join(', ')})`,
        ),
      );
      expect(actual.includes(' WHERE ')).toBe(Boolean(definition.where));
    }
  }
}
async function seed() {
  await admin.query(`INSERT INTO ${schema}.users (id) VALUES ($1),($2)`, [
    owner,
    otherOwner,
  ]);
  for (const [position, id] of ids.entries()) {
    const status =
      position === 5 ? 'active' : position === 6 ? 'given_up' : 'completed';
    await admin.query(
      `INSERT INTO ${schema}.attempts
      (user_id,id,card_id,venue_id,challenge_id,revision_id,level_id,queue_version,status,started_at,deadline_at,ended_at,completion_date,time_zone)
      VALUES ($1,$2,'ST-01','streets','st-01','st-01-v1','level-1',0,$3,'2026-09-30T23:59:00Z','2026-10-01T00:04:00Z',$4,$5,$6)`,
      [
        owner,
        id,
        status,
        status === 'active' ? null : '2026-10-01T00:06:00Z',
        status === 'completed' ? '2026-10-01' : null,
        status === 'active' ? null : 'Pacific/Auckland',
      ],
    );
  }
  // Same attempt UUID belongs to a different owner with different private content.
  await admin.query(
    `INSERT INTO ${schema}.attempts (user_id,id,card_id,venue_id,challenge_id,revision_id,level_id,queue_version,status,started_at,deadline_at,ended_at,completion_date,time_zone)
    SELECT $1,id,card_id,venue_id,challenge_id,revision_id,level_id,queue_version,status,started_at,deadline_at,ended_at,'2026-09-30','America/Toronto'
    FROM ${schema}.attempts WHERE user_id=$2 AND id=$3`,
    [otherOwner, owner, sharedAttempt],
  );
  const reflections = [
    {
      id: ids[0],
      status: 'submitted',
      feeling: 'a_little_better',
      text: null,
      revision: 3,
    },
    {
      id: ids[1],
      status: 'submitted',
      feeling: null,
      text: 'Synthetic text-only fixture',
      revision: 6,
    },
    {
      id: ids[2],
      status: 'submitted',
      feeling: 'about_the_same',
      text: ' \t\u00a0Synthetic combined fixture\n\ufeff ',
      revision: 9,
    },
    {
      id: ids[3],
      status: 'draft',
      feeling: null,
      text: 'Synthetic unsubmitted draft',
      revision: 2,
    },
    { id: ids[4], status: 'skipped', feeling: null, text: null, revision: 4 },
  ];
  for (const reflection of reflections)
    await admin.query(
      `INSERT INTO ${schema}.reflections (user_id,attempt_id,status,feeling,reflection_text,input_method,revision) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        owner,
        reflection.id,
        reflection.status,
        reflection.feeling,
        reflection.text,
        reflection.text ? 'typed' : null,
        reflection.revision,
      ],
    );
  await admin.query(
    `INSERT INTO ${schema}.reflections (user_id,attempt_id,status,reflection_text,input_method,revision) VALUES ($1,$2,'submitted','Other owner fixture','typed',7)`,
    [otherOwner, sharedAttempt],
  );
  await admin.query(
    `INSERT INTO ${schema}.reflection_actions (user_id,id,attempt_id,action,input_digest,response) VALUES ($1,$2,$3,'final',repeat('a',64),'{}')`,
    [owner, randomUUID(), sharedAttempt],
  );
  // A placement can have been repointed after an older attempt was saved.
  // Its now-unplaced challenge must remain readable and become inactive.
  await admin.query(`INSERT INTO ${schema}.challenges VALUES ('migration-retired');
    INSERT INTO ${schema}.challenge_revisions VALUES ('migration-retired-v1','migration-retired','level-1','Synthetic retired challenge',NULL,300);
    INSERT INTO ${schema}.venue_cards VALUES ('MIGRATION-REPOINTED','streets','migration-retired-v1',99)`);
  await admin.query(
    `INSERT INTO ${schema}.attempts
    (user_id,id,card_id,venue_id,challenge_id,revision_id,level_id,queue_version,status,started_at,deadline_at,ended_at,completion_date,time_zone)
    VALUES ($1,$2,'MIGRATION-REPOINTED','streets','migration-retired','migration-retired-v1','level-1',0,'completed',
      '2026-09-01T12:00:00Z','2026-09-01T12:05:00Z','2026-09-01T12:06:00Z','2026-09-01','America/Toronto')`,
    [owner, retiredAttemptId],
  );
  await admin.query(
    `UPDATE ${schema}.venue_cards SET revision_id='st-01-v1' WHERE id='MIGRATION-REPOINTED'`,
  );
  for (const [position, text] of whitespaceTexts.entries()) {
    const id = whitespaceIds[position]!;
    await admin.query(
      `INSERT INTO ${schema}.attempts (user_id,id,card_id,venue_id,challenge_id,revision_id,level_id,queue_version,status,started_at,deadline_at,ended_at,completion_date,time_zone)
      SELECT user_id,$1,card_id,venue_id,challenge_id,revision_id,level_id,queue_version,status,started_at,deadline_at,ended_at,completion_date,time_zone
      FROM ${schema}.attempts WHERE user_id=$2 AND id=$3`,
      [id, owner, sharedAttempt],
    );
    await admin.query(
      `INSERT INTO ${schema}.reflections (user_id,attempt_id,status,feeling,reflection_text,input_method,revision)
      VALUES ($1,$2,'submitted','a_little_better',$3,'typed',$4)`,
      [owner, id, text, 11 + position],
    );
    await admin.query(
      `INSERT INTO ${schema}.reflection_actions (user_id,id,attempt_id,action,input_digest,response)
      VALUES ($1,$2,$3,'final',repeat('d',64),$4::jsonb)`,
      [
        owner,
        randomUUID(),
        id,
        JSON.stringify({ text, revision: 11 + position, inputMethod: 'typed' }),
      ],
    );
  }
}
async function legacyRows() {
  return (
    await admin.query(
      `SELECT a.user_id,a.id,a.challenge_id,a.level_id,a.started_at,a.completion_date AS activity_date,a.time_zone AS display_zone,
    CASE WHEN r.status='submitted' THEN r.feeling END AS feeling,
    CASE WHEN r.status='submitted' THEN r.reflection_text END AS text,
    CASE WHEN r.status='submitted' THEN r.revision ELSE 0 END AS revision
    FROM ${schema}.attempts a LEFT JOIN ${schema}.reflections r ON (r.user_id,r.attempt_id)=(a.user_id,a.id)
    WHERE a.status='completed' AND a.id<>$1 ORDER BY a.user_id,a.id`,
      [canonicalId],
    )
  ).rows;
}
async function canonicalRows() {
  return (
    await admin.query(
      `SELECT user_id,id,challenge_id,level_id,started_at,activity_date,coalesce(start_time_zone,legacy_display_time_zone) AS display_zone,
    reflection_feeling AS feeling,reflection_text AS text,reflection_revision AS revision
    FROM ${schema}.attempts WHERE id<>$1 AND activity_date IS NOT NULL ORDER BY user_id,id`,
      [canonicalId],
    )
  ).rows;
}
async function normalizationRows() {
  return {
    legacy: (
      await admin.query(
        `SELECT * FROM ${schema}.reflections ORDER BY user_id,attempt_id`,
      )
    ).rows,
    canonical: (
      await admin.query(`SELECT * FROM ${schema}.attempts ORDER BY user_id,id`)
    ).rows,
  };
}
async function receipts() {
  return {
    legacy: (
      await admin.query(
        `SELECT * FROM ${schema}.reflection_actions ORDER BY user_id,id`,
      )
    ).rows,
    canonical: (
      await admin.query(
        `SELECT * FROM ${schema}.attempt_patch_receipts ORDER BY user_id,id`,
      )
    ).rows,
  };
}
function pgTool(name: string) {
  const configured = process.env.JUSTGO_PG_BIN;
  if (configured) return join(configured, name);
  const homebrew = join('/opt/homebrew/opt/postgresql@17/bin', name);
  return existsSync(homebrew) ? homebrew : name;
}
function pgEnvironment() {
  const url = new URL(migrationUrl!);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: 'justgo_test',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'disable',
  };
}
export const rehearsal = {
  get snapshotFolder() {
    return snapshotFolder;
  },
  set snapshotFolder(value: typeof snapshotFolder) {
    snapshotFolder = value;
  },
};
export {
  migrationUrl,
  runtimeUrl,
  admin,
  runtime,
  execute,
  base,
  schema,
  rewrite,
  owner,
  otherOwner,
  sharedAttempt,
  ids,
  canonicalId,
  retiredAttemptId,
  receiptId,
  whitespaceTexts,
  whitespaceIds,
  journal,
  apply,
  migration,
  owned,
  compareMetadata,
  seed,
  legacyRows,
  canonicalRows,
  normalizationRows,
  receipts,
  pgTool,
  pgEnvironment,
};
