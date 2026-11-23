#!/usr/bin/env node
// Live evaluation of the application under test. Prints only case ids and verdicts, never request or response text.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const { evaluateCase, aggregate } = require('./evaluate');
const { parseReminder } = require('../src/index');
const { createGeminiClient } = require('../src/gemini-client');

const label = process.argv[2] || 'run';
const DELAY_MS = 4000;
const datasetPath = path.join(root, 'evals', 'dataset.json');
const raw = fs.readFileSync(datasetPath, 'utf8');
const dataset = JSON.parse(raw);

function buildText(input) {
  if (input.text_pad) {
    const { prefix, fill, total_code_points: total } = input.text_pad;
    return prefix + fill.repeat(total - Array.from(prefix).length);
  }
  return input.text;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL) {
    console.error('GEMINI_API_KEY and GEMINI_MODEL must be set (see env.example).');
    process.exit(2);
  }
  const inner = createGeminiClient({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL });
  const caseResults = [];

  for (const c of dataset.cases) {
    let modelCalls = 0;
    const client = { async complete(args) { modelCalls += 1; return inner.complete(args); } };
    let output;
    try {
      output = await parseReminder({ text: buildText(c.input), now: c.input.now, timezone: c.input.timezone, client });
    } catch (e) {
      output = { error: { code: 'APPLICATION_EXCEPTION', message: 'parseReminder threw' } };
    }
    const result = evaluateCase(c, { output, modelCalls });
    caseResults.push(result);
    const verdict = result.status === 'service_error' ? 'SERVICE_ERROR' : (result.failures.length ? 'FAIL' : 'ok');
    console.log(`${c.id}  ${verdict}`);
    if (modelCalls > 0) await sleep(DELAY_MS);
  }

  const summary = aggregate(caseResults, dataset);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = {
    label,
    timestamp: stamp,
    configuration: {
      model: process.env.GEMINI_MODEL,
      temperature: 0,
      node: process.version,
      datasetSha256: crypto.createHash('sha256').update(raw).digest('hex'),
      delayBetweenCallsMs: DELAY_MS,
    },
    summary,
    cases: caseResults,
  };
  fs.mkdirSync(path.join(root, 'evidence', 'eval-runs'), { recursive: true });
  const text = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(root, 'evidence', 'eval-runs', `${stamp}-${label}.json`), text);
  fs.writeFileSync(path.join(root, 'evidence', 'eval-results.json'), text);

  console.log(`\nDECISION: ${summary.decision}  mean=${summary.meanScore.toFixed(3)}  threshold=${summary.threshold}  structural=${summary.structuralRate}  guardrails=${summary.guardrailPass}  serviceErrors=${summary.serviceErrors}`);
  process.exit(summary.decision === 'PASS' ? 0 : 1);
})();
