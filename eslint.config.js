// https://docs.expo.dev/guides/using-eslint/
// eslint-disable-next-line no-undef
const { defineConfig } = require('eslint/config');
// eslint-disable-next-line no-undef
const expoConfig = require("eslint-config-expo/flat");

// eslint-disable-next-line no-undef
module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  }
]);
