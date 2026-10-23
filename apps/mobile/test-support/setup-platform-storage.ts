// Platform storage is controllable in component tests; native persistence still
// requires separate device evidence. Tests may replace this driver for failures.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
