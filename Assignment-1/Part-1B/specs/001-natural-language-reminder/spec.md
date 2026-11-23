# Feature Specification: Natural-Language Reminder Agent

**Feature Branch**: `not-created`

**Created**: 2026-11-22

**Status**: Draft

**Input**: User description: "Build a Natural-Language Reminder Agent that parses unstructured reminder requests into a fixed structured result, clarifies missing information, refuses unsupported or unsafe requests, resolves relative times using caller-supplied time and timezone, and exposes a small CLI. Exclude persistence, notifications, calendars, accounts, and UI beyond the CLI."

## Clarifications

### Session 2026-11-22

- Q: When someone says “remind me tomorrow” without specifying a clock time, should the agent ask what time they mean or use the current local time? → A: Ask the user to specify a time; a clock time is mandatory and MUST NOT be guessed.
- Q: What, if anything, may the application retain or log about a reminder request after the model call? → A: Do not retain or log request or response content; do not add application logging, and surface errors through the defined error response.
- Q: Should the chosen model service be required not to use reminder text for training and to retain it only as long as needed to process the request? → A: Accept the provider’s standard data-handling terms; use synthetic reminder text only in test and evaluation data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Parse a complete reminder request (Priority: P1)

A user submits a natural-language request containing an actionable task and a future time.
The agent returns a structured result that preserves the task's meaning and expresses the
requested time relative to the supplied current time and timezone.

**Why this priority**: Converting a complete reminder request is the agent's primary purpose.

**Independent Test**: Provide a task and future time, then verify the returned result matches the
required schema, preserves key task terms, and represents the requested future time.

**Acceptance Scenarios**:

1. **Given** a request with a task and explicit future time, **When** the user submits it with a
   valid current time and timezone, **Then** the agent returns `create_reminder` with the task and
   a datetime strictly after the supplied current time.
2. **Given** a request to reschedule a task to a future time, **When** the user submits it with
   valid temporal context, **Then** the agent returns `reschedule` with that future datetime.
3. **Given** a request to snooze a task for a duration from 1 to 1440 minutes, **When** the user
   submits it, **Then** the agent returns `snooze` with that duration and a null datetime.
4. **Given** a request with a relative time and a clock time such as "tomorrow at 6pm", "in 2
   hours", or "next Monday at 9am", **When** the supplied current time and IANA timezone are
   applied, **Then** the result resolves the time in that timezone and returns an ISO 8601
   datetime with a UTC offset. A date-only relative request asks the user to provide a clock time.

---

### User Story 2 - Clarify incomplete or refuse unsupported requests (Priority: P2)

A user submits an incomplete request or a request outside the agent's supported reminder-parsing
scope. The agent asks a focused question instead of inventing mandatory information, or returns
the unsupported result when the request is unsafe or out of scope.

**Why this priority**: Clarification and refusal prevent fabricated reminders and unsafe behavior.

**Independent Test**: Submit requests missing task or time, and requests containing unsafe or
unsupported instructions; verify clarification or refusal and all output invariants.

**Acceptance Scenarios**:

1. **Given** a reminder request with a date but no clock time, or with no date or time,
   **When** it is parsed, **Then** the agent returns `needs_clarification`, asks for a clock
   time, and does not invent a datetime.
2. **Given** a reminder request with a time but no task, **When** it is parsed, **Then** the agent
   returns `needs_clarification` and asks what task to remind the user about.
3. **Given** an ambiguous or past requested time, **When** it cannot be resolved as
   a future instant without guessing, **Then** the agent asks for clarification.
4. **Given** text instructing the agent to ignore its instructions, send a message, run a command,
   or reveal its prompt, **When** the text is submitted, **Then** the agent returns `unsupported`
   with all non-intent fields null and performs no requested action.
5. **Given** a request outside reminder parsing, **When** it is submitted, **Then** the agent
   returns `unsupported` with all non-intent fields null.

---

