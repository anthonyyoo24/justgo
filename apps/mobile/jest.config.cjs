module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [
    '<rootDir>/test-support/setup-platform-storage.ts',
    '<rootDir>/test-support/setup-global-local-journal.ts',
  ],
  maxWorkers: process.env.CI ? 2 : 1,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: '../../coverage/mobile',
  coverageReporters: ['text-summary', 'json-summary', 'lcov', 'html'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@sentry/react-native$': '<rootDir>/test-support/sentry-sdk.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Hoisted Expo Router tests must use this workspace's installed renderer.
    '^@testing-library/react-native$':
      require.resolve('@testing-library/react-native'),
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?(?:-.*)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-router|standard-navigation|react-navigation|@react-navigation/.*|react-native-svg|@justgo/contracts)/)',
  ],
};
