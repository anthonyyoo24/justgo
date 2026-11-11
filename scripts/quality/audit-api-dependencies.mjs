import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const runtimeFields = ['dependencies', 'optionalDependencies'];

function safePath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    value.includes('\0') ||
    /^[a-z]:/i.test(value) ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.split('/').includes('..') ||
    value.split('/').includes('node_modules')
  )
    throw new Error(`Invalid lockfile path: ${value}`);
  return value;
}

function safeName(name) {
  if (
    !/^(?:@[^/]+\/)?[^/]+$/.test(name) ||
    name
      .split('/')
      .some((part) => ['.', '..'].includes(part) || /[\\\0]/.test(part))
  )
    throw new Error(`Invalid dependency name: ${name}`);
  return name;
}

// A locked reference is a version with its peer suffix, `link:` to a
// workspace, or `<real-name>@<version>` for an npm alias.
function target(name, reference) {
  if (typeof reference !== 'string' || !reference)
    throw new Error(`Invalid locked reference for ${name}`);
  if (reference.startsWith('link:')) return { link: reference.slice(5) };
  if (/^\d/.test(reference)) return { name: safeName(name), reference };
  const alias = reference.match(/^((?:@[^/@]+\/)?[^/@]+)@(\d.*)$/);
  if (!alias) throw new Error(`Unsupported locked reference: ${reference}`);
  return { name: safeName(alias[1]), reference: alias[2] };
}

/** Keep pnpm's exact resolutions; never resolve a fresh install. */
export function apiProductionLock(lock, workspace = 'apps/api') {
  if (lock?.lockfileVersion !== '9.0' || !lock.importers?.[workspace])
    throw new Error('Expected a v9 workspace lockfile');
  safePath(workspace);
  const importers = {};
  const packages = {};
  const snapshots = {};
  const visitSnapshot = (name, reference, optional) => {
    const key = `${name}@${reference}`;
    if (snapshots[key]) return;
    const snapshot = lock.snapshots?.[key];
    const metadata = lock.packages?.[`${name}@${reference.split('(')[0]}`];
    if (!snapshot || !metadata) {
      if (optional) return;
      throw new Error(`Missing locked dependency ${key}`);
    }
    // An optional peer is a provider the consumer may choose. Include it when
    // an actual dependency or required-peer edge selects it, not merely
    // because an unrelated workspace happens to install that adapter.
    const optionalPeer = (dependency) =>
      metadata.peerDependenciesMeta?.[dependency]?.optional === true;
    const copy = { ...snapshot };
    for (const field of runtimeFields) {
      if (!snapshot[field]) continue;
      copy[field] = Object.fromEntries(
        Object.entries(snapshot[field]).filter(
          ([dependency]) => !optionalPeer(dependency),
        ),
      );
    }
    snapshots[key] = copy;
    packages[`${name}@${reference.split('(')[0]}`] = metadata;
    for (const dependency of Object.keys(metadata.peerDependencies ?? {}))
      if (
        !optionalPeer(dependency) &&
        !copy.dependencies?.[dependency] &&
        !copy.optionalDependencies?.[dependency]
      )
        throw new Error(`Missing locked dependency ${dependency} for ${key}`);
    for (const field of runtimeFields)
      for (const [dependency, value] of Object.entries(copy[field] ?? {})) {
        const next = target(dependency, value);
        if (next.link) throw new Error(`Invalid workspace link in ${key}`);
        visitSnapshot(
          next.name,
          next.reference,
          field === 'optionalDependencies',
        );
      }
  };
  const visitImporter = (location) => {
    safePath(location);
    if (importers[location]) return;
    const entry = lock.importers[location];
    if (!entry) throw new Error(`Missing workspace link: ${location}`);
    importers[location] = Object.fromEntries(
      runtimeFields.filter((field) => entry[field]).map((f) => [f, entry[f]]),
    );
    for (const field of runtimeFields)
      for (const [dependency, { version }] of Object.entries(
        entry[field] ?? {},
      )) {
        const next = target(dependency, version);
        if (next.link)
          visitImporter(
            path.posix.normalize(path.posix.join(location, next.link)),
          );
        else
          visitSnapshot(
            next.name,
            next.reference,
            field === 'optionalDependencies',
          );
      }
  };
  visitImporter(workspace);
  return {
    lockfileVersion: lock.lockfileVersion,
    settings: lock.settings,
    importers: { '.': {}, ...importers },
    packages,
    snapshots,
  };
}

export const auditArguments = ['audit', '--prod', '--audit-level', 'low'];

function pnpmAudit(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', auditArguments, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal || code === null)
        reject(new Error('Dependency audit interrupted'));
      else resolve(code);
    });
  });
}

export async function auditApiDependencies(root, audit = pnpmAudit) {
  const lock = yaml.load(
    await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8'),
  );
  const projected = apiProductionLock(lock);
  const workspaces = Object.keys(projected.importers).filter((w) => w !== '.');
  const temporary = await mkdtemp(path.join(tmpdir(), 'justgo-api-audit-'));
  try {
    for (const location of workspaces) {
      const manifest = JSON.parse(
        await readFile(path.join(root, location, 'package.json'), 'utf8'),
      );
      const entry = projected.importers[location];
      for (const field of runtimeFields)
        assert.deepEqual(
          manifest[field] ?? {},
          Object.fromEntries(
            Object.entries(entry[field] ?? {}).map(([name, { specifier }]) => [
              name,
              specifier,
            ]),
          ),
          `Stale lockfile: ${location} ${field}`,
        );
      await mkdir(path.join(temporary, location), { recursive: true });
      await writeFile(
        path.join(temporary, location, 'package.json'),
        JSON.stringify({
          name: manifest.name,
          version: manifest.version,
          private: true,
          ...Object.fromEntries(
            runtimeFields
              .filter((field) => manifest[field])
              .map((field) => [field, manifest[field]]),
          ),
        }),
      );
    }
    await writeFile(
      path.join(temporary, 'package.json'),
      JSON.stringify({ name: 'justgo-api-production-audit', private: true }),
    );
    await writeFile(
      path.join(temporary, 'pnpm-workspace.yaml'),
      yaml.dump({ packages: workspaces }),
    );
    await writeFile(
      path.join(temporary, 'pnpm-lock.yaml'),
      yaml.dump(projected, { lineWidth: -1 }),
    );
    console.log(
      `Auditing API production lock: ${Object.keys(projected.snapshots).length} locked entries`,
    );
    return await audit(temporary);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
  );
  process.exitCode = await auditApiDependencies(root);
}
