import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactX from 'eslint-plugin-react-x';
import testingLibrary from 'eslint-plugin-testing-library';
import globals from 'globals';
import importBoundaries from './scripts/quality/import-boundaries.mjs';
import rlsContext from './scripts/quality/rls-context.mjs';

const justgo = {
  rules: { 'import-boundaries': importBoundaries, 'rls-context': rlsContext },
};

const outboundFetchFix =
  'Send requests through outboundFetch() from apps/api/src/http/outbound-fetch.ts. It keeps redirects manual so credentials never follow a Location, and fails a 3xx as UNAVAILABLE unread.';
const ownerTransactionCallback =
  'CallExpression[callee.property.name=/^(withSession|withAccountDeletion|transaction)$/] > :function';
const ownerTransactionFix =
  'Query only through the tx this callback receives. Another connection or pool has none of the transaction-local owner context, so RLS hides the owner rows, and a second checkout can deadlock a one-connection pool. Use rateLimitAccount(tx, ...) for an account rate limit, and run other transactions before or after this one.';
const requestPackages = [
  'undici',
  'node-fetch',
  'cross-fetch',
  'http',
  'https',
  'node:http',
  'node:https',
].map((name) => ({ name, message: outboundFetchFix }));
const requestPatterns = [{ group: ['undici/*'], message: outboundFetchFix }];
const randomSecretFix =
  'Generate secrets with randomSecretHex() from apps/mobile/src/app-support/identity/random-secret.ts. getRandomBytes falls back to Math.random in development.';
const randomBytesBan = {
  name: 'expo-crypto',
  importNames: ['getRandomValues', 'getRandomBytes', 'getRandomBytesAsync'],
  message: randomSecretFix,
};
const everyMobileFileBans = [
  {
    name: 'react-native-safe-area-context',
    importNames: ['SafeAreaProvider'],
    message:
      'Expo Router owns the safe-area provider. Read insets with SafeAreaView or useSafeAreaInsets(). Router 58 reports zero web safe-area metrics, so do not add a web provider to force measurements.',
  },
  {
    name: 'zustand/middleware',
    importNames: ['persist', 'createJSONStorage'],
    message:
      'Keep Zustand stores in memory. Persist state through its owner in apps/mobile/src/data, because persist middleware writes storage outside the saving, sync and deletion rules.',
  },
];
const mobileImportBans = [...everyMobileFileBans, randomBytesBan];
const cryptoPropertyBans = ['globalThis', 'global', 'window', 'self'].map(
  (object) => ({ object, property: 'crypto', message: randomSecretFix }),
);
const dayEntryListFix =
  "Keep DayEntryList's batched ScrollView. Expanding an animated row breaks FlatList's estimated offsets, and FlatList then mounts every row.";
const accountKeyFix =
  "Build query keys with accountKey() from apps/mobile/src/lib/network/account-client.ts, or a variable that holds one, so each key starts with ['account', userId]. An unscoped key serves one account's cached data to another.";
// An identifier, a string or a template with no expressions can name a key or method.
const namedBy = (path, pattern) =>
  [
    `[${path}.name=${pattern}]`,
    `[${path}.value=${pattern}]`,
    `[${path}.expressions.length=0][${path}.quasis.0.value.cooked=${pattern}]`,
  ].join(', ');
const scopedKey = (path) =>
  `:not([${path}.type='Identifier'], [${path}.callee.name='accountKey'], [${path}.elements.0.argument.callee.name='accountKey'])`;
const mobileSyntaxBans = [
  {
    selector: `Property:matches(${namedBy('key', "'queryKey'")})${scopedKey('value')}`,
    message: accountKeyFix,
  },
  {
    selector: `CallExpression:matches(${namedBy(
      'callee.property',
      '/^(getQueryData|getQueryDefaults|getQueryState|setQueryData|setQueryDefaults)$/',
    )})${scopedKey('arguments.0')}`,
    message: accountKeyFix,
  },
  {
    selector: 'ImportExpression',
    message:
      'Load modules with a static import or a literal require(). In development, import() fetches a separate split bundle, so opening saved data can fail on that request.',
  },
];
const coordinatedDataOperations =
  '/^(clearData|erase|restoreJournal|mergeCompletions|mergeSyncedJournal|observeDataEpoch|withDataMigration)$/';
