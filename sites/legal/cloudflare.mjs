import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildSite, parseDocument } from './build.mjs';

/** Existing approved Vercel wording is not approval to publish changed providers. */
export function requireCloudflareNotice(source) {
  parseDocument(source, true);
  if (!/^<!-- deployment-host: cloudflare -->$/m.test(source))
    throw new Error(
      'Cloudflare notice and deployment-host approval are required',
    );
}

export async function buildCloudflareSite() {
  const privacy = await readFile(
    new URL('../../docs/legal/PRIVACY_POLICY_DRAFT.md', import.meta.url),
    'utf8',
  );
  requireCloudflareNotice(privacy);
  return buildSite({ production: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await buildCloudflareSite();
