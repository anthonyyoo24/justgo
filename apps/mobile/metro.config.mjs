import path from 'node:path';
import { journeyEnvironment } from '../../e2e/support/environment.ts';
import metroConfig from 'expo/metro-config.js';
const { getDefaultConfig } = metroConfig;
const configRoot = import.meta.dirname;
const config = getDefaultConfig(configRoot);

// Fault injection belongs to the isolated journey build, never app source or a
// production bundle. Validate its database/environment before enabling it.
if (process.env.JUSTGO_JOURNEY_FIXTURES === '1') {
  journeyEnvironment(process.env);
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (
      platform === 'web' &&
      context.originModulePath ===
        path.join(configRoot, 'src/app-support/providers/AppProvider.tsx') &&
      moduleName === '../../data/activity/storage'
    ) {
      return {
        type: 'sourceFile',
        filePath: path.join(configRoot, 'test-support/journey-storage.ts'),
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}
export default config;
