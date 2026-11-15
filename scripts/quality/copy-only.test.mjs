import assert from 'node:assert/strict';
import test from 'node:test';
import { changeRuns, isCopyOnly, isProse, splitStrings } from './copy-only.mjs';

const path = 'apps/mobile/src/app-support/identity/auth/managed-controller.ts';
// A one-hunk patch that replaces `before` lines with `after` lines.
const patchOf = (before, after, context = ['const a = 1;']) =>
  [
    '@@ -1,3 +1,3 @@',
    ...context.map((line) => ` ${line}`),
    ...before.map((line) => `-${line}`),
    ...after.map((line) => `+${line}`),
    ...context.map((line) => ` ${line}`),
  ].join('\n');
const copyOnly = (before, after, file = path) =>
  isCopyOnly({ path: file, patch: patchOf(before, after) });

test('a reworded message in a template literal is copy-only (#510)', () => {
  assert.equal(
    copyOnly(
      [
        '  `That ${providerAccountNames[provider]} already has its own JustGO account, so it can’t be added to this one. You’re still signed in, and nothing changed.`;',
      ],
      [
        '  `That ${providerAccountNames[provider]} already has its own JustGO account, so it can’t be added to this one.`;',
      ],
    ),
    true,
  );
});

test('quoted strings, JSX attributes and a shorter string that rejoins its line are copy-only', () => {
  assert.equal(
    copyOnly(
      ['        label="Download my data"'],
      ['        label="Export data"'],
    ),
    true,
  );
  assert.equal(
    copyOnly(
      ["    : 'Your data download was shared.',"],
      ["    : 'Your data export was shared.',"],
    ),
    true,
  );
  assert.equal(
    copyOnly(
      [
        '  const conflict =',
        "    'That Apple ID already has its own JustGO account, so it can’t be added to this one.';",
      ],
      ["  const conflict = 'That Apple ID is taken.';"],
    ),
    true,
  );
  assert.equal(
    copyOnly(
      [
        '  expect(screen.getByText(',
        "    'Your data is yours today',",
        '  ));',
      ],
      ["  expect(screen.getByText('Your data is yours'));"],
      'apps/mobile/src/app-support/identity/account/Screen.test.tsx',
    ),
    true,
  );
});

test('a changed template expression, identifier or code token is not copy-only', () => {
  assert.equal(
    copyOnly(
      ['  `That ${providerAccountNames[provider]} is taken.`;'],
      ['  `That ${provider} is taken.`;'],
    ),
    false,
  );
  assert.equal(
    copyOnly(["  message: 'Sign in again.',"], ["  reason: 'Sign in again.',"]),
    false,
  );
  assert.equal(
    copyOnly(["  return 'Sign in again.';"], ["  throw 'Sign in again.';"]),
    false,
  );
  // A line break where it could end a statement is not just layout.
  assert.equal(
    copyOnly(["  return 'Sign in again.';"], ['  return', "    'Sign in.';"]),
    false,
  );
});

test('a changed URL, path, header, key, error code or SQL is not copy-only', () => {
  for (const [before, after] of [
    ["'https://justgo.app/privacy'", "'https://evil.test/privacy'"],
    ["'Read https://justgo.app now'", "'Read https://evil.test now'"],
    ["'/v1/sessions'", "'/v1/session'"],
    ["'Content-Type'", "'Authorization'"],
    ["'justgo.session'", "'justgo.sessions'"],
    ["'IDENTITY_EXISTS'", "'IDENTITY_TAKEN'"],
    [
      "'SELECT entry_json FROM journal_entries'",
      "'DROP TABLE journal_entries'",
    ],
    ["'Delete everything now'", "'DROP TABLE journal entries'"],
    ["'auth signed in'", "'auth signed out'"],
  ])
    assert.equal(
      copyOnly([`  const value = ${before};`], [`  const value = ${after};`]),
      false,
      `${before} -> ${after}`,
    );
});

test('text compared, matched, used as a key or index is behavior, not copy', () => {
  for (const line of [
    "  if (error.message === 'Network request failed') {",
    "  case 'Network request failed':",
    "  if (text.includes('Network request failed')) {",
    "  const map = { 'Network request failed': 1 };",
    "  const value = map['Network request failed'];",
  ])
    assert.equal(
      copyOnly([line], [line.replace('failed', 'stopped')]),
      false,
      line,
    );
});

