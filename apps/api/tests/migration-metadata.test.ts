import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { generateDrizzleJson } from 'drizzle-kit/api';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema.js';

const root = new URL('../drizzle/', import.meta.url);
describe('reviewed migration history', () => {
  it('keeps the current declarative schema equal to its latest Drizzle snapshot', async () => {
    const generated = generateDrizzleJson(schema, undefined, ['justgo']);
    const saved = JSON.parse(
      await readFile(new URL('meta/0012_snapshot.json', root), 'utf8'),
    );
    expect({ ...generated, id: saved.id, prevId: saved.prevId }).toEqual(saved);
  });
  it('keeps already-applied SQL unchanged and contraction outside the journal', async () => {
    const hashes = JSON.parse(
      await readFile(
        new URL('./fixtures/applied-migration-hashes.json', import.meta.url),
        'utf8',
      ),
    ) as Record<string, string>;
    for (const [name, hash] of Object.entries(hashes))
      expect(
        createHash('sha256')
          .update(await readFile(new URL(name, root)))
          .digest('hex'),
      ).toBe(hash);
    const journal = JSON.parse(
      await readFile(new URL('meta/_journal.json', root), 'utf8'),
    ) as { entries: { tag: string }[] };
    expect(journal.entries.at(-1)?.tag).toBe(
      '0012_normalize_reflection_whitespace',
    );
    expect(journal.entries.some((entry) => /contract/i.test(entry.tag))).toBe(
      false,
    );
  });
});
