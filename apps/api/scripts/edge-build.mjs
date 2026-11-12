import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  productionPath,
  requireRelease,
  StagingRunnerFailure,
} from '../../../scripts/release/staging-api.mjs';

/** The Phase 15 perf rule: the uploaded API bundle stays at or under 5 MB. */
export const edgeBundleLimit = 5 * 1024 * 1024;
export const edgeEntry = 'apps/api/src/edge.ts';
export const edgeFunctionDirectory = 'supabase/functions/api';

// pg and its dependencies expect Node globals that Deno exposes only as
// modules. Without Buffer every managed request fails its bearer check.
export const edgeBanner = [
  "import { createRequire as __edgeCreateRequire } from 'node:module';",
  "import { Buffer } from 'node:buffer';",
  "import process from 'node:process';",
  "import { setImmediate, clearImmediate } from 'node:timers';",
  'const require = __edgeCreateRequire(import.meta.url);',
  'const global = globalThis;',
].join('\n');

const outputs = ['edge.mjs', 'release.mjs'];

/**
 * Inspect the real esbuild inputs: Node builtins, locked dependencies inside
 * this checkout, or tracked production sources. Then accept only the two
 * generated modules, the bundle within the size limit.
 */
export function validateEdgeBundle({ root, directory, metafile, tracked }) {
  const paths = Object.keys(metafile?.inputs ?? {});
  requireRelease(paths.length > 0, 'INVALID_API_UPLOAD');
  const repository = realpathSync(root);
  const locked = new Set(tracked);
  for (const input of paths) {
    const absolute = resolve(root, input);
    const path = relative(repository, realpathSync(absolute));
    requireRelease(
      !path.startsWith('../') &&
        !isAbsolute(path) &&
        lstatSync(absolute).isFile(),
      'UNSAFE_API_UPLOAD',
    );
    const dependency =
      path.startsWith('node_modules/') &&
      !/(?:^|\/)(?:\.env[^/]*|test-support|__tests__)(?:\/|$)|\.(?:key|pem|p8|p12)$/.test(
        path,
      );
    requireRelease(
      dependency || (locked.has(path) && productionPath(path)),
      'UNSAFE_API_UPLOAD',
    );
  }
  const files = readdirSync(directory).sort();
  requireRelease(
    files.length === outputs.length &&
      files.every((file, index) => file === outputs[index]),
    'API_UPLOAD_PATH_MISMATCH',
  );
  for (const file of outputs)
    requireRelease(
      lstatSync(join(directory, file)).isFile() &&
        !lstatSync(join(directory, file)).isSymbolicLink(),
      'UNSAFE_API_UPLOAD',
    );
  const content = readFileSync(join(directory, 'edge.mjs'));
  requireRelease(
    content.length > 0 && content.length <= edgeBundleLimit,
    'INVALID_API_UPLOAD',
  );
  const release = readFileSync(join(directory, 'release.mjs'));
  return {
    bytes: content.length,
    uploadSha256: createHash('sha256')
      .update(content)
      .update('\0')
      .update(release)
      .digest('hex'),
  };
}

/** The deploy names its own source, because Supabase secrets are project-wide. */
export function releaseModule(sourceSha) {
  if (sourceSha === undefined)
    return 'export const release = Object.freeze({});\n';
  requireRelease(/^[a-f0-9]{40}$/.test(sourceSha), 'INVALID_RELEASE_SOURCE');
  return `export const release = Object.freeze(${JSON.stringify({
    JUSTGO_SOURCE_SHA: sourceSha,
    API_SENTRY_RELEASE: sourceSha,
  })});\n`;
}

/** Bundle one entry for the Edge runtime with the settings Phase 15 tested. */
export async function bundleEdge({ root, entry, outfile, external = [] }) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [resolve(root, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    metafile: true,
    logLevel: 'error',
    legalComments: 'none',
    banner: { js: edgeBanner },
    external: ['pg-native', 'pg-cloudflare', ...external],
    // Bundle the tracked contracts sources; do not trust an ignored dist artifact.
    alias: {
      '@justgo/contracts': resolve(root, 'packages/contracts/src/index.ts'),
      '@justgo/contracts/openapi': resolve(
        root,
        'packages/contracts/src/openapi.ts',
      ),
    },
  });
  return result.metafile;
}

/**
 * Write <directory>/edge.mjs and <directory>/release.mjs, validate them and
 * return the digest of the uploaded code.
 */
export async function buildEdge({
  root,
  directory = resolve(root, edgeFunctionDirectory, 'dist'),
  sourceSha,
  tracked,
}) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const metafile = await bundleEdge({
    root,
    entry: edgeEntry,
    outfile: join(directory, 'edge.mjs'),
  });
  writeFileSync(join(directory, 'release.mjs'), releaseModule(sourceSha));
  return validateEdgeBundle({
    root,
    directory,
    metafile,
    tracked:
      tracked ??
      execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
        .split('\0')
        .filter(Boolean),
  });
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const root = resolve(import.meta.dirname, '../../..');
  const sha = process.argv.includes('--release')
    ? execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim()
    : undefined;
  try {
    const bundle = await buildEdge({ root, sourceSha: sha });
    console.info(
      JSON.stringify({
        directory: join(edgeFunctionDirectory, 'dist'),
        bytes: bundle.bytes,
        uploadSha256: bundle.uploadSha256,
        sourceSha: sha ?? null,
      }),
    );
  } catch (error) {
    // StagingRunnerFailure messages are fixed codes; anything else stays unnamed.
    console.error(
      `Edge build failed: ${error instanceof StagingRunnerFailure ? error.message : 'build error'}`,
    );
    process.exitCode = 1;
  }
}