test('a comparison or matcher that Prettier wraps around the string is behavior, not copy', () => {
  // The unchanged line just above or below the run holds the comparison.
  for (const [above, below] of [
    ['  if (error.message ===', '  ) {'],
    ['  if (error.message !==', '  ) {'],
    ['  const offline = text.includes(', '  );'],
    ['  const offline = message.startsWith(', '  );'],
    ['  const value = map[', '  ];'],
    ['  const offline = (', '  ).endsWith(prefix);'],
    ['  const offline = (', '  )'],
  ]) {
    const patch = [
      '@@ -1,3 +1,3 @@',
      ` ${above}`,
      "-    'Network request failed'",
      "+    'Network request stopped'",
      ` ${below}`,
    ].join('\n');
    const expected = above === '  const offline = (' && below === '  )';
    assert.equal(isCopyOnly({ path, patch }), expected, `${above} / ${below}`);
  }
  // Only the lines next to the run count, so a comparison further away
  // leaves a plain message copy-only.
  assert.equal(
    isCopyOnly({
      path,
      patch: [
        '@@ -1,4 +1,4 @@',
        '   if (error.message === offline) {',
        '     return {',
        "-      message: 'Network request failed',",
        "+      message: 'Network request stopped',",
        '     };',
      ].join('\n'),
    }),
    true,
  );
});

test('comments, JSX text, regexes, escapes and multi-line templates are not read', () => {
  assert.equal(
    copyOnly(['  // Signs the user out.'], ['  // Signs the user in.']),
    false,
  );
  assert.equal(
    copyOnly(['          Your data is yours'], ['          Your data is ours']),
    false,
  );
  assert.equal(
    copyOnly(
      ['  expect(screen.queryByText(/Sign in again/)).toBeNull();'],
      ['  expect(screen.queryByText(/Sign in now/)).toBeNull();'],
    ),
    false,
  );
  assert.equal(
    copyOnly(
      ["  const a = 'It\\'s here now';"],
      ["  const a = 'It\\'s there now';"],
    ),
    false,
  );
  // A line inside a template that the hunk opens elsewhere.
  assert.equal(
    isCopyOnly({
      path,
      patch: [
        '@@ -1,4 +1,4 @@',
        '   await run(`',
        "-    UPDATE entries SET note = 'Old note here'",
        "+    UPDATE entries SET note = 'New note here'",
        '   `);',
      ].join('\n'),
    }),
    false,
  );
});

test('a missing patch, a file out of scope or an unreadable patch is not copy-only', () => {
  assert.equal(isCopyOnly({ path }), false);
  assert.equal(
    copyOnly(
      ["  const a = 'Old words here';"],
      ["  const a = 'New words here';"],
      'apps/api/src/identity/service.ts',
    ),
    false,
  );
  assert.equal(
    copyOnly(
      ["  const a = 'Old words here';"],
      ["  const a = 'New words here';"],
      'apps/mobile/src/data/journal/schema.sql',
    ),
    false,
  );
  assert.equal(isCopyOnly({ path, patch: '' }), false);
  assert.equal(isCopyOnly({ path, patch: "-const a = 'Old words';" }), false);
  // A file only added to or only removed from is not a rewording.
  assert.equal(copyOnly([], ["  const a = 'New words here';"]), false);
  assert.equal(copyOnly(["  const a = 'Old words here';"], []), false);
});

test('the pieces read code, prose and patches as documented', () => {
  assert.deepEqual(splitStrings("f('A b', `C ${d} e`)"), {
    skeleton: 'f(\uE000, `${d}`)',
    strings: ['A b', 'C X e'],
  });
  assert.equal(splitStrings("f('unterminated)"), undefined);
  assert.equal(splitStrings('a / b'), undefined);
  for (const text of [
    'Export data',
    'That X already has its own JustGO account, so it can’t be added to this one.',
    '3 days left',
    '“Quoted” words here',
  ])
    assert.equal(isProse(text), true, text);
  for (const text of ['Export', 'export data', 'e.g. this', 'A_B c', 'A {b}'])
    assert.equal(isProse(text), false, text);
  assert.deepEqual(
    changeRuns('@@ -1 +1 @@\n-a\n+b\n c\n-d\n\\ No newline at end of file'),
    [
      { above: undefined, removed: ['a'], added: ['b'], below: 'c' },
      { above: 'c', removed: ['d'], added: [] },
    ],
  );
});
