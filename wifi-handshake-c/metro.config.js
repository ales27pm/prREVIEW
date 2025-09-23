const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {};

const defaultConfig = getDefaultConfig(__dirname);

module.exports = mergeConfig(defaultConfig, {
  resolver: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    sourceExts: [...defaultConfig.resolver.sourceExts, 'ts', 'tsx'],
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  watchFolders: [path.resolve(__dirname, '..')],
  cacheStores: [
    require('metro-cache').FileStore({
      root: path.join(__dirname, '.metro-cache'),
    }),
  ],
});
