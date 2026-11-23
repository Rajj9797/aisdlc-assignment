# Implementation Plan: Natural-Language Reminder Agent

**Branch**: `main` (feature: `001-natural-language-reminder`) | **Date**: 2026-11-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-natural-language-reminder/spec.md`

## Summary

Implement a CommonJS Node.js module and small CLI that translate a single reminder request into
the approved five-field JSON result. Validate caller temporal context before any model request,
short-circuit invalid text, construct an instruction-isolated prompt, call Gemini through one
HTTPS client module, and validate every model result locally. Retry a failed or invalid model
response once; return the separate service-error envelope if both attempts fail. Do not retain or
log request text or model output.

## Technical Context

**Language/Version**: Node.js 20 or later, CommonJS

**Primary Dependencies**: Google Gemini `generateContent` REST API via Node built-in `fetch`
(no Gemini SDK); `dotenv` for the small `.env` loader; Ajv and `ajv-formats` for result-schema
validation; Jest for unit tests; ESLint with `eslint-plugin-security`; npm audit

**Storage**: None for application data. The local `.env` contains developer configuration and is
git-ignored. Evaluation evidence is written to `evidence/eval-results.json` without request or
response text.

**Testing**: Jest with an injected stub client; ESLint and security lint; `npm audit`; a
deterministic `.harness/` evaluator and a live Gemini evaluation runner

**Target Platform**: Node.js 20+ on supported developer and CI operating systems; outbound HTTPS
access to the Gemini API is required for live evaluation

**Project Type**: Single Node.js library and CLI

**Performance Goals**: Each Gemini attempt has a 30-second timeout, with at most one retry.
Evaluation runner waits briefly between independent model calls. No throughput target is required
for this single-request CLI.

**Constraints**: Exactly one production module may perform network I/O. Model name and key come
from `GEMINI_MODEL` and `GEMINI_API_KEY`; neither is hard-coded. JSON output is locally validated
before return. Datetime logic uses supplied `now` and timezone, never the system clock. Do not
persist or log request or response content. Test and evaluation data is synthetic only.

**Scale/Scope**: One request per module invocation or CLI run; at least 15 evaluation cases;
no persistence, notifications, calendars, accounts, or UI beyond the CLI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution requirement | Plan decision | Status |
|---|---|---|
| Node.js with CommonJS; one client module owns all LLM calls | CommonJS project with `src/gemini-client.js` as the sole network boundary | PASS |
| Model and key are environment-only; `.env` is not committed | `GEMINI_API_KEY` and `GEMINI_MODEL` loaded from a git-ignored `.env`; `env.example` contains placeholders only | PASS |
| Fixed JSON output is validated before passing it on | JSON mode plus Ajv schema and semantic invariant checks on every response | PASS |
| Missing mandatory task/time requires clarification; unsafe and injected instructions are refused | Prompt treats request as untrusted data; deterministic preflight rejects invalid text; result validator enforces result shape | PASS |
| Datetime logic uses injected current time and timezone | Validate and pass caller-supplied values; no system-clock reads in parsing logic | PASS |
| ESLint, security lint, audit, deterministic tests and evaluation gates | Jest, ESLint/security plugin, npm audit and a fixed-threshold harness are included | PASS |
| Evaluation threshold and benchmark are not changed after results | Declare and freeze dataset and threshold before final evaluation; revisions require documented spec change | PASS |
| First generated implementation, structured failures and human decision are preserved | Implementation workflow snapshots the initial output before any harness-driven repair; evidence and ACCEPT/REJECT are recorded separately | PASS |
| Service failures remain distinct from application/evaluation failures | Model, network, timeout and invalid-model-output exhaustion return `SERVICE_ERROR`; invalid context returns `INVALID_CONTEXT` | PASS |
| Request/response content is not logged or retained; test data is synthetic | App and evaluator produce no content logs; fixtures are synthetic-marked and evidence is content-free | PASS |
| Keep design simple and maintainable | Single application, one network client, no storage or external action integrations | PASS |

No constitution violations are identified.

**Guardrail assurance**: The application performs no action other than returning a structured result, so an injected instruction cannot cause an external action. Correct classification of embedded instructions as `unsupported` is enforced by the prompt and verified by the evaluation, where every guardrail case is a hard gate; schema validation alone does not establish safety. If guardrail cases fail, repair the prompt or add a deterministic pre-check through a documented repair cycle, without weakening the case or the gate.

## Interfaces (Test Contract)

These exports are fixed so independently authored tests can target them.

- `src/index.js` exports `parseReminder({ text, now, timezone, client })`, returning a Promise of either a result object or an error envelope. `client` is optional and defaults to the Gemini client built from the environment.
- A client is an object with `async complete({ system, user })` that resolves to the model's raw text (a JSON string) and rejects on network failure, timeout or a non-2xx status. `parseReminder` calls it at most twice per request.
- `src/validator.js` exports `validateResult(value, { now })`, returning `{ valid: boolean, errors: string[] }`.
- `src/gemini-client.js` exports `createGeminiClient({ apiKey, model, timeoutMs = 30000, fetchImpl = fetch })`, which returns a client.
- `src/cli.js` exports `run(argv, { stdout, stderr, parseReminder })`, returning a Promise of an exit code. `argv` is the list of arguments after the script name (`process.argv.slice(2)`), and `stdout` and `stderr` are objects with a `write(string)` method. It accepts exactly one each of `--text`, `--now` and `--timezone`. A parsed intent result exits 0, an error envelope exits 1, and missing, duplicate or unknown options (or an option without a value) exit 2 with a short usage message on `stderr`, nothing on `stdout`, and no call to `parseReminder`. On exit 0 or 1 it writes exactly one JSON document to `stdout`. Nothing written to `stdout` or `stderr` contains request text, model output or credentials.
- Error envelope: `{ "error": { "code": "SERVICE_ERROR" | "INVALID_CONTEXT", "message": string } }`.
- Preflight failures (empty, whitespace-only, non-string or over-500-code-point text) return `{ intent: "unsupported", task: null, datetime: null, snooze_minutes: null, clarification_question: null }` without calling the client. An invalid `now` or timezone returns `INVALID_CONTEXT` without calling the client.

## Project Structure

### Documentation (this feature)

```text
specs/001-natural-language-reminder/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── reminder-result.schema.json
│   ├── module-api.md
│   └── cli.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # Created by /speckit-tasks
```

### Source Code (repository root)

```text
env.example                  # Placeholders only (named without a leading dot so it is not git-ignored)
package.json
src/                         # Generated by the implementing agent
├── index.js
├── parse-reminder.js
├── validator.js
├── schema.js                # Application copy of the result schema
├── gemini-client.js         # The only application module that calls fetch
├── load-env.js
├── cli.js
└── prompts/
    └── reminder.js
