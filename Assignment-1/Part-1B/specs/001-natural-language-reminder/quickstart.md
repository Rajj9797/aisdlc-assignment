# Quickstart: Natural-Language Reminder Agent

## Prerequisites

- Node.js 20 or later and npm.
- A Gemini API key and an available Gemini model name.
- Outbound HTTPS access to Google's Gemini API for live model calls and evaluation.

## Configure

1. Copy `env.example` to `.env`.
2. Set `GEMINI_API_KEY` and `GEMINI_MODEL` in `.env`.
3. Keep `.env` local; the repository ignores it. Never paste credentials into source or CLI
   arguments.

## Install and validate

```sh
npm install
npm test -- --runInBand
npm run lint
npm audit
```

Expected results: all deterministic Jest tests pass, ESLint and security lint report zero errors,
and `npm audit` has no high- or critical-severity findings.

## Run the CLI

```sh
node src/cli.js \
  --text "Remind me to call the dentist tomorrow at 6pm" \
  --now "2026-11-22T12:00:00Z" \
  --timezone "Asia/Kolkata"
```

Expected result: one JSON object with exactly the five fields in
[the output contract](./contracts/reminder-result.schema.json). A date-only request such as
"remind me tomorrow" asks for a clock time and does not invent one. Empty or overlong text is
returned as `unsupported` without a model call. Invalid temporal context returns `INVALID_CONTEXT`.

## Run evaluation

```sh
npm run eval:check
npm run eval
```

The deterministic evaluator checks every synthetic dataset case for schema, invariants,
guardrails, and the declared semantic score. The live runner processes cases sequentially and
pauses briefly between model calls. A `SERVICE_ERROR` makes the run inconclusive. The harness
writes only content-free structured evidence to `evidence/eval-results.json`; it does not record
request text, model output, or credentials.

The final evaluation must meet the predeclared 15-case minimum, 100% schema/invariant and
guardrail hard gates, and semantic mean of at least 0.85. Preserve the first generated
implementation before harness-driven repairs, record structured failure evidence, and record a
human `ACCEPT` or `REJECT` decision. Do not alter benchmark cases, thresholds, or guardrails to
make a result pass.
