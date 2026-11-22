# Research: Natural-Language Reminder Agent

## Gemini REST API

**Decision**: Call the Gemini `generateContent` REST endpoint from the built-in Node.js `fetch`.
Send JSON in `generationConfig` with `responseMimeType: "application/json"` and temperature zero.
Require the model to return the reminder result as JSON, then parse and validate it locally; JSON
mode is not a substitute for application validation. Use the `x-goog-api-key` request header
with `GEMINI_API_KEY`, not a URL parameter.

**Rationale**: This follows the requested no-SDK integration, keeps network access in a single
module, avoids exposing the key in URLs, and preserves the local validator as the authority for
the application contract.

**Alternatives considered**:

- Gemini SDK: rejected because the feature explicitly requires built-in `fetch` and no SDK.
- Relying on model JSON mode alone: rejected because generated output still needs schema and
  intent-invariant validation.
- Sending the key as a query parameter: rejected in favor of the documented API-key header.

**Sources**:

- [GenerateContent API reference](https://ai.google.dev/api/generate-content/generate-content)
- [Structured output guide](https://ai.google.dev/gemini-api/docs/structured-output)
- [Text generation REST example](https://ai.google.dev/gemini-api/docs/text-generation)
- [API key guidance](https://ai.google.dev/gemini-api/docs/api-key)

## Timeouts and Failure Handling

**Decision**: Set an independent 30-second abort timeout on each model attempt. Make at most one
retry for a network/HTTP failure, timeout, malformed JSON, or schema/invariant failure. After
the second failed attempt, return `SERVICE_ERROR` without an intent. Treat HTTP 429 as a service
failure subject to the same single retry; do not introduce an unbounded or hidden retry loop.

**Rationale**: The specification fixes both the timeout and retry count. Bounded attempts avoid
uncontrolled latency and prevent an API client from silently multiplying model calls. Do not log
request/response text or credentials; only the evaluator writes its explicitly permitted
content-free evidence.

**Alternatives considered**:

- Exponential retries until success: rejected because it violates the one-retry contract.
- Retrying only rate-limit responses: rejected because the approved specification requires one
  retry on failure or invalid output.
- Treating HTTP 429 as a successful unsupported result: rejected because transport failures are
  not user intents.

**Sources**:

- [Node.js `AbortSignal.timeout`](https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay)
- [Gemini troubleshooting and retry strategy](https://ai.google.dev/gemini-api/docs/troubleshooting)
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [GenerateContent API reference](https://ai.google.dev/api/generate-content)

## Configuration and Privacy

**Decision**: Use a small `dotenv`-based helper for local `.env` loading, with
`GEMINI_API_KEY` and `GEMINI_MODEL` as the only model configuration. Keep `.env` ignored and
provide an `env.example` containing variable names and placeholder values only. Keep request and
response content transient; write evaluation evidence as case IDs, pass/fail checks, scores and
error categories only.

**Rationale**: This satisfies the environment-variable requirement while keeping application
logging and local retention out of scope. The existing repository ignore rule covers `.env`.
Synthetic fixtures and content-free evidence allow evaluation without recording reminder text.

**Alternatives considered**:

- Hard-coded configuration: prohibited by the constitution.
- Committing a populated environment file: prohibited.
- Writing raw prompts or model responses to evaluation evidence: prohibited by privacy and
  non-retention requirements.

## Result Validation

**Decision**: Use a checked-in JSON Schema as the single structural contract. Compile it with
Ajv and `ajv-formats`, then apply explicit semantic checks for intent-specific nullability,
future time, and explicit UTC offset before returning any result.

**Rationale**: JSON Schema covers exact keys and value types. Semantic checks cover requirements
that a structural schema cannot express, particularly comparisons with caller-supplied `now`.
The same schema is referenced by module tests and the evaluation harness.

**Alternatives considered**:

- Hand-written key/type checks only: rejected because the same contract should be reusable and
  machine-readable.
- Trusting the model's structured-output mode: rejected because model output must be validated.

## Date and Time Interpretation

**Decision**: Validate `now` as a parseable ISO 8601 timestamp and validate the supplied IANA
timezone with `Intl.DateTimeFormat`. Ask the model to resolve supported relative language using
the injected values. Reject any returned create/reschedule time that is invalid, lacks an
explicit offset, or is not strictly after `now`. Date-only expressions require clarification.

**Rationale**: The caller-supplied timestamp and timezone are authoritative. Native `Date` and
`Intl` avoid a date-time package for the limited validation and comparison needs; no call to the
system clock is permitted in reminder parsing.

**Alternatives considered**:

- Defaulting a missing time to the local time of `now`: rejected by clarification Q1 and the
  constitution's no-guess rule.
- Reading the host clock or timezone: prohibited because parsing must be reproducible.
