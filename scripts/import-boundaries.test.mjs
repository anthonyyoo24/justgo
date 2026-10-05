import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Virtual paths need syntax rules only; promise-rule tests use a real TS project below.
const eslint = new ESLint({
  cwd: root,
  overrideConfig: [
    {
      languageOptions: { parserOptions: { projectService: false } },
      rules: {
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/await-thenable': 'off',
      },
    },
  ],
});

const cases = [
  {
    name: 'shared component cannot import a feature',
    file: 'apps/mobile/src/components/BoundaryFixture.tsx',
    source: "import '../features/challenges/ChallengeScreen';",
    restricted: true,
  },
  {
    name: 'shared library cannot re-export a feature',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "export * from '../features/identity/vault';",
    restricted: true,
  },
  {
    name: 'mobile cannot import API source',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: "import '../../../../api/src/db/client';",
    restricted: true,
  },
  {
    name: 'mobile cannot import the API package',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: "import '@justgo/api';",
    restricted: true,
  },
  {
    name: 'API cannot import mobile source',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source: "import '../../../mobile/src/lib/http';",
    restricted: true,
  },
  {
    name: 'apps cannot deep-import contracts',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source: "import '@justgo/contracts/src/identity';",
    restricted: true,
  },
  {
    name: 'apps cannot import contracts by relative path',
    file: 'apps/mobile/src/features/identity/BoundaryFixture.ts',
    source: "import '../../../../../packages/contracts/src/identity';",
    restricted: true,
  },
  {
    name: 'API cannot import contracts by relative path',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source: "import '../../../../packages/contracts/src/identity';",
    restricted: true,
  },
  {
    name: 'contracts cannot import app implementation',
    file: 'packages/contracts/src/BoundaryFixture.ts',
    source: "import '../../../apps/api/src/identity/service';",
    restricted: true,
  },
  {
    name: 'features may import shared code',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: "import '../../lib/account-client';",
    restricted: false,
  },
  {
    name: 'shell may compose features',
    file: 'apps/mobile/src/features/shell/BoundaryFixture.ts',
    source: "import '../challenges/controller';",
    restricted: false,
  },
  {
    name: 'apps may import the contracts root',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source: "import '@justgo/contracts';",
    restricted: false,
  },
  {
    name: 'data cannot import a feature',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '../../features/challenges/controller';",
    restricted: true,
  },
  {
    name: 'data cannot re-export a route',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "export * from '../../app/reflection';",
    restricted: true,
  },
  {
    name: 'data cannot import a UI component',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '../../components/Screen';",
    restricted: true,
  },
  {
    name: 'data cannot import UI theme',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '../../theme/tokens';",
    restricted: true,
  },
  {
    name: 'shared library cannot re-export data',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "export * from '../data/activity/repository';",
    restricted: true,
  },
  {
    name: 'shared component cannot import data',
    file: 'apps/mobile/src/components/BoundaryFixture.tsx',
    source: "import '../data/activity/repository';",
    restricted: true,
  },
  {
    name: 'features may import activity data',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "import '../../data/activity/repository';",
    restricted: false,
  },
  {
    name: 'data may import shared infrastructure',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '../../lib/account-client';",
    restricted: false,
  },
  {
    name: 'data may import native adapters',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '../../platform/storage';",
    restricted: false,
  },
  {
    name: 'data may import public contracts',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '@justgo/contracts';",
    restricted: false,
  },
];

