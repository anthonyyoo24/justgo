import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactX from 'eslint-plugin-react-x';
import testingLibrary from 'eslint-plugin-testing-library';
import globals from 'globals';
import importBoundaries from './scripts/quality/import-boundaries.mjs';

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
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/db/transaction-context.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          'Literal[value=/set_config|(^|;)\\s*set\\s/i]',
          'TemplateElement[value.raw=/set_config|(^|;)\\s*set\\s/i]',
        ].map((selector) => ({
          selector,
          message:
            'Set RLS context with setTransactionContext() from apps/api/src/db/transaction-context.ts. A session-level SET or set_config(..., false) leaks one owner into the next request on a pooled connection.',
        })),
      ],
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/contracts/**/*.{ts,tsx}'],
    plugins: { justgo: { rules: { 'import-boundaries': importBoundaries } } },
    rules: { 'justgo/import-boundaries': 'error' },
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
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/contracts/src/**/*.ts'],
    ignores: ['**/*.test.{ts,tsx}'],
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
