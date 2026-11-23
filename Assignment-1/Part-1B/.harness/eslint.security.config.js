const globals = require('globals');
const security = require('eslint-plugin-security');

module.exports = [
  security.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { sourceType: 'commonjs', ecmaVersion: 2023, globals: { ...globals.node } },
  },
];
