import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';

const runId = process.env.JUSTGO_VERIFY_RUN_ID ?? '';
if (!/^[A-Za-z0-9-]{1,80}$/.test(runId))
  throw new Error(
    'Set JUSTGO_VERIFY_RUN_ID to letters, digits and hyphens; bin/verify does this',
  );
export const evidenceDir = path.join(
  process.cwd(),
  '.local/verify-justgo',
  runId,
);

const recoveryKey = /(?:[a-f0-9]{8} ){3,}[a-f0-9]{8}/i;

/** Apply the screenshot mask to the accessibility tree: no input values or keys. */
function maskTree(tree: string) {
  let inputIndent = -1;
  return tree
    .split('\n')
    .map((line) => {
      const indent = line.search(/\S/);
      if (inputIndent >= 0 && indent <= inputIndent) inputIndent = -1;
      if (/^\s*- textbox\b/.test(line)) {
        inputIndent = indent;
        return line.replace(
          /^(\s*- textbox(?: "[^"]*")?(?: \[[^\]]*\])*:).+$/,
          '$1 [masked]',
        );
      }
      if (inputIndent >= 0 && /^\s*- text:/.test(line))
        return line.replace(/- text:.*$/, '- text: [masked]');
      return line.replace(new RegExp(recoveryKey.source, 'gi'), '[masked]');
    })
    .join('\n');
}

/** Save a masked screenshot and the accessibility tree for one user-visible step. */
export async function capture(page: Page, feature: string, step: string) {
  const folder = path.join(evidenceDir, feature);
  await mkdir(folder, { recursive: true });
  // Same mask as the journey failure screenshot: inputs and recovery-key text.
  await page.screenshot({
    path: path.join(folder, `${step}.png`),
    mask: [page.getByRole('textbox'), page.getByText(recoveryKey)],
  });
  const tree = maskTree(await page.locator('body').ariaSnapshot());
  await writeFile(
    path.join(folder, `${step}.aria.yml`),
    `# ${new URL(page.url()).pathname}\n${tree}\n`,
  );
}

/** Record side effects read back from the database and browser stores. */
export async function writeProof(feature: string, proof: object) {
  const folder = path.join(evidenceDir, feature);
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, 'proof.json'),
    `${JSON.stringify({ feature, runId, ...proof }, null, 2)}\n`,
  );
}
