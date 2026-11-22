const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');

describe('server startup', () => {
  test('AC-10: invalid configuration exits non-zero without exposing API keys', () => {
    const result = spawnSync('node', ['src/server.js'], {
      cwd: root,
      env: { ...process.env, RATE_LIMITER_CONFIG_FILE: 'tests/fixtures/invalid-config.json', PORT: '0' },
      encoding: 'utf8',
      timeout: 10000,
    });
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(result.status).not.toBeNull();
    expect(output).toMatch(/tier/i);
    expect(output).not.toContain('SECRET-KEY-123');
  });
});