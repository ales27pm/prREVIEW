const baseConfig = require('@react-native/eslint-config');

const sanitizedOverrides = (override) => {
  if (!override) {
    return override;
  }

  const nextOverride = { ...override };

  if (override.env && override.env['jest/globals'] !== undefined) {
    const { ['jest/globals']: _ignored, ...restEnv } = override.env;
    nextOverride.env = { ...restEnv, jest: true };
  }

  if (override.rules) {
    const {
      ['@typescript-eslint/func-call-spacing']: _tsFuncSpacing,
      ['func-call-spacing']: funcCallSpacing,
      ...restRules
    } = override.rules;

    nextOverride.rules = { ...restRules };

    if (funcCallSpacing !== undefined && funcCallSpacing !== 'off') {
      nextOverride.rules['func-call-spacing'] = funcCallSpacing;
    }
  }

  return nextOverride;
};

const adjustedOverrides = Array.isArray(baseConfig.overrides)
  ? baseConfig.overrides.map(sanitizedOverrides)
  : baseConfig.overrides;

module.exports = {
  ...baseConfig,
  root: true,
  overrides: adjustedOverrides,
};
