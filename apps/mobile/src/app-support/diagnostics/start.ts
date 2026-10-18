import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { diagnosticConfiguration } from './configuration';
import { createErrorReporter } from './reporter';

export const errorReporter = createErrorReporter(Sentry);
const config = diagnosticConfiguration(
  process.env.EXPO_PUBLIC_SENTRY_ENABLED,
  process.env.EXPO_PUBLIC_SENTRY_DSN,
  process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
);
if (config)
  errorReporter.initialize(config, {
    version: Constants.expoConfig?.version ?? 'unknown',
    ...(Constants.nativeBuildVersion
      ? { build: Constants.nativeBuildVersion }
      : {}),
    os: Platform.OS === 'ios' ? 'ios' : 'web',
    osVersion: String(Platform.Version ?? 'unknown'),
    environment: config.environment,
  });
