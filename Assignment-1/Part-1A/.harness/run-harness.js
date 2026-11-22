#!/usr/bin/env node
// Runs every mandatory gate and saves the raw output. Do not edit saved results by hand.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const label = process.argv[2] || 'run';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(root, 'evidence', 'harness-results', `${stamp}-${label}`);
fs.mkdirSync(outDir, { recursive: true });

const gates = [
  { id: 'lint', cmd: 'npx', args: ['eslint', '--config', '.harness/eslint.config.js', 'src'] },
  { id: 'sast', cmd: 'npx', args: ['eslint', '--config', '.harness/eslint.security.config.js', '--max-warnings', '0', 'src'] },
  { id: 'audit', cmd: 'npm', args: ['audit', '--audit-level=high'] },
  { id: 'tests', cmd: 'npx', args: ['jest', '--config', '.harness/jest.config.js', '--coverage'] },
];

const results = [];
for (const gate of gates) {
  const command = `${gate.cmd} ${gate.args.join(' ')}`;
  const startedAt = new Date().toISOString();
  const r = spawnSync(gate.cmd, gate.args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const log = `$ ${command}\n\n--- stdout ---\n${r.stdout || ''}\n--- stderr ---\n${r.stderr || ''}${r.error ? `\n--- spawn error ---\n${r.error.message}` : ''}`;
  fs.writeFileSync(path.join(outDir, `${gate.id}.log`), log);
  const passed = r.status === 0;
  results.push({ gate: gate.id, command, exitCode: r.status, passed, startedAt });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${gate.id}`);
}

const overall = results.every((g) => g.passed) ? 'PASS' : 'FAIL';
fs.writeFileSync(
  path.join(outDir, 'results.json'),
  JSON.stringify({ label, timestamp: stamp, overall, gates: results }, null, 2),
);
console.log(`\nOVERALL: ${overall}\nResults saved in ${path.relative(root, outDir)}`);
process.exit(overall === 'PASS' ? 0 : 1);
