module.exports = {
  preset: 'jest-expo',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: '../../coverage/mobile',
  coverageReporters: ['text-summary', 'json-summary', 'lcov', 'html'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?(?:-.*)?|@expo(nent)?/.*|@expo-google-fonts/.*|expo-router|react-navigation|@react-navigation/.*|react-native-svg|@justgo/contracts)/)',
  ],
};
