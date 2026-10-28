// DocumentPicker's automatic plugin removes this entitlement when its unrelated
// CloudDocuments integration is off. Restore our validated CloudKit environment
// after the remaining entitlement mods, without enabling iCloud Drive storage.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withBaseMod } = require('expo/config-plugins');

module.exports = function withICloudEnvironment(config, { environment }) {
  return withBaseMod(config, {
    platform: 'ios',
    mod: 'entitlements',
    isProvider: false,
    isIntrospective: true,
    async action({ modRequest: { nextMod, ...modRequest }, ...modConfig }) {
      const result = await nextMod({ ...modConfig, modRequest });
      result.modResults['com.apple.developer.icloud-container-environment'] =
        environment;
      return result;
    },
  });
};
