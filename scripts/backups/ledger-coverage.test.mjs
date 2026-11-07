import assert from 'node:assert/strict';
import test from 'node:test';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../../apps/api/src/db/schema.ts';
import {
  dumpOnlyLedgerColumns,
  dumpOnlyTables,
  ledgerTables,
} from './snapshot.mjs';

const tables = new Map(
  Object.values(schema)
    .filter((value) => is(value, PgTable))
    .map((table) => getTableConfig(table))
    .map(({ name, columns }) => [name, columns.map((column) => column.name)]),
);
const list = (csv) => (csv ? csv.split(',') : []);

test('every schema table is either a ledger table or dump-only', () => {
  assert.ok(tables.size > 0);
  for (const name of tables.keys())
    assert.ok(
      Object.hasOwn(ledgerTables, name) !== dumpOnlyTables.includes(name),
      `Put justgo.${name} in exactly one of ledgerTables and dumpOnlyTables in scripts/backups/snapshot.mjs. A restore replays only ledgerTables over the older dump, so a table that records a deletion, revocation or tombstone is a ledger table.`,
    );
  for (const name of [...Object.keys(ledgerTables), ...dumpOnlyTables])
    assert.ok(tables.has(name), `${name} is not a table in schema.ts`);
});

test('every column of a ledger table is either replayed or dump-only', () => {
  for (const [name, columns] of Object.entries(ledgerTables))
    assert.deepEqual(
      [...list(columns), ...list(dumpOnlyLedgerColumns[name])].sort(),
      [...tables.get(name)].sort(),
      `List each justgo.${name} column once, in ledgerTables or dumpOnlyLedgerColumns in scripts/backups/snapshot.mjs. Replay a column that records a deletion or revocation.`,
    );
  for (const name of Object.keys(dumpOnlyLedgerColumns))
    assert.ok(
      Object.hasOwn(ledgerTables, name),
      `${name} is not a ledger table`,
    );
});
