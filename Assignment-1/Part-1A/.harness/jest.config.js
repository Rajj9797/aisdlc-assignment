const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'json-summary'],
  coverageThreshold: {
    './src/rate-limit/token-bucket.js': { lines: 90 },
  },
};
