import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
// Virtual paths need syntax rules only; typed-rule tests use a real TS project.
const eslint = new ESLint({
  cwd: root,
  overrideConfig: [
    {
      languageOptions: { parserOptions: { projectService: false } },
      rules: {
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',
        '@typescript-eslint/await-thenable': 'off',
        '@typescript-eslint/switch-exhaustiveness-check': 'off',
        '@typescript-eslint/only-throw-error': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-deprecated': 'off',
      },
    },
  ],
});

const cases = [
  {
    name: 'API may import the separate OpenAPI entry',
    file: 'apps/api/src/build-app.ts',
    source: "import '@justgo/contracts/openapi';",
    restricted: false,
  },
  {
    name: 'mobile cannot import the OpenAPI entry',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "import '@justgo/contracts/openapi';",
    restricted: true,
  },
  {
    name: 'shared component cannot import a feature',
    file: 'apps/mobile/src/components/BoundaryFixture.tsx',
    source: "import '../features/challenges/ChallengeScreen';",
    restricted: true,
  },
  {
    name: 'shared library cannot re-export a feature',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "export * from '../features/challenges/controller';",
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
    source: "import '../../../mobile/src/lib/network/http';",
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
    file: 'apps/mobile/src/app-support/identity/BoundaryFixture.ts',
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
    source: "import '../../lib/network/account-client';",
    restricted: false,
  },
  {
    name: 'app-support may compose features',
    file: 'apps/mobile/src/app-support/providers/BoundaryFixture.ts',
    source: "import '../../features/challenges/controller';",
    restricted: false,
  },
  {
    name: 'features may consume app-support providers',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: "import '../../app-support/providers/AppProvider';",
    restricted: false,
  },
  {
    name: 'app-support providers may compose account support',
    file: 'apps/mobile/src/app-support/providers/BoundaryFixture.ts',
    source: "import '../identity/vault';",
    restricted: false,
  },
  {
    name: 'data cannot import account support',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '../../app-support/identity/controller';",
    restricted: true,
  },
  {
    name: 'shared component cannot import app-support',
    file: 'apps/mobile/src/components/BoundaryFixture.tsx',
    source: "import '../app-support/providers/AppProvider';",
    restricted: true,
  },
  {
    name: 'shared library cannot re-export app-support',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "export * from '../app-support/access/AccessScreen';",
    restricted: true,
  },
  {
    name: 'shared component cannot import a route',
    file: 'apps/mobile/src/components/BoundaryFixture.tsx',
    source: "import '../app/settings';",
    restricted: true,
  },
  {
    name: 'data cannot import app-support',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '../../app-support/providers/AppProvider';",
    restricted: true,
  },
  {
    name: 'data cannot import developer previews',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '../../dev/previews/ScreenPreview';",
    restricted: true,
  },
  {
    name: 'app-support cannot import route implementations',
    file: 'apps/mobile/src/app-support/providers/BoundaryFixture.ts',
    source: "import '../../app/settings';",
    restricted: true,
  },
  ...[
    'apps/mobile/src/app-support/identity/auth/BoundaryFixture.ts',
    'apps/mobile/src/data/journal/BoundaryFixture.ts',
    'apps/mobile/src/features/reflections/BoundaryFixture.ts',
  ].map((file) => ({
    name: `${file.split('/').slice(3, -1).join('/')} cannot depend on diagnostics delivery`,
    file,
    source: `import { errorReporter } from '${path.posix.relative(path.posix.dirname(file), 'apps/mobile/src/app-support/diagnostics/start')}';`,
    restricted: true,
    fix: 'never depend on diagnostics delivery',
  })),
  {
    name: 'the route fallback may report errors',
    file: 'apps/mobile/src/app-support/fallbacks/BoundaryFixture.tsx',
    source: "import { errorReporter } from '../diagnostics/start';",
    restricted: false,
  },
  {
    name: 'production feature cannot import developer previews',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: "import '../../dev/previews/ScreenPreview';",
    restricted: true,
  },
  {
    name: 'app-support cannot import developer previews',
    file: 'apps/mobile/src/app-support/providers/BoundaryFixture.ts',
    source: "import '../../dev/previews/ScreenPreview';",
    restricted: true,
  },
  {
    name: 'ordinary routes cannot load developer previews',
    file: 'apps/mobile/src/app/BoundaryFixture.tsx',
    source: "import '../dev/previews/ScreenPreview';",
    restricted: true,
  },
  {
    name: 'guarded preview route may load developer previews',
    file: 'apps/mobile/src/app/preview.tsx',
    source: "import '../dev/previews/ScreenPreview';",
    restricted: false,
  },
  {
    name: 'developer previews may compose feature presentation',
    file: 'apps/mobile/src/dev/previews/BoundaryFixture.tsx',
    source: "import './challenges/DeckPreview';",
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
    source: "export * from '../../app/(challenge)/reflection';",
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
    name: 'features cannot import journal storage',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "import '../../data/journal/storage';",
    restricted: true,
    fix: 'AccountRepository or ActivityRuntime',
  },
  {
    name: 'features cannot import the journal entrypoint',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "import '../../data/journal';",
    restricted: true,
    fix: 'AccountRepository or ActivityRuntime',
  },
  {
    name: 'features cannot import activity persistence',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "import '../../data/activity/persistence/storage';",
    restricted: true,
    fix: 'AccountRepository or ActivityRuntime',
  },
  {
    name: 'features cannot import the activity sync sender',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "import '../../data/activity/sync/sender';",
    restricted: true,
    fix: 'AccountRepository or ActivityRuntime',
  },
  {
    name: 'features cannot re-export the cloud coordinator',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "export * from '../../data/cloud/coordinator';",
    restricted: true,
    fix: 'AccountRepository or ActivityRuntime',
  },
  {
    name: 'workspace package paths cannot bypass the feature-data boundary',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "import '@justgo/mobile/src/data/journal/storage';",
    restricted: true,
    fix: 'AccountRepository or ActivityRuntime',
  },
  {
    name: 'features may read progress',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "import '../../data/activity/progress/progress';",
    restricted: false,
  },
  {
    name: 'features may use the backup formats',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "import '../../data/backup/data-backup';",
    restricted: false,
  },
  {
    name: 'feature tests may import data internals',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.test.ts',
    source: "import '../../data/activity/private-journal';",
    restricted: false,
  },
  {
    name: 'the activity runtime cannot import AppProvider',
    file: 'apps/mobile/src/app-support/providers/activity-runtime.ts',
    source: "import './AppProvider';",
    restricted: true,
    fix: 'Pass the runtime as a prop',
  },
  {
    name: 'shared activity hooks cannot import AppProvider',
    file: 'apps/mobile/src/app-support/providers/activity-hooks.ts',
    source: "import './AppProvider';",
    restricted: true,
    fix: 'Pass the runtime as a prop',
  },
  {
    name: 'account support that AppProvider composes cannot import AppProvider',
    file: 'apps/mobile/src/app-support/identity/controller.ts',
    source: "import '../providers/AppProvider';",
    restricted: true,
    fix: 'Pass the runtime as a prop',
  },
  {
    name: 'a feature controller that AppProvider composes cannot import AppProvider',
    file: 'apps/mobile/src/features/challenges/controller.ts',
    source: "import '../../app-support/providers/AppProvider';",
    restricted: true,
    fix: 'Pass the runtime as a prop',
  },
  {
    name: 'account screens outside the composition may import AppProvider',
    file: 'apps/mobile/src/app-support/identity/account/ManagedAccountScreen.tsx',
    source: "import '../../providers/AppProvider';",
    restricted: false,
  },
  {
    name: 'provider tests may import AppProvider',
    file: 'apps/mobile/src/app-support/providers/AppProvider.test.tsx',
    source: "import './AppProvider';",
    restricted: false,
  },
  {
    name: 'data may import shared infrastructure',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "import '../../lib/network/account-client';",
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
  {
    name: 'dot-slash traversal cannot bypass the mobile-API boundary',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: "import './../../../../api/src/db/client';",
    restricted: true,
  },
  {
    name: 'dot-slash traversal cannot bypass the API-mobile boundary',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source: "import './../../../mobile/src/lib/network/http';",
    restricted: true,
  },
  {
    name: 'dot-slash traversal cannot bypass the contracts-app boundary',
    file: 'packages/contracts/src/BoundaryFixture.ts',
    source: "import './../../../apps/api/src/identity/service';",
    restricted: true,
  },
  {
    name: 'dot-slash traversal cannot bypass the public-contract entrypoint',
    file: 'apps/mobile/src/app-support/identity/BoundaryFixture.ts',
    source: "import './../../../../../packages/contracts/src/identity';",
    restricted: true,
  },
  {
    name: 'dot-slash star re-exports cannot bypass shared boundaries',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "export * from './../app-support/identity/vault';",
    restricted: true,
  },
  {
    name: 'dot-slash named re-exports cannot bypass data boundaries',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source:
      "export { controller } from './../../features/challenges/controller';",
    restricted: true,
  },
  {
    name: 'API services outside identity cannot set RLS context',
    file: 'apps/api/src/data-sync/BoundaryFixture.ts',
    source:
      "import { setTransactionContext } from '../db/transaction-context.js';",
    restricted: true,
  },
  {
    name: 'identity services may set RLS context',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "import { setTransactionContext } from '../db/transaction-context.js';",
    restricted: false,
    loadedRestricted: true,
  },
  {
    name: 'a package self-reference cannot bypass the RLS context boundary',
    file: 'apps/api/src/data-sync/BoundaryFixture.ts',
    source:
      "import { setTransactionContext } from '@justgo/api/src/db/transaction-context.js';",
    restricted: true,
  },
  {
    name: 'API source cannot import test fixtures',
    file: 'apps/api/src/data-sync/BoundaryFixture.ts',
    source: "import { withOwner } from '../../tests/db/fixtures/owner.js';",
    restricted: true,
  },
  {
    name: 'API source cannot load modules through createRequire',
    file: 'apps/api/src/data-sync/BoundaryFixture.ts',
    source: "import { createRequire } from 'node:module';",
    restricted: true,
  },
  {
    name: 'shared code may import a sibling with dot-slash',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "import './account-client';",
    restricted: false,
  },
  {
    name: 'features may import shared code with dot-slash traversal',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: "import './../../lib/network/account-client';",
    restricted: false,
  },
  {
    name: 'only the managed-session adapter may load SecureStore',
    file: 'apps/mobile/src/app-support/identity/auth/BoundaryFixture.ts',
    source: "import * as SecureStore from 'expo-secure-store';",
    restricted: true,
  },
  {
    name: 'the managed-session adapter loads SecureStore',
    file: 'apps/mobile/src/platform/auth/auth-storage.ts',
    source: "import * as SecureStore from 'expo-secure-store';",
    restricted: false,
  },
  // #241: no-restricted-imports cannot see the names a runtime load reads.
  {
    name: 'mobile code loads expo-crypto only with a static import',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: "import { randomUUID } from 'expo-crypto';",
    restricted: false,
    loadedRestricted: true,
  },
  {
    name: 'the secret generator loads expo-crypto only with a static import',
    file: 'apps/mobile/src/app-support/identity/random-secret.ts',
    source: "import { getRandomValues } from 'expo-crypto';",
    restricted: false,
    loadedRestricted: true,
  },
  {
    name: 'mobile tests may load expo-crypto at runtime',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.test.ts',
    source: "import { randomUUID } from 'expo-crypto';",
    restricted: false,
  },
  ...[
    ["import { ScrollView } from 'react-native';", 'react-native'],
    [
      "import { SafeAreaView } from 'react-native-safe-area-context';",
      'react-native-safe-area-context',
    ],
    ["import { devtools } from 'zustand/middleware';", 'zustand/middleware'],
  ].map(([source, specifier]) => ({
    name: `mobile code loads ${specifier} only with a static import`,
    file: 'apps/mobile/src/features/progress/day-details/BoundaryFixture.tsx',
    source,
    restricted: false,
    loadedRestricted: true,
  })),
  {
    name: 'only the diagnostics modules may load the Sentry SDK',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: "import * as Sentry from '@sentry/react-native';",
    restricted: true,
    fix: 'privacy review',
  },
  {
    name: 'only the diagnostics modules may import Sentry types',
    file: 'apps/mobile/src/app-support/providers/BoundaryFixture.ts',
    source: "import type { ReactNativeOptions } from '@sentry/react-native';",
    restricted: true,
  },
  {
    name: 'only the diagnostics modules may load Sentry subpaths',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "import '@sentry/react-native/dist/js/sdk';",
    restricted: true,
  },
  ...['@sentry/core', '@sentry/react'].map((specifier) => ({
    name: `only the diagnostics modules may load ${specifier}`,
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: `import { setUser } from '${specifier}';`,
    restricted: true,
    fix: 'privacy review',
  })),
  ...['event', 'reporter', 'start', 'transport'].map((module) => ({
    name: `the diagnostics ${module} module loads the Sentry SDK`,
    file: `apps/mobile/src/app-support/diagnostics/${module}.ts`,
    source: "import * as Sentry from '@sentry/react-native';",
    restricted: false,
  })),
  ...['@sentry/core', '@sentry/react'].map((specifier) => ({
    name: `the diagnostics modules may load ${specifier}`,
    file: 'apps/mobile/src/app-support/diagnostics/start.ts',
    source: `import { setUser } from '${specifier}';`,
    restricted: false,
  })),
  {
    name: 'mobile code may re-export react-native types',
    file: 'apps/mobile/src/components/BoundaryFixture.ts',
    source: "export type { ViewStyle } from 'react-native';",
    restricted: false,
    loadedRestricted: true,
  },
  {
    name: 'mobile tests may load the Sentry SDK',
    file: 'apps/mobile/src/app-support/providers/BoundaryFixture.test.tsx',
    source: "import * as Sentry from '@sentry/react-native';",
    restricted: false,
  },
  {
    name: 'only managed auth may load the Supabase SDK',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "import { createClient } from '@supabase/supabase-js';",
    restricted: true,
    fix: 'never database tables',
  },
  {
    name: 'only managed auth may load other Supabase packages',
    file: 'apps/mobile/src/data/cloud/BoundaryFixture.ts',
    source: "import { PostgrestClient } from '@supabase/postgrest-js';",
    restricted: true,
  },
  {
    name: 'managed auth loads the Supabase SDK',
    file: 'apps/mobile/src/app-support/identity/auth/managed-auth.ts',
    source: "import { createClient } from '@supabase/supabase-js';",
    restricted: false,
  },
  {
    name: 'mobile tests may load the Supabase SDK',
    file: 'apps/mobile/src/app-support/identity/auth/BoundaryFixture.test.ts',
    source: "import { createClient } from '@supabase/supabase-js';",
    restricted: false,
  },
  ...[
    [
      'mobile code',
      'apps/mobile/src/app-support/providers/BoundaryFixture.tsx',
      "import { PostHogProvider } from 'posthog-react-native';",
    ],
    [
      'a mobile test',
      'apps/mobile/src/features/challenges/BoundaryFixture.test.tsx',
      "import PostHog from 'posthog-react-native';",
    ],
    [
      'a literal require',
      'apps/mobile/src/lib/BoundaryFixture.ts',
      "const ATT = require('expo-tracking-transparency');",
    ],
    [
      'a subpath',
      'apps/mobile/src/platform/BoundaryFixture.ts',
      "import { getAnalytics } from 'firebase/analytics';",
    ],
    [
      'API code',
      'apps/api/src/http/BoundaryFixture.ts',
      "import { Analytics } from '@segment/analytics-node';",
    ],
    [
      'a contracts re-export',
      'packages/contracts/src/BoundaryFixture.ts',
      "export type { Event } from '@amplitude/analytics-types';",
    ],
    ...[
      'react-native-fbsdk-next',
      '@microsoft/react-native-clarity',
      '@fullstory/react-native',
      '@logrocket/react-native',
      '@newrelic/react-native-agent',
      '@braze/react-native-sdk',
    ].map((sdk) => [
      `mobile code with ${sdk}`,
      'apps/mobile/src/app-support/BoundaryFixture.ts',
      `import Sdk from '${sdk}';`,
    ]),
  ].map(([where, file, source]) => ({
    name: `${where} cannot load an analytics SDK`,
    file,
    source,
    restricted: true,
    fix: 'Phase 17',
  })),
  {
    name: 'a non-analytics package subpath is not an analytics SDK',
    file: 'apps/mobile/src/platform/BoundaryFixture.ts',
    source: "import { initializeApp } from 'firebase/app';",
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
      restricted: fixture.loadedRestricted ?? fixture.restricted,
    },
    {
      ...fixture,
      name: `${fixture.name} with require()`,
      source: `require('${specifier}');`,
      restricted: fixture.loadedRestricted ?? fixture.restricted,
    },
  ];
});
cases.push(
  ...loadingCases,
  {
    name: 'absolute paths cannot bypass the mobile-API boundary',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: `import '${path.join(root, 'apps/api/src/db/client')}';`,
    restricted: true,
  },
  {
    name: 'features may import shared code with an absolute path',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: `import '${path.join(root, 'apps/mobile/src/lib/network/account-client')}';`,
    restricted: false,
  },
  {
    name: 'dot-slash template imports cannot bypass shared boundaries',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: 'void import(`./../app-support/identity/vault`);',
    restricted: true,
  },
  {
    name: 'dot-slash TypeScript import assignments cannot bypass boundaries',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "import mobile = require('./../../../mobile/src/lib/network/http'); export { mobile };",
    restricted: true,
  },
  {
    name: 'preview route may require developer previews',
    file: 'apps/mobile/src/app/preview.tsx',
    source: "require('../dev/previews/ScreenPreview');",
    restricted: false,
  },
  {
    name: 'package paths cannot bypass the shared-app-support boundary',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "require('@justgo/mobile/src/app-support/providers/AppProvider');",
    restricted: true,
  },
  {
    name: 'normalized paths cannot bypass the data-app-support boundary',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "require('../../lib/../app-support/providers/AppProvider');",
    restricted: true,
  },
  {
    name: 'app-support directory entrypoints cannot bypass shared boundaries',
    file: 'apps/mobile/src/components/BoundaryFixture.tsx',
    source: "export * from '../app-support';",
    restricted: true,
  },
  {
    name: 'developer directory entrypoints cannot bypass feature boundaries',
    file: 'apps/mobile/src/features/challenges/BoundaryFixture.ts',
    source: "require('../../dev');",
    restricted: true,
  },
  {
    name: 'app-support tests may exercise route implementations',
    file: 'apps/mobile/src/app-support/BoundaryFixture.test.tsx',
    source: "import '../app/preview';",
    restricted: false,
  },
  {
    name: 'test fixtures may load developer previews',
    file: 'apps/mobile/src/app-support/BoundaryFixture.test.tsx',
    source: "require('../dev/previews/ScreenPreview');",
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
    source: 'void import(`../app-support/identity/vault`);',
    restricted: true,
  },
  {
    name: 'workspace package paths cannot bypass the shared-account-support boundary',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "require('@justgo/mobile/src/app-support/identity/vault');",
    restricted: true,
  },
  {
    name: 'normalized traversal cannot bypass boundaries',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "require('../components/../app-support/identity/vault');",
    restricted: true,
  },
  {
    name: 'computed loader paths must be made reviewable',
    file: 'apps/mobile/src/lib/BoundaryFixture.ts',
    source: "const name = '../app-support/identity/vault'; require(name);",
    restricted: true,
  },
  {
    name: 'TypeScript import assignment cannot bypass boundaries',
    file: 'apps/api/src/BoundaryFixture.ts',
    source: "import mobile = require('@justgo/mobile'); export { mobile };",
    restricted: true,
  },
  {
    name: 'workspace package paths cannot bypass the data-account-support boundary',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source: "require('@justgo/mobile/src/app-support/identity/vault');",
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
    name: 'named re-exports cannot bypass the data-account-support boundary',
    file: 'apps/mobile/src/data/activity/BoundaryFixture.ts',
    source:
      "export { IdentityController } from '../../app-support/identity/controller';",
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
    name: 'identity cannot re-export the RLS context setter',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "export { setTransactionContext } from '../db/transaction-context.js';",
    restricted: true,
  },
  {
    name: 'identity cannot re-export all of the RLS context module',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source: "export * from '../db/transaction-context.js';",
    restricted: true,
  },
  {
    name: 'identity cannot export an imported RLS context setter',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "import { setTransactionContext } from '../db/transaction-context.js'; export { setTransactionContext };",
    restricted: true,
  },
  {
    name: 'identity cannot store the RLS context setter',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "import * as context from '../db/transaction-context.js'; export const set = context.setTransactionContext;",
    restricted: true,
  },
  {
    name: 'identity may call the RLS context setter',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "import { setTransactionContext } from '../db/transaction-context.js'; export const own = (tx: Parameters<typeof setTransactionContext>[0], id: string) => setTransactionContext(tx, 'app.user_id', id);",
    restricted: false,
  },
  // #240: binding the setter or loading it at runtime passed the reference check.
  {
    name: 'identity cannot bind the RLS context setter',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "import { setTransactionContext } from '../db/transaction-context.js'; export const bound = setTransactionContext.bind(undefined);",
    restricted: true,
  },
  {
    name: 'identity cannot bind the RLS context setter from a namespace',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "import * as context from '../db/transaction-context.js'; export const bound = context.setTransactionContext.bind(undefined);",
    restricted: true,
  },
  {
    name: 'identity cannot read the RLS context setter off import()',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "export const lazy = async () => (await import('../db/transaction-context.js')).setTransactionContext;",
    restricted: true,
  },
  {
    name: 'the guest catalog cannot read the RLS context setter off require()',
    file: 'apps/api/src/access/guest.ts',
    source:
      "export const lazy = () => require('../db/transaction-context.js').setTransactionContext;",
    restricted: true,
  },
  {
    name: 'identity cannot load the RLS context setter with an import assignment',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "import context = require('../db/transaction-context.js'); export const set = context.setTransactionContext;",
    restricted: true,
  },
  {
    name: 'identity may call the RLS context setter from a namespace',
    file: 'apps/api/src/identity/BoundaryFixture.ts',
    source:
      "import * as context from '../db/transaction-context.js'; export const own = (tx: never, id: string) => context.setTransactionContext(tx, 'app.user_id', id);",
    restricted: false,
  },
  {
    name: 'API tests may import the RLS context setter',
    file: 'apps/api/tests/db/fixtures/BoundaryFixture.ts',
    source:
      "import { setTransactionContext } from '../../../src/db/transaction-context.js'; export { setTransactionContext };",
    restricted: false,
  },
  {
    name: 'features may import the AccountRepository type',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source:
      "import type { AccountRepository } from '../../data/activity/repository';",
    restricted: false,
  },
  {
    name: 'features cannot construct an AccountRepository',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source:
      "import { AccountRepository } from '../../data/activity/repository'; new AccountRepository();",
    restricted: true,
    fix: 'AccountRepository or ActivityRuntime',
  },
  {
    name: 'feature tests may construct an AccountRepository',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.test.ts',
    source:
      "import { AccountRepository } from '../../data/activity/repository'; new AccountRepository();",
    restricted: false,
  },
  {
    name: 'features may import the deck preferences type',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source:
      "import type { DeckPreferences } from '../../data/activity/persistence/deck-preferences';",
    restricted: false,
  },
  {
    name: 'features may import deck preferences type specifiers',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source:
      "import { type DeckPreferences } from '../../data/activity/persistence/deck-preferences';",
    restricted: false,
  },
  {
    name: 'features cannot construct deck preferences storage',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source:
      "import { DeckPreferencesStorage } from '../../data/activity/persistence/deck-preferences';",
    restricted: true,
    fix: 'AccountRepository or ActivityRuntime',
  },
  {
    name: 'features cannot import activity model types',
    file: 'apps/mobile/src/features/progress/BoundaryFixture.ts',
    source: "import type { JournalStorage } from '../../data/activity/model';",
    restricted: true,
    fix: 'AccountRepository or ActivityRuntime',
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
    if (fixture.fix)
      assert.ok(
        violations.some((message) => message.message.includes(fixture.fix)),
        JSON.stringify(violations),
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
      filePath: path.join(root, 'apps/mobile/src/lib/network/http.ts'),
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
