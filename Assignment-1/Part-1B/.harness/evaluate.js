// Independent evaluator. MUST NOT import anything from src/.
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const THRESHOLD = 0.85; // Declared in the specification before any evaluation. Do not change.
const MIN_CASES = 15;

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema', 'reminder-result.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function checkInvariants(r, nowMs) {
  const errors = [];
  const mustBeNull = (...keys) => keys.forEach((k) => { if (r[k] !== null) errors.push(`${r.intent}: ${k} must be null`); });
  const futureDatetime = () => {
    if (r.datetime === null) { errors.push(`${r.intent}: datetime is required`); return; }
    if (!(Date.parse(r.datetime) > nowMs)) errors.push(`${r.intent}: datetime must be strictly after now`);
  };
  switch (r.intent) {
    case 'create_reminder':
      if (typeof r.task !== 'string' || r.task.trim() === '') errors.push('create_reminder: task must be a non-empty string');
      futureDatetime();
      mustBeNull('snooze_minutes', 'clarification_question');
      break;
    case 'reschedule':
      futureDatetime();
      mustBeNull('snooze_minutes', 'clarification_question');
      break;
    case 'snooze':
      if (!Number.isInteger(r.snooze_minutes)) errors.push('snooze: snooze_minutes is required');
      mustBeNull('datetime', 'clarification_question');
      break;
    case 'needs_clarification':
      if (typeof r.clarification_question !== 'string' || r.clarification_question.trim() === '') errors.push('needs_clarification: question must be non-empty');
      mustBeNull('datetime', 'snooze_minutes');
      break;
    case 'unsupported':
      mustBeNull('task', 'datetime', 'snooze_minutes', 'clarification_question');
      break;
    default:
      errors.push(`unknown intent ${String(r.intent)}`);
  }
  return errors;
}

function keywordPresent(task, keyword) {
  const t = String(task || '').toLowerCase();
  const k = keyword.toLowerCase();
  const stem = k.length > 4 ? k.replace(/(ing|ed|es|s)$/, '') : k;
  return t.includes(k) || t.includes(stem);
}

function semanticScore(exp, output, intentMatches) {
  if (!intentMatches) return 0;
  const parts = [];
  if (exp.datetime) {
    const ok = output.datetime && Math.abs(Date.parse(output.datetime) - Date.parse(exp.datetime)) <= 60000;
    parts.push(ok ? 1 : 0);
  }
  if (exp.task_keywords) {
    const hit = exp.task_keywords.filter((k) => keywordPresent(output.task, k)).length;
    parts.push(hit / exp.task_keywords.length);
  }
  if (parts.length === 0) return 1;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function evaluateCase(c, observed) {
  const { output, modelCalls } = observed;
  const exp = c.expect;
  const base = { id: c.id, category: c.category, traces: c.traces };
  const failures = [];

  if (c.synthetic !== true) failures.push('case is not marked synthetic');

  if (output && output.error) {
    if (output.error.code === 'SERVICE_ERROR') return { ...base, status: 'service_error', failures: [] };
    const ok = exp.error === output.error.code && (exp.calls_model !== false || modelCalls === 0);
    if (!ok) failures.push(`expected ${exp.error || exp.intent}, observed error ${output.error.code}, model calls ${modelCalls}`);
    return { ...base, status: 'evaluated', structuralPass: failures.length === 0, guardrailPass: true, score: failures.length === 0 ? 1 : 0, failures };
  }

  const schemaOk = validateSchema(output);
  if (!schemaOk) failures.push(`schema: ${ajv.errorsText(validateSchema.errors)}`);
  const invariantErrors = schemaOk ? checkInvariants(output, Date.parse(c.nowForCheck || c.input.now)) : [];
  failures.push(...invariantErrors.map((e) => `invariant: ${e}`));
  const structuralPass = schemaOk && invariantErrors.length === 0;

  const intentMatches = Boolean(output) && output.intent === exp.intent;
  if (!intentMatches) failures.push(`property: expected intent ${exp.intent}, observed ${output && output.intent}`);
  if (exp.snooze_minutes !== undefined && (!output || output.snooze_minutes !== exp.snooze_minutes)) failures.push('property: snooze_minutes differs from ground truth');
  if (exp.calls_model === false && modelCalls !== 0) failures.push(`property: model was called ${modelCalls} time(s) but must not be`);

  const guardrailPass = exp.guardrail ? intentMatches && (exp.calls_model !== false || modelCalls === 0) : true;
  const score = structuralPass ? semanticScore(exp, output, intentMatches) : 0;

  const evidence = failures.length && output
    ? { observed_intent: output.intent, observed_datetime: output.datetime, expected_intent: exp.intent, expected_datetime: exp.datetime || null }
    : undefined;
  return { ...base, status: 'evaluated', structuralPass, guardrailPass, score, failures, evidence };
}

function aggregate(caseResults, dataset) {
  const problems = [];
  if (dataset.cases.length < MIN_CASES) problems.push(`dataset has fewer than ${MIN_CASES} cases`);
  if (dataset.cases.some((c) => c.synthetic !== true)) problems.push('a case is not marked synthetic');
  if (dataset.cases.some((c) => !Array.isArray(c.traces) || c.traces.length === 0)) problems.push('a case has no traces');

  const serviceErrors = caseResults.filter((r) => r.status === 'service_error').length;
  const evaluated = caseResults.filter((r) => r.status === 'evaluated');
  const structuralRate = evaluated.length ? evaluated.filter((r) => r.structuralPass).length / evaluated.length : 0;
  const guardrailCases = dataset.cases.filter((c) => c.expect.guardrail).map((c) => c.id);
  const guardrailPass = evaluated.filter((r) => guardrailCases.includes(r.id)).every((r) => r.guardrailPass);
  const meanScore = evaluated.length ? evaluated.reduce((a, r) => a + r.score, 0) / evaluated.length : 0;

  let decision;
  if (problems.length) decision = 'INVALID_DATASET';
  else if (serviceErrors > 0) decision = 'INCONCLUSIVE';
  else decision = structuralPass(structuralRate) && guardrailPass && meanScore >= THRESHOLD ? 'PASS' : 'FAIL';
  return { decision, threshold: THRESHOLD, meanScore, structuralRate, guardrailPass, serviceErrors, cases: caseResults.length, problems };
}
function structuralPass(rate) { return rate === 1; }

module.exports = { evaluateCase, aggregate, THRESHOLD };
