import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Each Privacy Policy clause that promises something the app shows, with the
// screens that keep the promise. If the clause changes, update its screens and
// this list together. If a screen loses its copy, the policy is no longer true.
const promises = [
  {
    clause:
      "Before signing in with Apple or Google, we explain that your history and journal synchronize through JustGO's cloud service.",
    screens: {
      'apps/mobile/src/app-support/identity/welcome/WelcomeView.tsx':
        'Signing in saves your challenge history, feelings and reflections to JustGO’s cloud to sync across devices.',
      'apps/mobile/src/app-support/identity/account/ProviderSignInScreen.tsx':
        'Signing in saves your challenge history, feelings and reflections to JustGO’s cloud service so they can sync across your signed-in devices.',
    },
  },
];

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const policyFile = 'docs/legal/PRIVACY_POLICY_DRAFT.md';
// JSX and Markdown wrap long copy, so compare text with whitespace collapsed.
const flat = (text) => text.replace(/\s+/g, ' ');
const read = (file) => flat(readFileSync(path.join(root, file), 'utf8'));

for (const { clause, screens } of promises) {
  test(`the UI keeps the Privacy Policy promise: ${clause}`, () => {
    assert.ok(
      read(policyFile).includes(flat(clause)),
      `${policyFile} no longer says this. Update the promise in scripts/quality/policy-copy.test.mjs and the screens it names.`,
    );
    const missing = Object.entries(screens)
      .filter(([file, copy]) => !read(file).includes(flat(copy)))
      .map(([file]) => file);
    assert.deepEqual(
      missing,
      [],
      `These screens no longer show the copy the Privacy Policy promises. Restore it, or change ${policyFile} first.`,
    );
  });
}
