import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const workspaceBoundaries = {
  patterns: [
    {
      group: ['@justgo/contracts/**', '**/packages/contracts/**'],
      message: 'Import shared contracts through @justgo/contracts.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/ios/**',
      '**/android/**',
      '.local/**',
      '.vercel/**',
      'docs/design-source/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-require-imports': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@justgo/api',
              message: 'Mobile cannot import API implementation.',
            },
          ],
          patterns: [
            ...workspaceBoundaries.patterns,
            {
              group: ['@justgo/api/**', '**/apps/api/**', '**/api/src/**'],
              message: 'Mobile cannot import API implementation.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/mobile/src/{components,lib,theme,platform}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@justgo/api',
              message: 'Mobile cannot import API implementation.',
            },
          ],
          patterns: [
            ...workspaceBoundaries.patterns,
            {
              group: ['@justgo/api/**', '**/apps/api/**', '**/api/src/**'],
              message: 'Mobile cannot import API implementation.',
            },
            {
              group: ['**/features/**'],
              message: 'Shared mobile code cannot import feature code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@justgo/mobile',
              message: 'The API cannot import mobile code.',
            },
          ],
          patterns: [
            ...workspaceBoundaries.patterns,
            {
              group: [
                '@justgo/mobile/**',
                '**/apps/mobile/**',
                '**/mobile/src/**',
              ],
              message: 'The API cannot import mobile code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/contracts/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@justgo/api',
              message: 'Shared contracts cannot import app implementation.',
            },
            {
              name: '@justgo/mobile',
              message: 'Shared contracts cannot import app implementation.',
            },
          ],
          patterns: [
            {
              group: [
                '@justgo/api/**',
                '@justgo/mobile/**',
                '**/apps/api/**',
                '**/apps/mobile/**',
                '**/api/src/**',
                '**/mobile/src/**',
              ],
              message: 'Shared contracts cannot import app implementation.',
            },
          ],
        },
      ],
    },
  },
);