const loadingCases = cases.flatMap((fixture) => {
  const specifier = fixture.source.match(/['"]([^'"]+)['"]/)[1];
  return [
    {
      ...fixture,
      name: `${fixture.name} with import()`,
      source: `void import('${specifier}');`,
    },
    {
      ...fixture,
      name: `${fixture.name} with require()`,
      source: `require('${specifier}');`,
    },
  ];
});
cases.push(
  ...loadingCases,
  {
    name: 'preview may require another feature',
    file: 'apps/mobile/src/app/BoundaryFixture.tsx',
    source: "require('../features/shell/ScreenPreview');",
    restricted: false,
  },
  {
    name: 'feature may require artwork',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.tsx',
    source: "require('../../../assets/challenges/streets.png');",
    restricted: false,
  },
  {
    name: 'Jest factories may require native components',
    file: 'apps/mobile/src/components/BoundaryFixture.test.tsx',
    source: "require('react-native');",
    restricted: false,
  },
  {
    name: 'literal template import cannot bypass boundaries',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: 'void import(`../features/identity/vault`);',
    restricted: true,
  },
  {
    name: 'workspace package paths cannot bypass the shared-feature boundary',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "require('@justgo/mobile/src/features/identity/vault');",
    restricted: true,
  },
  {
    name: 'normalized traversal cannot bypass boundaries',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "require('../components/../features/identity/vault');",
    restricted: true,
  },
  {
    name: 'computed loader paths must be made reviewable',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "const name = '../features/identity/vault'; require(name);",
    restricted: true,
  },
  {
    name: 'TypeScript import assignment cannot bypass boundaries',
    file: 'apps/api/src/BoundaryFixture.ts',
    source: "import mobile = require('@justgo/mobile'); export { mobile };",
    restricted: true,
  },
  {
    name: 'workspace package paths cannot bypass the data-feature boundary',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "require('@justgo/mobile/src/features/identity/vault');",
    restricted: true,
  },
  {
    name: 'workspace package paths cannot bypass the shared-data boundary',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "import '@justgo/mobile/src/data/activity/repository';",
    restricted: true,
  },
  {
    name: 'normalized traversal cannot bypass the data-UI boundary',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "require('../../lib/../components/Screen');",
    restricted: true,
  },
  {
    name: 'named re-exports cannot bypass the data-feature boundary',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source:
      "export { IdentityController } from '../../features/identity/controller';",
    restricted: true,
  },
  {
    name: 'feature directory entrypoints cannot bypass shared boundaries',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "import '../features';",
    restricted: true,
  },
  {
    name: 'data directory entrypoints cannot bypass shared boundaries',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "import '../data';",
    restricted: true,
  },
  {
    name: 'feature directory entrypoints cannot bypass data boundaries',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '../../features';",
    restricted: true,
  },
);

for (const fixture of cases) {
  test(fixture.name, async () => {
    const [result] = await eslint.lintText(fixture.source, {
      filePath: path.join(root, fixture.file),
    });
    assert.ok(result, `No ESLint result for ${fixture.file}`);
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    const violations = result.messages.filter(
      (message) => message.ruleId === 'justgo/import-boundaries',
    );
    assert.equal(
      violations.length > 0,
      fixture.restricted,
      `${fixture.file}: ${fixture.source}\n${JSON.stringify(result.messages)}`,
    );
  });
}

const typedEslint = new ESLint({ cwd: root });
for (const [name, source, expected] of [
  [
    'floating promise',
    'Promise.resolve(1);',
    '@typescript-eslint/no-floating-promises',
  ],
  [
    'promise used as a condition',
    'if (Promise.resolve(true)) {}',
    '@typescript-eslint/no-misused-promises',
  ],
  [
    'async callback in a void handler',
    'const run = (callback: () => void) => callback(); run(async () => {});',
    '@typescript-eslint/no-misused-promises',
  ],
  [
    'awaiting a non-promise',
    'async function run() { await 1; } void run();',
    '@typescript-eslint/await-thenable',
  ],
  [
    'explicit handled background work',
    'void Promise.resolve(1).catch(() => {});',
    null,
  ],
]) {
  test(`promise lint: ${name}`, async () => {
    const [result] = await typedEslint.lintText(source, {
      filePath: path.join(root, 'apps/mobile/src/lib/http.ts'),
    });
    assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
    const promiseErrors = result.messages.filter((item) =>
      [
        '@typescript-eslint/no-floating-promises',
        '@typescript-eslint/no-misused-promises',
        '@typescript-eslint/await-thenable',
      ].includes(item.ruleId),
    );
    assert.deepEqual(
      promiseErrors.map((item) => item.ruleId),
      expected ? [expected] : [],
    );
  });
}