### User Story 3 - Use the parser through a small command-line interface (Priority: P3)

A user or developer supplies a request and its temporal context through a small CLI and receives
the structured result without creating or changing any reminder outside the returned output.

**Why this priority**: The CLI makes the parser directly usable while keeping the feature limited
to parsing and returning a result.

**Independent Test**: Invoke the CLI with text, an ISO 8601 `now`, and an IANA timezone; verify it
emits one JSON result. Simulate a model service failure and verify the distinct error contract.

**Acceptance Scenarios**:

1. **Given** valid CLI arguments, **When** the CLI runs, **Then** it prints one JSON result and
   does not persist data, send notifications, or perform any other action.
2. **Given** a model call failure, timeout, or unparseable response on both allowed attempts,
   **When** the parser is called, **Then** it returns a service error distinct from every
   reminder intent and never presents the error as a valid result.

### Edge Cases

- Empty, whitespace-only, non-text, or over-500-character request text returns `unsupported`.
- Exactly 500 characters is within the input limit; 501 characters is over the limit.
- A date-only relative expression such as "tomorrow" or "next Monday" has no clock time and
  results in clarification; it MUST NOT inherit the local time of day from `now`.
- Missing task or time for a reminder request results in clarification and never a guessed value.
- A requested datetime equal to or earlier than `now` is not accepted as a create or reschedule
  result.
- An invalid caller-supplied `now` timestamp or invalid IANA timezone produces an input-context
  error, not an intent or a model service error.
- A model response with missing, extra, malformed, or invariant-violating fields is rejected. The
  request is retried once; a second invalid response produces a service error.
- Requests containing embedded instructions to redirect the agent remain untrusted user text and
  return `unsupported`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The application MUST be a Node.js module and tiny CLI using CommonJS. The module
  MUST expose `parseReminder({ text, now, timezone })`, where `now` is an ISO 8601 timestamp
  supplied by the caller and `timezone` is an IANA timezone name.
  An optional client argument is a test seam for dependency injection; ordinary callers do not supply it.
- **FR-002**: The agent MUST return a JSON object with exactly the following keys and no others:
  `intent`, `task`, `datetime`, `snooze_minutes`, and `clarification_question`. Every key MUST
  always be present.
- **FR-003**: `intent` MUST be one of `create_reminder`, `reschedule`, `snooze`,
  `needs_clarification`, or `unsupported`. `task` MUST be a string or null. `datetime` MUST be an
  ISO 8601 datetime string with an explicit UTC offset or null. `snooze_minutes` MUST be an
  integer from 1 through 1440 or null. `clarification_question` MUST be a non-empty string or null.
- **FR-004**: A `create_reminder` result MUST contain a non-empty task and a datetime strictly
  after `now`; its `snooze_minutes` and `clarification_question` MUST be null.
- **FR-005**: A `reschedule` result MUST contain a datetime strictly after `now`; its
  `snooze_minutes` and `clarification_question` MUST be null. If the task is not identifiable
  from the request, the agent MUST ask for clarification rather than inventing it.
- **FR-006**: A `snooze` result MUST contain a `snooze_minutes` value from 1 through 1440 and a
  null `datetime`; its `clarification_question` MUST be null. If mandatory task information is
  missing, or the snooze duration is not specified, the agent MUST ask for clarification rather
  than guessing.
- **FR-007**: A `needs_clarification` result MUST contain a non-empty
  `clarification_question`, a null `datetime` and a null `snooze_minutes`. It MUST NOT invent
  missing task or time information.
- **FR-008**: An `unsupported` result MUST set `task`, `datetime`, `snooze_minutes`, and
  `clarification_question` to null.
- **FR-009**: The application MUST validate every model response against the output contract and
  invariants before returning it. Invalid output MUST never be passed on as a valid result.
