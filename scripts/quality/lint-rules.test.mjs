import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd: root });
const production = 'apps/mobile/src/components/PrimaryButton.tsx';
const tests = 'apps/mobile/src/components/PrimaryButton.test.tsx';

for (const [rule, source, filePath = production, severity = 2] of [
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
]) {
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
