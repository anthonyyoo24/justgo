import path from 'node:path';
import {
  journeyEnvironment,
  journeyApiUrl,
} from '../../e2e/support/environment.ts';
import sentryMetro from '@sentry/react-native/metro.js';
const { getSentryExpoConfig } = sentryMetro;
const configRoot = import.meta.dirname;
const config = getSentryExpoConfig(configRoot, {
  annotateReactComponents: false,
  includeWebReplay: false,
  enableSourceContextInDevelopment: false,
  injectReleaseForWeb: false,
});

// Fault injection belongs to the isolated journey build, never app source or a
// production bundle. Validate its database/environment before enabling it.
if (process.env.JUSTGO_JOURNEY_FIXTURES === '1') {
  journeyEnvironment(process.env);
  if (process.env.EXPO_PUBLIC_API_URL !== journeyApiUrl)
    throw new Error('Journey fixtures require the isolated loopback API URL');
  const normalResolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web' && moduleName === 'expo/virtual/env')
      return {
        type: 'sourceFile',
        filePath: path.join(configRoot, 'test-support/journey-environment.ts'),
      };
    if (
      platform === 'web' &&
      context.originModulePath ===
        path.join(configRoot, 'src/app-support/providers/AppProvider.tsx') &&
      moduleName === '../../data/activity/persistence/storage'
    ) {
      return {
        type: 'sourceFile',
        filePath: path.join(configRoot, 'test-support/journey-storage.ts'),
      };
    }
    return normalResolve
      ? normalResolve(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}
export default config;
