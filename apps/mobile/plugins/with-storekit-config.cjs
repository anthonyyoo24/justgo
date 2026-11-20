// Prebuild regenerates ios/, so the local StoreKit products for simulator
// purchases are copied in and attached to the scheme's Run action each time.
// The file joins no target, so no build ships it, and Archive ignores it.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const fileName = 'JustGO.storekit';

function attach(scheme, projectName) {
  const reference = `      <StoreKitConfigurationFileReference
         identifier = "../../${projectName}/${fileName}">
      </StoreKitConfigurationFileReference>
`;
  const withoutOld = scheme.replace(
    /[ \t]*<StoreKitConfigurationFileReference[\s\S]*?<\/StoreKitConfigurationFileReference>\n/g,
    '',
  );
  if (!withoutOld.includes('</LaunchAction>'))
    throw new Error('The iOS scheme has no LaunchAction for StoreKit testing');
  return withoutOld.replace(
    '   </LaunchAction>',
    `${reference}   </LaunchAction>`,
  );
}

function withStoreKitConfig(config, { source }) {
  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const { projectRoot, platformProjectRoot, projectName } =
        modConfig.modRequest;
      fs.copyFileSync(
        path.resolve(projectRoot, source),
        path.join(platformProjectRoot, projectName, fileName),
      );
      const schemePath = path.join(
        platformProjectRoot,
        `${projectName}.xcodeproj`,
        'xcshareddata',
        'xcschemes',
        `${projectName}.xcscheme`,
      );
      fs.writeFileSync(
        schemePath,
        attach(fs.readFileSync(schemePath, 'utf8'), projectName),
      );
      return modConfig;
    },
  ]);
}

module.exports = withStoreKitConfig;
module.exports.attach = attach;
