import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: root });

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
];

for (const fixture of cases) {
  test(fixture.name, async () => {
    const [result] = await eslint.lintText(fixture.source, {
      filePath: path.join(root, fixture.file),
    });
    assert.ok(result, `No ESLint result for ${fixture.file}`);
    const violations = result.messages.filter(
      (message) => message.ruleId === 'no-restricted-imports',
    );
    assert.equal(
      violations.length > 0,
      fixture.restricted,
      `${fixture.file}: ${fixture.source}\n${JSON.stringify(result.messages)}`,
    );
  });
}
