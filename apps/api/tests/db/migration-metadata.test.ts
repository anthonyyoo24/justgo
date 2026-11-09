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
  it('keeps each applied migration SQL and journal when unchanged, lists every journal entry as applied or unapplied and has one contract migration', async () => {
    const pins = 'apps/api/tests/db/fixtures/applied-migration-hashes.json';
    const { applied, unapplied } = JSON.parse(
      await readFile(
        new URL('./fixtures/applied-migration-hashes.json', import.meta.url),
        'utf8',
      ),
    ) as {
      applied: Record<string, { sha256: string; when: number }>;
      unapplied: string[];
    };
    const names = Object.keys(applied);
    const journal = JSON.parse(
      await readFile(new URL('meta/_journal.json', root), 'utf8'),
    ) as { entries: { tag: string; when: number }[] };
    expect(
      journal.entries.map((entry) => `${entry.tag}.sql`),
      `List each apps/api/drizzle/meta/_journal.json migration once, in journal order, in ${pins}. A new migration goes under "unapplied". Once a hosted database runs it, move it to "applied" with its \`shasum -a 256\` hash and journal \`when\`.`,
    ).toEqual([...names, ...unapplied]);
    const current: typeof applied = {};
    for (const { tag, when } of journal.entries.slice(0, names.length))
      current[`${tag}.sql`] = {
        sha256: createHash('sha256')
          .update(await readFile(new URL(`${tag}.sql`, root)))
          .digest('hex'),
        when,
      };
    expect(
      current,
      `A hosted database stored the SQL hash and journal \`when\` of each "applied" migration in ${pins}, and Drizzle runs a migration again once its \`when\` passes the newest one stored. If you changed an applied migration's SQL or journal entry, revert it and add a new migration. If you just moved this entry from "unapplied", fix the pin to the SQL hash and \`when\` of the commit the hosted database ran.`,
    ).toEqual(applied);
    expect(
      journal.entries.filter((entry) => /contract/i.test(entry.tag)),
    ).toHaveLength(1);
  });
});