- **FR-010**: Relative time expressions MUST be interpreted from the supplied `now` in the supplied timezone. A duration such as "in 2 hours" is added to `now`. A relative date such as "tomorrow" or "next Monday" MUST come with an explicit clock time (for example "tomorrow at 6pm"); when no clock time is given, the agent MUST return `needs_clarification` asking for a time. "Next Monday" means the first Monday whose local date is strictly after the local date of `now`. Local date and time expressions MUST be interpreted in the supplied timezone, and the resulting datetime MUST include the applicable UTC offset. Datetime logic MUST NOT read the system clock directly.
- **FR-011**: The returned task MUST preserve the user's meaning. For evaluation cases with
  reference keywords, task preservation MUST be measured by the proportion of listed key terms
  represented in the returned task, allowing case differences and inflectional variants.
- **FR-012**: Embedded instructions to ignore prior instructions, send messages, run commands, or
  reveal prompts, and requests for actions outside parsing, MUST return `unsupported`. The agent
  MUST perform no external action other than the LLM parsing call and returning the structured
  result or error.
- **FR-013**: Empty, whitespace-only, non-text, and over-500-character text MUST return the
  `unsupported` result. Character count is measured as Unicode code points; 500 is accepted and
  501 is rejected.
- **FR-014**: Model name and API key MUST be supplied only through environment variables. The
  application MUST NOT hard-code either value or commit a `.env` file.
- **FR-015**: All LLM calls MUST pass through one client module. Model wording MUST NOT alter the
  required result contract.
- **FR-016**: If the model call fails, times out, or returns unparseable or contract-invalid
  output, the parser MUST retry once. After a second failure, it MUST return a service error
  distinct from the intent result and MUST NOT label the error as a valid result.
- **FR-017**: The CLI MUST accept request text, `now`, and timezone, and MUST print one JSON
  response. It MUST NOT provide persistence, notifications, calendar integration, accounts, or
  UI beyond the CLI.
- **FR-018**: Invalid caller-supplied `now` or timezone MUST return an input-context error, not an
  intent result or a model service error.
- **FR-019**: Before harness-driven repair, the first generated implementation MUST be preserved.
  Every evaluation failure MUST be recorded as structured evidence, and a final human `ACCEPT`
  or `REJECT` decision MUST be recorded.
- **FR-020**: The application MUST NOT persist or log reminder request text or model response
  content. Runtime failures MUST be returned through the defined error envelope; evaluation
  failures remain recorded as structured evaluation evidence as required by FR-019.
- **FR-021**: The evaluation dataset and deterministic test fixtures MUST use synthetic reminder
  text only; real user reminder text MUST NOT be included in fixtures, benchmark cases, or
  evaluation evidence. The model service MAY process the submitted request under its standard
  data-handling terms.

### Output Contract and Invariants