const routeAndFeatureSyntaxBans = [
  ...mobileSyntaxBans,
  ...[
    `MemberExpression[property.name=${coordinatedDataOperations}]`,
    `ObjectPattern > Property[key.name=${coordinatedDataOperations}]`,
    `Literal[value=${coordinatedDataOperations}]:not(TSLiteralType > Literal)`,
    `TemplateLiteral[expressions.length=0][quasis.0.value.cooked=${coordinatedDataOperations}]`,
  ].map((selector) => ({
    selector,
    message:
      'Clear or replace local data only through ActivityRuntime.deleteAllData() or ActivityRuntime.importData(). They stop sync, keep the delete-all intent and check the account first, so a direct call can lose data or let sync bring deleted data back.',
  })),
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/ios/**',
      '**/android/**',
      '.local/**',
      '.vercel/**',
      'design/source/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['scripts/**/*.mjs'],
    ignores: ['scripts/quality/git.mjs', 'scripts/**/*.test.mjs'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          'Literal[value=/(^|\\s)--name-(only|status)(\\s|$)/]',
          'TemplateElement[value.raw=/(^|\\s)--name-(only|status)(\\s|$)/]',
        ].map((selector) => ({
          selector,
          message:
            'Read changed paths with changedPaths() from scripts/quality/git.mjs, which always uses -z --no-renames.',
        })),
        ...[
          'Literal[value=/^patch-id$|(^|\\s)--stable(\\s|$)|git patch-id/]',
          'TemplateElement[value.raw=/(^|\\s)--stable(\\s|$)|git patch-id/]',
        ].map((selector) => ({
          selector,
          message:
            'Hash a diff with patchIdOf() from scripts/quality/git.mjs, which always uses --verbatim.',
        })),
      ],
    },
  },
  {
    files: ['apps/api/src/**/*.{ts,mts,cts}'],
    ignores: ['apps/api/src/db/transaction-context.ts'],
    plugins: { justgo },
    rules: { 'justgo/rls-context': 'error' },
  },
  {
    files: ['apps/api/src/**/*.{ts,mts,cts}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          `${ownerTransactionCallback} MemberExpression[property.name=/^(db|pool|rateLimit|withSession|withAccountDeletion)$/]`,
          `${ownerTransactionCallback} MemberExpression[object.name=/^(db|pool|database)$/]`,
        ].map((selector) => ({ selector, message: ownerTransactionFix })),
      ],
    },
  },
  {
    files: [
      'apps/**/*.{ts,tsx,mts,cts}',
      'packages/contracts/**/*.{ts,tsx,mts,cts}',
    ],
    plugins: { justgo },
    rules: { 'justgo/import-boundaries': 'error' },
  },
  {
    files: ['apps/api/src/**/*.{ts,tsx,mts,cts}'],
    ignores: ['apps/api/src/http/outbound-fetch.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['fetch', 'global', 'globalThis', 'self', 'window'].map((name) => ({
          name,
          message: `${outboundFetchFix} Name other globals directly, not through the global object.`,
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: requestPackages,
          patterns: [
            ...requestPatterns,
            {
              group: ['@supabase/*'],
              message:
                "Pass global: { fetch: outboundFetch(transport) } to createClient as apps/api/src/identity/managed-deletion.ts does, then allow the file in eslint.config.mjs. The SDK's default fetch follows a redirect and resends apikey to the Location.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/identity/managed-deletion.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: requestPackages, patterns: requestPatterns },
      ],
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Metro assets, Jest factories and the guarded preview use literal requires.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: [
      'apps/mobile/src/app-support/identity/random-secret.ts',
      '**/*.test.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', { paths: mobileImportBans }],
      'no-restricted-globals': [
        'error',
        { name: 'crypto', message: randomSecretFix },
      ],
      'no-restricted-properties': ['error', ...cryptoPropertyBans],
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...mobileSyntaxBans] },
  },
  {
    files: [
      'apps/mobile/src/features/**/*.{ts,tsx}',
      'apps/mobile/src/app/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...routeAndFeatureSyntaxBans] },
  },
  {
    files: ['apps/mobile/src/app-support/identity/random-secret.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: everyMobileFileBans }],
    },
  },
  {
    files: ['apps/mobile/src/features/progress/day-details/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...mobileImportBans,
            ...['react-native', 'react-native-gesture-handler'].map((name) => ({
              name,
              importNames: ['FlatList'],
              message: dayEntryListFix,
            })),
          ],
        },
      ],
      // Reanimated and react-native also expose FlatList as Animated.FlatList.
      'no-restricted-properties': [
        'error',
        ...cryptoPropertyBans,
        { property: 'FlatList', message: dayEntryListFix },
      ],
    },
  },
  {
    files: ['apps/mobile/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    plugins: { 'react-x': reactX },
    rules: {
      'react-x/no-missing-key': 'error',
      'react-x/no-duplicate-key': 'error',
      'react-x/no-nested-component-definitions': 'error',
      'react-x/no-leaked-conditional-rendering': 'error',
    },
  },
  {
    files: ['apps/mobile/src/**/*.test.{ts,tsx}'],
    plugins: { 'testing-library': testingLibrary },
    settings: {
      'testing-library/utils-module': '@testing-library/react-native',
      // Renderer findByType/findAllByType are synchronous, not custom async queries.
      'testing-library/custom-queries': 'off',
    },
    rules: {
      'testing-library/await-async-queries': 'error',
      'testing-library/await-async-utils': 'error',
      'testing-library/no-await-sync-queries': 'error',
      'testing-library/no-promise-in-fire-event': 'error',
    },
  },
  {
    files: [
      'apps/*/src/**/*.{ts,tsx,mts,cts}',
      'packages/contracts/src/**/*.{ts,mts,cts}',
    ],
    ignores: ['**/*.test.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'error',
      '@typescript-eslint/no-deprecated': [
        'error',
        {
          // react-native-svg types mark Rect geometry x and y with the
          // deprecation of the same-named transform shorthand. A JSX
          // attribute can be allowed only by name, so the shorthand passes too.
          allow: ['x', 'y'],
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
);
