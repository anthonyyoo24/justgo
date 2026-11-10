import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd: root });
const production = 'apps/mobile/src/components/PrimaryButton.tsx';
const tests = 'apps/mobile/src/components/PrimaryButton.test.tsx';

const cases = [
  [
    '@typescript-eslint/switch-exhaustiveness-check',
    "export function choose(value: 'a' | 'b') { switch (value) { case 'a': return 1; } }",
  ],
  ['@typescript-eslint/only-throw-error', "throw 'private transport text';"],
  [
    '@typescript-eslint/no-unnecessary-type-assertion',
    'export function unchanged(value: string) { return value as string; }',
  ],
  [
    '@typescript-eslint/no-redundant-type-constituents',
    "export type Value = string | 'literal';",
  ],
  [
    '@typescript-eslint/no-deprecated',
    '/** @deprecated Use current(). */ function legacy() { return 1; } export const value = legacy();',
  ],
  [
    '@typescript-eslint/no-non-null-assertion',
    'export function unsafe(value?: string) { return value!; }',
    production,
    1,
  ],
  [
    'react-x/no-missing-key',
    'export function Example() { return [1, 2].map(value => <Text>{value}</Text>); }',
  ],
  [
    'react-x/no-duplicate-key',
    'export function Example() { return [<Text key="same" />, <Text key="same" />]; }',
  ],
  [
    'react-x/no-nested-component-definitions',
    'export function Example() { function Child() { return <Text />; } return <Child />; }',
  ],
  [
    'react-x/no-leaked-conditional-rendering',
    'export function Example({ count }: { count: number }) { return <>{count && <Text />}</>; }',
  ],
  [
    'testing-library/await-async-queries',
    "import { render } from '@testing-library/react-native'; const screen = render(<Text />); screen.findByText('Ready');",
    tests,
  ],
  [
    'testing-library/await-async-utils',
    "import { waitFor } from '@testing-library/react-native'; waitFor(() => {});",
    tests,
  ],
  [
    'testing-library/no-await-sync-queries',
    "import { render } from '@testing-library/react-native'; async function check() { const screen = render(<Text />); await screen.getByText('Ready'); }",
    tests,
  ],
  [
    'testing-library/no-promise-in-fire-event',
    "import { fireEvent, render } from '@testing-library/react-native'; const screen = render(<Text />); fireEvent.press(screen.findByRole('button'));",
    tests,
  ],
  [
    'no-restricted-imports',
    "import { getRandomBytes } from 'expo-crypto'; export const secret = getRandomBytes(32);",
  ],
  [
    'no-restricted-imports',
    "import * as Crypto from 'expo-crypto'; export const secret = Crypto.getRandomBytesAsync(32);",
  ],
  [
    'no-restricted-imports',
    "import { getRandomValues } from 'expo-crypto'; export const secret = getRandomValues(new Uint8Array(16));",
  ],
  [
    'no-restricted-syntax',
    "import { execFileSync } from 'node:child_process'; execFileSync('git', ['diff', '--name-only', 'origin/main']);",
    'scripts/quality/changes.mjs',
  ],
  [
    'no-restricted-syntax',
    "import { execSync } from 'node:child_process'; execSync(`git diff --name-only ${process.env.BASE}`);",
    'scripts/quality/changes.mjs',
  ],
  [
    'no-restricted-syntax',
    "import { execFileSync } from 'node:child_process'; execFileSync('git', ['patch-id'], { input: '' });",
    'scripts/quality/changes.mjs',
  ],
  [
    'no-restricted-syntax',
    "import { execSync } from 'node:child_process'; execSync('git patch-id --stable', { input: '' });",
    'scripts/quality/changes.mjs',
  ],
  [
    'no-restricted-globals',
    'export const erase = (request: typeof fetch = fetch) => request;',
    'apps/api/src/identity/managed-deletion.ts',
  ],
  [
    'no-restricted-globals',
    "export const send = () => globalThis.fetch('https://example.invalid');",
    'apps/api/src/http/server-error-reporter.ts',
  ],
  [
    'no-restricted-globals',
    'export const send = (url: string) => fetch(url);',
    'apps/api/src/http/outbound.mts',
  ],
  [
    'no-restricted-globals',
    'export const send = (url: string) => fetch(url);',
    'apps/api/src/http/outbound.cts',
  ],
  [
    'no-restricted-globals',
    'const global = globalThis; export const send = (url: string) => global.fetch(url);',
    'apps/api/src/http/server-error-reporter.ts',
  ],
  [
    'no-restricted-globals',
    'const { fetch: send } = globalThis; export { send };',
    'apps/api/src/http/server-error-reporter.ts',
  ],
  [
    'no-restricted-globals',
    "export const send = Reflect.get(globalThis, 'fetch');",
    'apps/api/src/http/server-error-reporter.ts',
  ],
  [
    'no-restricted-globals',
    "export const send = () => self.fetch('https://example.invalid');",
    'apps/api/src/http/server-error-reporter.ts',
  ],
  [
    'no-restricted-globals',
    "export const send = () => window.fetch('https://example.invalid');",
    'apps/api/src/http/server-error-reporter.ts',
  ],
  [
    'no-restricted-imports',
    "import { fetch } from 'undici'; export const send = fetch;",
    'apps/api/src/http/server-error-reporter.ts',
  ],
  [
    'no-restricted-imports',
    "import { request } from 'undici'; export const send = request;",
    'apps/api/src/http/server-error-reporter.ts',
  ],
  // #239: Node's global, undici subpaths and Node's HTTP modules skip outboundFetch.
  [
    'no-restricted-globals',
    "export const send = () => global.fetch('https://example.invalid');",
    'apps/api/src/http/server-error-reporter.ts',
  ],
  ...[
    "import { fetch } from 'undici/lib/web/fetch/index.js'; export const send = fetch;",
    "import { request } from 'node:http'; export const send = request;",
    "import { request } from 'node:https'; export const send = request;",
    "import { get } from 'http'; export const send = get;",
    "import { request } from 'https'; export const send = request;",
  ].flatMap((source) =>
    [
      'apps/api/src/http/server-error-reporter.ts',
      'apps/api/src/identity/managed-deletion.ts',
    ].map((filePath) => ['no-restricted-imports', source, filePath]),
  ),
  [
    'no-restricted-imports',
    "import crossFetch from 'cross-fetch'; export const send = crossFetch;",
    'apps/api/src/http/server-error-reporter.ts',
  ],
  [
    'no-restricted-imports',
    "import { createClient } from '@supabase/supabase-js'; export const admin = createClient('https://example.invalid', 'secret');",
    'apps/api/src/http/server-error-reporter.ts',
  ],
  [
    'no-restricted-imports',
    "import { fetch } from 'undici'; export const send = fetch;",
    'apps/api/src/identity/managed-deletion.ts',
  ],
  // #219: .mts and .cts files skip the import boundaries and the typed rules.
  [
    'justgo/import-boundaries',
    "import { x } from '../../../mobile/src/lib/x.js'; export const y = x;",
    'apps/api/src/http/boundary.mts',
  ],
  [
    'justgo/import-boundaries',
    "import { x } from '../../../mobile/src/lib/x.js'; export const y = x;",
    'apps/api/src/http/boundary.cts',
  ],
  [
    '@typescript-eslint/no-floating-promises',
    'export async function f() { Promise.resolve(1); }',
    'apps/api/src/http/boundary.mts',
  ],
  [
    '@typescript-eslint/no-floating-promises',
    'export async function f() { Promise.resolve(1); }',
    'apps/api/src/http/boundary.cts',
  ],
  [
    'justgo/rls-context',
    "export const leak = (client: { query(text: string): unknown }) => client.query('SET app.user_id = 1');",
    'apps/api/src/data-sync/journal.mts',
  ],
  ...[
    "import { sql } from 'drizzle-orm'; export const leak = (tx: { execute(query: unknown): unknown }, id: string) => tx.execute(sql`select set_config('app.user_id', ${id}, false)`);",
    "export const leak = (client: { query(text: string): unknown }) => client.query('SET app.user_id = 1');",
    "export const leak = (id: string) => `-- owner context\\nSET app.user_id = '${id}'`;",
    "export const leak = (id: string) => `/* owner */ SET app.user_id = '${id}'`;",
    'export const leak = (id: string) => `SET"app.user_id" TO \'${id}\'`;',
    "export const leak = (id: string) => `select 1; SET SESSION app.user_id = '${id}'`;",
    "import { Pool } from 'pg'; export const leak = (id: string) => new Pool({ options: `-c app.user_id=${id}` });",
    "export const leak = (id: string) => 'select set_' + `config('app.user_id', '${id}', false)`;",
  ].map((source) => [
    'justgo/rls-context',
    source,
    'apps/api/src/data-sync/journal.ts',
  ]),
];