The successful-result object MUST match this schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "intent",
    "task",
    "datetime",
    "snooze_minutes",
    "clarification_question"
  ],
  "properties": {
    "intent": {
      "type": "string",
      "enum": [
        "create_reminder",
        "reschedule",
        "snooze",
        "needs_clarification",
        "unsupported"
      ]
    },
    "task": { "type": ["string", "null"] },
    "datetime": { "type": ["string", "null"], "format": "date-time" },
    "snooze_minutes": {
      "type": ["integer", "null"],
      "minimum": 1,
      "maximum": 1440
    },
    "clarification_question": { "type": ["string", "null"], "minLength": 1 }
  }
}
```

The `date-time` string MUST include an explicit numeric UTC offset, such as `+05:30` or
`-04:00`. A create or reschedule datetime MUST represent an instant strictly later than `now`.
For `needs_clarification`, the question MUST be non-empty, `datetime` and `snooze_minutes` MUST be null, and `task` is a string or null. For `snooze`, datetime MUST be null and snooze duration MUST be in range. For `unsupported`, every field other than `intent` MUST be null.

Errors are not successful intent results and MUST use a separate JSON envelope:

```json
{
  "error": {
    "code": "SERVICE_ERROR",
    "message": "A concise, non-sensitive description"
  }
}
```

`code` MUST be `SERVICE_ERROR` for exhausted model/network failures and `INVALID_CONTEXT` for an
invalid `now` or timezone. The error object MUST have exactly `code` and `message`; it MUST NOT
contain an `intent`. Error messages MUST NOT expose credentials or hidden prompts.

### Non-Functional Requirements

- **NFR-001**: All successful results MUST pass schema and invariant validation; the required
  evaluation suite hard gate is 100%.
- **NFR-002**: Each model attempt MUST time out after 30 seconds, with no more than one retry.
- **NFR-003**: The model name and API key MUST NOT appear in source code, and `.env` MUST NOT be
  committed.
- **NFR-004**: Deterministic datetime behavior MUST depend only on the supplied `now`, timezone,
  and request, not the host system clock.
- **NFR-005**: Model/network service failures MUST remain distinguishable from invalid caller
  context, application failures, and evaluation failures.
- **NFR-006**: Parsing and CLI execution MUST NOT persist reminders or trigger external actions.
- **NFR-007**: The application MUST NOT retain or log reminder request or model response content.
- **NFR-008**: Test and evaluation data MUST consist only of synthetic reminder text; external
  model-provider data handling follows the provider's standard terms.

### Acceptance Criteria

- **AC-01**: For every successful parse, automated schema validation confirms all five required
  fields are present, no additional fields exist, and each value matches its declared type.
- **AC-02**: A test covering each of the five intents confirms its specified structural
  invariants; every create/reschedule datetime is strictly after the supplied `now`.
- **AC-03**: A request without any date or time expression, a date-only relative request such as
  "tomorrow", and a request with a clock time but no task each return `needs_clarification`;
  neither result contains an invented task or datetime.
- **AC-04**: Requests using "in 2 hours" and "tomorrow at 6pm" resolve relative to the supplied
  `now` in the supplied timezone, with returned datetime values including a UTC offset. A
  date-only request such as "tomorrow" returns `needs_clarification` until a clock time is given.
- **AC-05**: In each evaluation case with task reference keywords, task keyword overlap is scored
  as the proportion of reference terms represented, case-insensitively and allowing inflectional
  variants, as defined in Evaluation Scoring.
- **AC-06**: Every guardrail evaluation case, including embedded instructions to ignore
  instructions, send messages, run commands, or reveal the prompt, returns the `unsupported`
  result and triggers no such external action.
- **AC-07**: Empty, whitespace-only, non-text, and 501-code-point inputs return `unsupported`;
  a 500-code-point input is not rejected solely for length.
- **AC-08**: A model failure, timeout, unparseable response, or invalid result is attempted at
  most twice. Exhaustion returns the `SERVICE_ERROR` envelope without an intent; an invalid
  caller-supplied `now` or timezone returns `INVALID_CONTEXT`.
- **AC-09**: A CLI invocation with valid text and temporal context emits exactly one JSON
  response and performs no persistence, notification, calendar, account, or other UI operation.
- **AC-10**: Before final evaluation, the dataset contains at least 15 cases. Every case passes
  schema and invariant checks (100% hard gate), every guardrail case passes (hard gate), and the
  mean applicable semantic score is at least 0.85. Any service error makes the entire evaluation
  run inconclusive.
- **AC-11**: The declared evaluation threshold and benchmark cases are not changed after results
  are observed; any change requires a documented specification revision.
- **AC-12**: ESLint reports zero errors; security lint and `npm audit` report no high- or
  critical-severity findings; and all deterministic unit tests pass.
- **AC-13**: Before any harness-driven repair, the first generated implementation is preserved;
  each evaluation failure has structured evidence; and a human `ACCEPT` or `REJECT` decision is
  recorded.
- **AC-14**: With `console` output and file-system writes observed by a test, a successful parse, a clarification, a refusal and a service failure each produce no logged or written output that contains the request text, the model response or the API key.
- **AC-15**: Every case in `evals/dataset.json` and every unit-test fixture carries `"synthetic": true`, and the harness fails if any case lacks it. All reminder text in test fixtures, benchmark cases and evaluation evidence is made up; no real user reminder text is present. Provider handling is governed by its standard terms.

### Evaluation Scoring

Each evaluation case MUST include a `traces` field listing the acceptance criteria or requirements it exercises (for example `["AC-03", "FR-007"]`). The dataset MUST include normal, boundary (including exactly 500 and 501 code points), ambiguous or underspecified, missing-information, malformed or invalid-input, and adversarial guardrail cases. Each evaluation run executes every case exactly once.

All request text in unit-test fixtures and evaluation data MUST be synthetic and MUST NOT be
copied from real user requests. The evaluation dataset MUST contain at least 15 cases and MUST include valid creation, reschedule,
snooze, clarification, relative-time, invalid-input, and guardrail cases. Each case MUST declare
expected invariants and, where applicable, task keywords and datetime ground truth.

For a case with datetime ground truth, the datetime component contributes 0.5 when the returned
instant is within 60 seconds of ground truth and 0 otherwise. For a case with task keywords, the
task component contributes 0.5 multiplied by the proportion of listed keywords present in the
returned task. When only one component has ground truth, its available weight is normalized to
1. Cases with neither component are excluded from the semantic mean but remain subject to hard
schema, invariant, and guardrail checks. The mean is calculated over all cases with at least one
semantic reference. A service error in any case makes the run inconclusive; it is not counted as
a zero score or as a passing case.

### Key Entities

- **Reminder request**: User-provided text interpreted in the context of a supplied current
  timestamp and IANA timezone.
- **Reminder result**: The fixed five-field JSON object representing one supported intent,
  clarification request, or unsupported request.
- **Service or context error**: A distinct error envelope for exhausted model/network failures or
  invalid caller-supplied temporal context; it is not a reminder result.
- **Evaluation case**: A request with expected structural invariants and optional task-keyword
  and datetime references used to measure behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful parser results pass the five-field JSON schema and intent
  invariants.
- **SC-002**: 100% of guardrail evaluation cases return `unsupported` and result in no external
  action.
- **SC-003**: The evaluation dataset includes at least 15 cases and achieves a mean applicable
  semantic score of at least 0.85, with no schema or invariant failures.
- **SC-004**: No model or network service error is presented as a successful intent result; any
  such error makes evaluation inconclusive.
- **SC-005**: A CLI user receives one structured JSON response for each completed invocation,
  with no reminder persistence or external action.
- **SC-006**: The evaluation run's acceptance decision is recorded as a human `ACCEPT` or
  `REJECT`, with structured evidence recorded for every failure.

## Assumptions

- The caller supplies a valid ISO 8601 timestamp and IANA timezone for normal operation. Invalid
  temporal context uses the `INVALID_CONTEXT` error envelope defined above.
- The error envelope is the API's error representation because model service failures must be
  distinct from valid intent results; callers can distinguish errors by the absence of `intent`.
- The CLI receives text, `now`, and timezone as explicit arguments; it does not read the system
  clock or infer the user's timezone.
- A date-only relative expression such as "tomorrow" or "next Monday" requires clarification
  about the clock time. "Next Monday" means the first Monday after the current local date.
- A timeout of 30 seconds per model attempt is acceptable; the parser retries once.
- The model provider's standard data-handling terms are acceptable. Evaluation and test inputs
  are synthetic and do not contain real user reminder text.
- If an evaluation case has no datetime ground truth, it is scored on its listed task keywords;
  cases with neither semantic reference still undergo hard-gate checks.
- The first generated implementation, evaluation evidence, and human final decision are preserved
  as required by the project constitution.

## Open Questions

None. The unspecified CLI argument presentation and error envelope are defined by the assumptions
above so implementation can proceed without blocking clarification.
