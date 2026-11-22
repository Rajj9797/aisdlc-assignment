const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2023,
      globals: { ...globals.node },
    },
  },
];
