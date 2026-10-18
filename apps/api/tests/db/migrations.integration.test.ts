import {
  rehearsal,
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
  whitespaceIds,
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
} from './fixtures/migration-rehearsal.js';
import { randomUUID } from 'node:crypto';

import { mkdtemp, readFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Phase 07 expansion, final contraction and disposable restoration', () => {
  it('preserves owned history through registered cutover, clean migrations, restoration and forward repair', async () => {
    expect(
      (await admin.query('SELECT current_user')).rows[0].current_user,
    ).toBe('justgo_migrator');
    expect(
      (await runtime.query('SELECT current_user')).rows[0].current_user,
    ).toBe('justgo_runtime');
    await admin.query(
      `CREATE SCHEMA ${schema} AUTHORIZATION justgo_migrator; REVOKE ALL ON SCHEMA ${schema} FROM public; GRANT USAGE ON SCHEMA ${schema} TO justgo_runtime`,
    );
    for (let index = 0; index <= 9; index++) {
      await migration(index);
      if (index >= 7) await compareMetadata(index);
    }
    await seed();
    const before = await legacyRows();
    const normalizedBefore = before.map((row) => ({
      ...row,
      text:
        typeof row.text === 'string' && row.text.trim() === ''
          ? null
          : row.text,
    }));
    rehearsal.snapshotFolder = await mkdtemp(
      join(tmpdir(), 'justgo-migration-fixture-'),
    );
    const snapshot = join(rehearsal.snapshotFolder, 'pre-phase07.sql');
    await execute(
      pgTool('pg_dump'),
      [
        '--schema',
        schema,
        '--enable-row-security',
        '--inserts',
        '--no-owner',
        '--file',
        snapshot,
      ],
      { env: pgEnvironment() },
    );
    expect((await readFile(snapshot, 'utf8')).length).toBeGreaterThan(1000);
    // A conflicting current placement must stop the whole expansion; copying
    // the lexically first revision would silently choose the wrong wording.
    const conflict =
      await admin.query(`INSERT INTO ${schema}.venue_cards (id,venue_id,revision_id,position)
      SELECT 'MIGRATION-AMBIGUOUS','bookstore',older.id,99
      FROM ${schema}.venue_cards current_card
      JOIN ${schema}.challenge_revisions current_revision ON current_revision.id=current_card.revision_id
      JOIN ${schema}.challenge_revisions older ON older.challenge_id=current_revision.challenge_id AND older.id<>current_revision.id
      WHERE current_card.id='BC-10' LIMIT 1`);
    expect(conflict.rowCount).toBe(1);
    await expect(migration(10)).rejects.toThrow(
      'Canonical challenge selection requires review',
    );
    expect(
      (
        await admin.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='attempts' AND column_name='activity_date'",
          [schema],
        )
      ).rows,
    ).toHaveLength(0);
    await admin.query(
      `DELETE FROM ${schema}.venue_cards WHERE id='MIGRATION-AMBIGUOUS'`,
    );
    await migration(10);
    await compareMetadata(10);
    await migration(11);
    await compareMetadata(11);
    expect(await canonicalRows()).toEqual(before);
    expect(
      (
        await admin.query(
          `SELECT c.active,c.text,a.challenge_id FROM ${schema}.attempts a
      JOIN ${schema}.challenges c ON c.id=a.challenge_id WHERE a.id=$1`,
          [retiredAttemptId],
        )
      ).rows,
    ).toEqual([
      {
        active: false,
        text: 'Synthetic retired challenge',
        challenge_id: 'migration-retired',
      },
    ]);
    expect(
      (
        await admin.query(
          `SELECT status,count(*)::int AS count FROM ${schema}.attempts GROUP BY status ORDER BY status`,
        )
      ).rows,
    ).toEqual([
      { status: 'active', count: 1 },
      { status: 'completed', count: 10 },
      { status: 'given_up', count: 1 },
    ]);
    expect(
      (
        await admin.query(
          `SELECT count(*)::int AS count FROM ${schema}.attempts WHERE start_time_zone IS NOT NULL`,
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await admin.query(
          `SELECT c.text=r.text AS chosen FROM ${schema}.challenges c JOIN ${schema}.venue_cards vc ON vc.challenge_id=c.id JOIN ${schema}.challenge_revisions r ON r.id=vc.revision_id WHERE vc.id='BC-10'`,
        )
      ).rows[0].chosen,
    ).toBe(true);
    await owned(owner, (client) =>
      client.query(
        `INSERT INTO ${schema}.attempts (user_id,id,venue_id,challenge_id,level_id,status,started_at,activity_date,start_time_zone)
      VALUES ($1,$2,'streets','st-01','level-1','completed','2026-10-04T12:00:00Z','2026-10-04','America/Toronto')`,
        [owner, canonicalId],
      ),
    );
    await expect(
      owned(owner, (client) =>
        client.query(
          `INSERT INTO ${schema}.attempts (user_id,id,venue_id,challenge_id,level_id,status,started_at,activity_date)
      VALUES ($1,$2,'streets','st-01','level-1','completed','2026-10-04T12:00:00Z','2026-10-04')`,
          [owner, randomUUID()],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      owned(owner, (client) =>
        client.query(
          `UPDATE ${schema}.attempts SET ended_at=started_at WHERE id=$1`,
          [canonicalId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await owned(owner, (client) =>
      client.query(
        `INSERT INTO ${schema}.attempt_patch_receipts VALUES ($1,$2,$3,repeat('b',64),1)`,
        [owner, receiptId, canonicalId],
      ),
    );
    expect(
      (await runtime.query(`SELECT * FROM ${schema}.attempt_patch_receipts`))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await owned(otherOwner, (client) =>
          client.query(`SELECT * FROM ${schema}.attempt_patch_receipts`),
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await owned(owner, (client) =>
          client.query(`SELECT id FROM ${schema}.attempt_patch_receipts`),
        )
      ).rows,
    ).toEqual([{ id: receiptId }]);
    await expect(
      owned(otherOwner, (client) =>
        client.query(
          `INSERT INTO ${schema}.attempt_patch_receipts VALUES ($1,$2,$3,repeat('c',64),2)`,
          [owner, randomUUID(), canonicalId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      owned(owner, (client) =>
        client.query(`UPDATE ${schema}.attempt_patch_receipts SET user_id=$1`, [
          otherOwner,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await admin.query(
      `UPDATE ${schema}.attempts SET reflection_feeling='about_the_same',reflection_text=$1,reflection_revision=1 WHERE id=$2`,
      ['\t\u00a0\ufeff', canonicalId],
    );
    const acceptedReceipts = await receipts();
    // These rows satisfy the old constraints, but normalizing either would
    // erase its only submitted content. Fail before updating any valid row.
    await admin.query(
      `UPDATE ${schema}.reflections SET feeling=NULL WHERE user_id=$1 AND attempt_id=$2`,
      [owner, whitespaceIds[0]],
    );
    const invalidLegacy = await normalizationRows();
    await expect(migration(12)).rejects.toThrow(
      'Blank-only submitted reflection requires review',
    );
    expect(await normalizationRows()).toEqual(invalidLegacy);
    await admin.query(
      `UPDATE ${schema}.reflections SET feeling='a_little_better' WHERE user_id=$1 AND attempt_id=$2`,
      [owner, whitespaceIds[0]],
    );
    await admin.query(
      `UPDATE ${schema}.attempts SET reflection_feeling=NULL WHERE id=$1`,
      [canonicalId],
    );
    const invalidCanonical = await normalizationRows();
    await expect(migration(12)).rejects.toThrow(
      'Blank-only submitted reflection requires review',
    );
    expect(await normalizationRows()).toEqual(invalidCanonical);
    await admin.query(
      `UPDATE ${schema}.attempts SET reflection_feeling='about_the_same' WHERE id=$1`,
      [canonicalId],
    );
    const beforeNormalization = await normalizationRows();
    await migration(12);
    await compareMetadata(12);
    expect(await canonicalRows()).toEqual(normalizedBefore);
    expect(await legacyRows()).toEqual(normalizedBefore);
    const afterNormalization = await normalizationRows();
    expect(afterNormalization.legacy).toEqual(
      beforeNormalization.legacy.map((row) =>
        row.status === 'submitted' &&
        typeof row.reflection_text === 'string' &&
        row.reflection_text.trim() === ''
          ? { ...row, reflection_text: null, input_method: null }
          : row,
      ),
    );
    expect(afterNormalization.canonical).toEqual(
      beforeNormalization.canonical.map((row) =>
        typeof row.reflection_text === 'string' &&
        row.reflection_text.trim() === ''
          ? { ...row, reflection_text: null }
          : row,
      ),
    );
    expect(await receipts()).toEqual(acceptedReceipts);
    // Stop legacy writers with the exact registered lock before comparing the
    // two projections. A competing old writer cannot pass the table fence.
    const contraction = await readFile(
      new URL('0013_attempt_resources_contract.sql', base),
      'utf8',
    );
    const lock = await admin.connect();
    try {
      await lock.query('BEGIN');
      await lock.query(
        rewrite(
          contraction.slice(0, contraction.indexOf('-- Repeat the 0012')),
        ),
      );
      await expect(
        owned(owner, async (client) => {
          await client.query("SET LOCAL lock_timeout='100ms'");
          return client.query(
            `UPDATE ${schema}.reflections SET revision=revision+1 WHERE user_id=$1 AND attempt_id=$2`,
            [owner, sharedAttempt],
          );
        }),
      ).rejects.toMatchObject({ code: '55P03' });
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
    }
    // A same-revision disagreement is ambiguous: fail atomically, retaining all
    // legacy state. Correct the known synthetic mismatch forward, then retry.
    await admin.query(
      `UPDATE ${schema}.attempts SET reflection_text='Synthetic mismatched inline value' WHERE user_id=$1 AND id=$2`,
      [owner, ids[1]],
    );
    const mismatch = await normalizationRows();
    await expect(migration(13)).rejects.toThrow(
      'Submitted reflection comparison failed',
    );
    expect(await normalizationRows()).toEqual(mismatch);
    await admin.query(
      `UPDATE ${schema}.attempts a SET reflection_text=r.reflection_text FROM ${schema}.reflections r WHERE (a.user_id,a.id)=(r.user_id,r.attempt_id) AND a.user_id=$1 AND a.id=$2`,
      [owner, ids[1]],
    );
    await admin.query(
      `UPDATE ${schema}.attempts SET activity_date='2026-09-29' WHERE user_id=$1 AND id=$2`,
      [owner, sharedAttempt],
    );
    const wrongDate = await normalizationRows();
    await expect(migration(13)).rejects.toThrow(
      'Historical date/zone comparison failed',
    );
    expect(await normalizationRows()).toEqual(wrongDate);
    await admin.query(
      `UPDATE ${schema}.attempts SET activity_date=completion_date WHERE user_id=$1 AND id=$2`,
      [owner, sharedAttempt],
    );
    // Late old writes and newer canonical edits coexist. Reconcile only a
    // strictly later legacy submission; never overwrite a newer canonical edit.
    await admin.query(
      `UPDATE ${schema}.reflections SET reflection_text=$1,input_method='typed' WHERE user_id=$2 AND attempt_id=$3`,
      ['\u00a0\t', owner, whitespaceIds[0]],
    );
    await admin.query(
      `UPDATE ${schema}.reflections SET reflection_text='Synthetic late legacy submission',revision=revision+1 WHERE user_id=$1 AND attempt_id=$2`,
      [owner, ids[1]],
    );
    await admin.query(
      `UPDATE ${schema}.attempts SET reflection_text='Synthetic newer canonical edit',reflection_revision=reflection_revision+1 WHERE user_id=$1 AND id=$2`,
      [owner, ids[2]],
    );
    const finalExpected = (await legacyRows()).map((row) => ({
      ...row,
      text:
        row.id === ids[2]
          ? 'Synthetic newer canonical edit'
          : typeof row.text === 'string' && row.text.trim() === ''
            ? null
            : row.text,
      revision: row.id === ids[2] ? Number(row.revision) + 1 : row.revision,
    }));
    const finalReceipt = (await receipts()).canonical;
    const canonicalAccepted = (
      await admin.query(
        `SELECT user_id,id,challenge_id,venue_id,level_id,started_at,activity_date,start_time_zone,legacy_display_time_zone,reflection_feeling,reflection_text,reflection_revision FROM ${schema}.attempts WHERE id=$1`,
        [canonicalId],
      )
    ).rows;

    const beforeContractSnapshot = join(
      rehearsal.snapshotFolder,
      'pre-contraction.sql',
    );
    await execute(
      pgTool('pg_dump'),
      [
        '--schema',
        schema,
        '--enable-row-security',
        '--inserts',
        '--no-owner',
        '--file',
        beforeContractSnapshot,
      ],
      { env: pgEnvironment() },
    );
    await migration(13);
    await compareMetadata(13);
    expect(await canonicalRows()).toEqual(finalExpected);
    expect(
      (
        await admin.query(
          `SELECT user_id,id,challenge_id,venue_id,level_id,started_at,activity_date,start_time_zone,legacy_display_time_zone,reflection_feeling,reflection_text,reflection_revision FROM ${schema}.attempts WHERE id=$1`,
          [canonicalId],
        )
      ).rows,
    ).toEqual(canonicalAccepted);

    expect(
      (
        await admin.query(
          `SELECT count(*)::int AS count FROM ${schema}.attempts`,
        )
      ).rows[0].count,
    ).toBe(11);
    expect(
      (
        await admin.query(
          `SELECT * FROM ${schema}.attempt_patch_receipts ORDER BY user_id,id`,
        )
      ).rows,
    ).toEqual(finalReceipt);
    expect(
      (
        await owned(owner, (client) =>
          client.query(`SELECT id FROM ${schema}.attempt_patch_receipts`),
        )
      ).rows,
    ).toEqual([{ id: receiptId }]);
    expect(
      (
        await owned(otherOwner, (client) =>
          client.query(`SELECT id FROM ${schema}.attempts WHERE id=$1`, [
            canonicalId,
          ]),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      owned(otherOwner, (client) =>
        client.query(
          `INSERT INTO ${schema}.attempt_patch_receipts VALUES ($1,$2,$3,repeat('c',64),2)`,
          [owner, randomUUID(), canonicalId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      owned(owner, (client) =>
        client.query(
          `UPDATE ${schema}.attempts SET legacy_display_time_zone='UTC' WHERE id=$1`,
          [canonicalId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      owned(owner, (client) =>
        client.query(
          `UPDATE ${schema}.attempts SET reflection_revision=-1 WHERE id=$1`,
          [canonicalId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      owned(owner, (client) =>
        client.query(
          `UPDATE ${schema}.attempts SET activity_date=NULL WHERE id=$1`,
          [canonicalId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23502' });
    // Rehearse a post-cutover correction using only canonical state, fenced to
    // the known fixture revision. A fresh unrelated canonical write and replay
    // receipt survive; rollback to an old app/database is never needed.
    const repairId = ids[1]!;
    const repaired = finalExpected.find((row) => row.id === repairId)!;
    await admin.query(
      `UPDATE ${schema}.attempts SET reflection_text='Synthetic forward-repair fault' WHERE user_id=$1 AND id=$2`,
      [owner, repairId],
    );
    await apply(
      `UPDATE justgo.attempts SET reflection_text='Synthetic late legacy submission' WHERE user_id='${owner}' AND id='${repairId}' AND reflection_revision=${Number(repaired.revision)};`,
    );
    expect(await canonicalRows()).toEqual(finalExpected);
    expect(
      (
        await admin.query(
          `SELECT user_id,id,challenge_id,venue_id,level_id,started_at,activity_date,start_time_zone,legacy_display_time_zone,reflection_feeling,reflection_text,reflection_revision FROM ${schema}.attempts WHERE id=$1`,
          [canonicalId],
        )
      ).rows,
    ).toEqual(canonicalAccepted);

    expect(
      (
        await admin.query(
          `SELECT * FROM ${schema}.attempt_patch_receipts ORDER BY user_id,id`,
        )
      ).rows,
    ).toEqual(finalReceipt);
    // A protected pre-contraction backup can restore both protocols, including
    // canonical writes accepted since expansion, then safely reapply cutover.
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await execute(
      pgTool('psql'),
      [
        '--no-psqlrc',
        '--set',
        'ON_ERROR_STOP=1',
        '--file',
        beforeContractSnapshot,
      ],
      { env: pgEnvironment() },
    );
    await compareMetadata(12);
    await migration(13);
    await compareMetadata(13);
    expect(await canonicalRows()).toEqual(finalExpected);
    expect(
      (
        await admin.query(
          `SELECT user_id,id,challenge_id,venue_id,level_id,started_at,activity_date,start_time_zone,legacy_display_time_zone,reflection_feeling,reflection_text,reflection_revision FROM ${schema}.attempts WHERE id=$1`,
          [canonicalId],
        )
      ).rows,
    ).toEqual(canonicalAccepted);

    expect(
      (
        await admin.query(
          `SELECT * FROM ${schema}.attempt_patch_receipts ORDER BY user_id,id`,
        )
      ).rows,
    ).toEqual(finalReceipt);
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await execute(
      pgTool('psql'),
      ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', snapshot],
      { env: pgEnvironment() },
    );
    await compareMetadata(9);
    expect(await legacyRows()).toEqual(before);
    await migration(10);
    await compareMetadata(10);
    await migration(11);
    await compareMetadata(11);
    expect(await canonicalRows()).toEqual(before);
    await migration(12);
    await compareMetadata(12);
    expect(await canonicalRows()).toEqual(normalizedBefore);
    expect(await legacyRows()).toEqual(normalizedBefore);
    await migration(13);
    await compareMetadata(13);
    expect(await canonicalRows()).toEqual(normalizedBefore);
    await migration(14);
    await compareMetadata(14);
    expect(await canonicalRows()).toEqual(normalizedBefore);
    await migration(15);
    await compareMetadata(15);
    expect(await canonicalRows()).toEqual(normalizedBefore);
    await migration(16);
    await compareMetadata(16);
    expect(await canonicalRows()).toEqual(normalizedBefore);
    await migration(17);
    await compareMetadata(17);
    expect(await canonicalRows()).toEqual(normalizedBefore);
    // Clean installation also applies the complete immutable journal.
    await admin.query(
      `DROP SCHEMA ${schema} CASCADE; CREATE SCHEMA ${schema} AUTHORIZATION justgo_migrator; REVOKE ALL ON SCHEMA ${schema} FROM public; GRANT USAGE ON SCHEMA ${schema} TO justgo_runtime`,
    );
    for (let index = 0; index <= 17; index++) await migration(index);
    await compareMetadata(17);
    expect(
      (
        await admin.query(
          `SELECT count(*)::int AS count FROM ${schema}.venue_cards`,
        )
      ).rows[0].count,
    ).toBe(61);
    expect(
      (await admin.query(`SELECT id FROM ${schema}.attempts`)).rows,
    ).toEqual([]);
  }, 60_000);
});
