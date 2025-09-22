const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  resolver: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
