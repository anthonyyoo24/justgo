import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { generateDrizzleJson } from 'drizzle-kit/api';
import { describe, expect, it } from 'vitest';
import * as schema from '../../src/db/schema.js';

const root = new URL('../../drizzle/', import.meta.url);
describe('reviewed migration history', () => {
  it('keeps the current declarative schema equal to its latest Drizzle snapshot', async () => {
    const generated = generateDrizzleJson(schema, undefined, ['justgo']);
    const saved = JSON.parse(
      await readFile(new URL('meta/0024_snapshot.json', root), 'utf8'),
    );
    expect({ ...generated, id: saved.id, prevId: saved.prevId }).toEqual(saved);
  });
  it('keeps already-applied SQL unchanged, pins every journal entry as applied or unapplied and has one contract migration', async () => {
    const pins = 'apps/api/tests/db/fixtures/applied-migration-hashes.json';
    const { applied, unapplied } = JSON.parse(
      await readFile(
        new URL('./fixtures/applied-migration-hashes.json', import.meta.url),
        'utf8',
      ),
    ) as { applied: Record<string, string>; unapplied: string[] };
    const journal = JSON.parse(
      await readFile(new URL('meta/_journal.json', root), 'utf8'),
    ) as { entries: { tag: string }[] };
    expect(
      journal.entries.map((entry) => `${entry.tag}.sql`),
      `List each apps/api/drizzle/meta/_journal.json migration once, in journal order, in ${pins}. A new migration goes under "unapplied". Once a hosted database runs it, move it to "applied" with its \`shasum -a 256\` hash.`,
    ).toEqual([...Object.keys(applied), ...unapplied]);
    const current: Record<string, string> = {};
    for (const name of Object.keys(applied))
      current[name] = createHash('sha256')
        .update(await readFile(new URL(name, root)))
        .digest('hex');
    expect(
      current,
      `A hosted database already ran each "applied" migration in ${pins}, so revert the edit and add a new migration instead.`,
    ).toEqual(applied);
    expect(
      journal.entries.filter((entry) => /contract/i.test(entry.tag)),
    ).toHaveLength(1);
  });
});
