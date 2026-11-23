# Tasks: Natural-Language Reminder Agent

**Input**: Design documents from `/specs/001-natural-language-reminder/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, and `contracts/`

**Scope**: Implement only `src/` and root `env.example`. `tests/`, `evals/`, `.harness/`
(including gate configuration and evaluator), `package.json`, dependency installation, and local
`.env` setup are student-authored or student-performed and MUST NOT be created or modified by
these tasks. Do not run tests, lint, audit, harness gates, or evaluation here; the student runs
those after implementation.

**Organization**: Tasks are grouped by the approved specification's prioritized user stories.
The test files and harness are pre-supplied; no tasks modify them.

## Phase 1: Setup

**Purpose**: Add only the safe, committed example for local Gemini configuration.

- [ ] T001 [P] Create root `env.example` with `GEMINI_API_KEY=replace-with-your-key` and `GEMINI_MODEL=replace-with-your-model` placeholders only; include no real credentials (FR-014, NFR-003)

---

## Phase 2: Foundational

**Purpose**: Establish the shared result contract and validation used by every story.

- [ ] T002 [P] Create `src/schema.js` as the application-owned copy of the exact five-field result schema in `specs/001-natural-language-reminder/contracts/reminder-result.schema.json`; allow no extra properties and preserve the declared intent, nullable types, datetime format, and snooze range 1–1440 (FR-002, FR-003, FR-009, AC-01)
- [ ] T003 Implement `validateResult(value, { now })` in `src/validator.js` using `src/schema.js`; return exactly `{ valid: boolean, errors: string[] }`, check all intent-specific nullability and non-empty requirements, require offset-bearing ISO 8601 datetimes strictly after `now` for create/reschedule, and never mutate the input (FR-002–FR-009, AC-01–AC-02)

**Checkpoint**: Shared contract validation is available before parser and story-specific implementation.

---

## Phase 3: User Story 1 - Parse a complete reminder request (Priority: P1) 🎯 MVP

**Goal**: Turn complete reminder requests into validated create, reschedule, or snooze results
using caller-supplied time context and the single Gemini network client.

**Independent Test**: With the pre-supplied stub client, provide complete create, reschedule,
snooze, and relative-time requests; each result must have exactly the five contract fields,
satisfy intent invariants, preserve task meaning, and use a future offset-bearing datetime where
required.

### Implementation for User Story 1

- [ ] T004 [P] [US1] Implement the system and user prompt construction in `src/prompts/reminder.js`; keep user text in the user input as untrusted data, include supplied `now` and IANA `timezone`, request only the approved JSON result, and preserve the task's meaning (FR-002–FR-011, AC-01–AC-05)
- [ ] T005 [P] [US1] Implement `createGeminiClient({ apiKey, model, timeoutMs = 30000, fetchImpl = fetch })` in `src/gemini-client.js`; return a client with `complete({ system, user })`, use HTTPS `fetch`, JSON output mode and temperature zero, enforce the per-attempt timeout, send the API key only in the `x-goog-api-key` request header, never in the URL, and never include it in a thrown error message, and reject network/non-2xx responses including HTTP 429 without logging or retaining credentials, request text, or response content (FR-014–FR-016, FR-020, NFR-002–NFR-003, NFR-007)
- [ ] T006 [US1] Implement `parseReminder({ text, now, timezone, client })` in `src/parse-reminder.js`; default `client` to `createGeminiClient` configured only from `process.env.GEMINI_API_KEY` and `process.env.GEMINI_MODEL`, construct its system/user input through `src/prompts/reminder.js`, call `client.complete({ system, user })`, parse and validate every candidate with `src/validator.js`, retry once on call/parse/validation failure, and after the second failure return only `{ error: { code: "SERVICE_ERROR", message } }` with no intent or sensitive content; never log or retain request text, model output, or credentials (FR-001–FR-011, FR-014–FR-016, FR-020, AC-01–AC-05, AC-08, AC-14)
- [ ] T007 [US1] Export `parseReminder` from `src/index.js` with the exact input signature and Promise result/error union specified in the Interfaces section of `plan.md` (FR-001–FR-009, AC-01–AC-02)

**Checkpoint**: User Story 1 returns a validated result for complete, supported requests and a
distinct service error after two failed model attempts.

---

## Phase 4: User Story 2 - Clarify incomplete or refuse unsupported requests (Priority: P2)

**Goal**: Clarify missing mandatory information without guessing and refuse unsafe or unsupported
requests before any disallowed action can occur.

**Independent Test**: With the pre-supplied stub client, confirm missing task/time and date-only
requests yield valid `needs_clarification` results, embedded instruction requests yield
`unsupported`, invalid context returns `INVALID_CONTEXT` without a client call, and invalid text
length boundaries short-circuit as specified.

### Implementation for User Story 2

- [ ] T008 [P] [US2] Extend the prompt in `src/prompts/reminder.js` to classify embedded instructions to ignore prior instructions, send messages, run commands, reveal prompts, or perform actions outside parsing as `unsupported`; require a focused clarification when task, clock time, or snooze duration is missing, including date-only expressions (FR-005–FR-007, FR-010, FR-012, AC-03–AC-06)
- [ ] T009 [US2] Add preflight handling to `src/parse-reminder.js`: non-string, empty, whitespace-only, or over-500-Unicode-code-point text returns the exact all-null `unsupported` result without calling the client; validate `now` as ISO 8601 and `timezone` as an IANA name before a model call and return `{ error: { code: "INVALID_CONTEXT", message } }` on invalid values; use only supplied temporal context and do not log or retain request text (FR-010, FR-013, FR-018, FR-020, AC-03–AC-04, AC-07–AC-08, AC-14)
- [ ] T010 [US2] Ensure clarification and refusal paths in `src/parse-reminder.js` pass through `src/validator.js` and preserve the contract: clarification has a non-empty question, null datetime and snooze duration, and no invented task; unsupported has all non-intent fields null (FR-002–FR-009, FR-012, AC-01–AC-03, AC-06)

**Checkpoint**: User Story 2 returns only contract-valid clarifications/refusals or the distinct
invalid-context error, with no external action.

---

## Phase 5: User Story 3 - Use the parser through a small command-line interface (Priority: P3)

**Goal**: Provide a minimal CLI that accepts explicit request text and temporal context, then
prints exactly one JSON response without logging or retaining request/model content.

**Independent Test**: Invoke the pre-supplied CLI checks with `--text`, `--now`, and `--timezone`;
verify one JSON document on stdout, expected exit status, no client call for malformed arguments,
and no request, response, or credential content in stderr.

### Implementation for User Story 3

- [ ] T011 [P] [US3] Implement the environment helper in `src/load-env.js` to load local `.env` values for CLI startup without printing or persisting values; use the preinstalled environment-loading dependency and leave `.env` creation/setup to the student (FR-014, FR-020, NFR-003, NFR-007)
- [ ] T012 [US3] Implement `run(argv, { stdout, stderr, parseReminder })` and the executable CLI entry point in `src/cli.js`; accept exactly one `--text`, `--now`, and `--timezone`, load environment through `src/load-env.js`, call the injected/default parser, print exactly one JSON result or error envelope, use exit code 0 for intent results, 1 for error envelopes, and 2 for malformed options, and never print request text, model output, or credentials (FR-001, FR-017–FR-020, AC-08–AC-09, AC-14)

**Checkpoint**: User Story 3 supports the documented invocation and exposes the fixed JSON
contract without adding persistence or external actions.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: No additional source or environment tasks are included beyond the story work above.
The student-authored tests, fixtures, evaluator, gate configuration, package setup, dependency
installation, and all test/lint/audit/harness/evaluation runs are explicitly outside this task
scope.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 is independent; it only creates the placeholder environment example.
- **Foundational (Phase 2)**: T002 precedes T003. Complete both before parser stories.
- **User Stories (Phase 3+)**: User Story 1 follows foundational tasks. User Stories 2 and 3
  follow User Story 1 because both extend/use its parser and public API; Stories 2 and 3 can
  then proceed in parallel.
- **Polish (Final Phase)**: No additional tasks.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after T002–T003. T004 and T005 may proceed in parallel; T006
  depends on T003–T005; T007 depends on T006.
- **User Story 2 (P2)**: Depends on User Story 1. T008 and T009 touch different files and may
  proceed in parallel after T004 and T006 respectively; T010 follows T009.
- **User Story 3 (P3)**: Depends on User Story 1. T011 and T012 are sequential because the CLI
  loads the environment helper.

### Parallel Opportunities

- **Setup**: T001 can proceed independently from all source tasks.
- **Foundation**: T002 and T001 touch different paths and can proceed in parallel.
- **User Story 1**: T004 (`src/prompts/reminder.js`) and T005 (`src/gemini-client.js`) are
  independent after T002–T003.
- **User Story 2**: T008 (`src/prompts/reminder.js`) and T009 (`src/parse-reminder.js`) can be
  handled in parallel after their User Story 1 prerequisites.
- **User Story 3**: T011 can proceed in parallel with User Story 2 after User Story 1; T012
  depends on T011 and T007.

---

## Parallel Example: User Story 1

```text
After T002 and T003 are complete, work in parallel:
- T004: Implement prompt construction in src/prompts/reminder.js
- T005: Implement Gemini HTTP client in src/gemini-client.js
Then complete T006 and T007 in dependency order.
```

## Parallel Example: User Story 2

```text
After User Story 1 is complete, work in parallel:
- T008: Add clarification and embedded-instruction prompt rules in src/prompts/reminder.js
- T009: Add input and temporal-context preflight in src/parse-reminder.js
Then complete T010.
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001–T003 as applicable; package/dependency setup and local `.env` remain student
   responsibilities.
2. Complete User Story 1 (T004–T007) to deliver complete reminder parsing through the module.
3. The student independently runs the pre-supplied deterministic tests and gates; do not run
   evaluation from this task list.

### Incremental Delivery

1. Add User Story 1 for the core module.
2. Add User Story 2 for clarification, refusal, and invalid-input behavior.
3. Add User Story 3 for CLI access.
4. The student runs tests, lint/security lint, audit, and evaluation after implementation; do
   not change tests, cases, thresholds, or harness gates to obtain a pass.

## Notes

- Every task uses the required checkbox, sequential ID, optional `[P]`, story label only in
  user-story phases, and exact target file path.
- No tests, evaluation data, harness files/configuration, package files, or dependency commands
  are task targets.
- `FR-019` evaluation evidence and final human decision are owned by the student-operated
  evaluation workflow; this implementation-only task list does not run or author that workflow.
- `[P]` means different files with no dependency on an incomplete task.