tests/                       # Student-authored; the agent does not create or modify
├── unit/
│   ├── parse-reminder.test.js
│   ├── validator.test.js
│   ├── gemini-client.test.js
│   └── cli.test.js
└── fixtures/
    └── reminder-cases.js
evals/                       # Student-authored; frozen before final evaluation
└── dataset.json
.harness/                    # Student-authored
├── eslint.config.js
├── eslint.security.config.js
├── jest.config.js
├── run-gates.js             # Lint, security lint, audit, deterministic tests
├── schema/
│   └── reminder-result.schema.json
├── evaluate.js              # Schema, invariant and semantic scoring (independent of src/)
└── run-eval.js              # Live evaluation; writes evidence/eval-results.json
evidence/
├── initial-generation/
├── final-generation/
├── harness-results/
├── eval-results.json
└── harness-log.md
```

**Structure Decision**: Use one root-level Node.js package. Keep the public API, orchestrator,
validator, prompt, and Gemini client separate so the network boundary and test seams remain
explicit. The evaluator is distinct from application logic. `client` is an optional dependency
injection on `parseReminder` for deterministic tests; ordinary callers need only provide text,
`now`, and timezone.

The authoritative schema is `contracts/reminder-result.schema.json`, derived from the spec. The application validator uses its own copy under `src/`. The harness uses a separate, student-authored copy at `.harness/schema/reminder-result.schema.json`, and `.harness/evaluate.js` MUST NOT import anything from `src/`, so evaluation stays independent of the generated code. Every Jest fixture and evaluation case carries `synthetic: true`, and the evaluator rejects missing or false markers. Evaluation evidence contains no request or response content.

## Complexity Tracking

No constitution violations or additional projects require justification.