// The typed rules' project service lints only files on disk, and no source
// file uses .mts or .cts yet. Empty placeholders let lintText supply the code.
// A placeholder that already exists stops the run, and the ones made before it
// are removed here, because after() never runs when this file throws on load.
const placeholders = [];
const removePlaceholders = () => {
  for (const file of placeholders.splice(0)) rmSync(file, { force: true });
};
after(removePlaceholders);
try {
  for (const filePath of new Set(cases.map(([, , filePath]) => filePath))) {
    if (!/\.[mc]ts$/.test(filePath ?? '')) continue;
    const file = path.join(root, filePath);
    writeFileSync(file, '', { flag: 'wx' });
    placeholders.push(file);
  }
} catch (error) {
  removePlaceholders();
  throw error;
}

for (const [rule, source, filePath = production, severity = 2] of cases) {
  test(`lint safeguard: ${rule}`, async () => {
    const [result] = await eslint.lintText(source, {
      filePath: path.join(root, filePath),
    });
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    const violations = result.messages.filter(
      (message) => message.ruleId === rule,
    );
    assert.ok(violations.length > 0, JSON.stringify(result.messages));
    assert.ok(violations.every((message) => message.severity === severity));
  });
}

test('RLS context lint accepts ordinary SQL, messages and built-in connection options', async () => {
  const [result] = await eslint.lintText(
    `
    import { sql } from 'drizzle-orm';
    import { Pool } from 'pg';
    import { users } from '../db/schema.js';
    export const update = (id: string) =>
      sql\`update \${users} set deleted_at = now() where \${users.id} = \${id}\`;
    export const upsert = (id: string) =>
      sql\`insert into justgo.users (id) values (\${id}) on conflict (id) do update set deleted_at = null\`;
    export const hint = () => new Error('Set DATABASE_URL to the loopback justgo_test database.');
    export const pool = new Pool({ options: '-c statement_timeout=5000' });
  `,
    { filePath: path.join(root, 'apps/api/src/data-sync/journal.ts') },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.deepEqual(
    result.messages.filter(
      (message) => message.ruleId === 'justgo/rls-context',
    ),
    [],
  );
});

test('Testing Library accepts awaited native queries and synchronous renderer inspection', async () => {
  const [result] = await eslint.lintText(
    `
    import { render, waitFor } from '@testing-library/react-native';
    async function check() {
      const screen = render(<Text />);
      await screen.findByText('Ready');
      await waitFor(() => screen.getByText('Ready'));
      screen.getByText('Ready').findByType(Text);
    }
  `,
    { filePath: path.join(root, tests) },
  );
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.deepEqual(
    result.messages.filter((message) =>
      message.ruleId?.startsWith('testing-library/'),
    ),
    [],
  );
});
