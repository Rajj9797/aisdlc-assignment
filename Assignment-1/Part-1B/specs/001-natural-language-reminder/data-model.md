# Data Model: Natural-Language Reminder Agent

The application is stateless. The following are in-memory request/result records and evaluation
fixtures, not persisted reminder entities.

## Reminder Request

| Field | Type | Required | Validation |
|---|---|---:|---|
| `text` | string | Yes | Non-empty text, at most 500 Unicode code points; otherwise return `unsupported` without a model call |
| `now` | ISO 8601 timestamp string | Yes | Must parse to a finite instant; invalid input returns `INVALID_CONTEXT` without a model call |
| `timezone` | IANA timezone string | Yes | Must be accepted by `Intl.DateTimeFormat`; invalid input returns `INVALID_CONTEXT` without a model call |
| `client` | injected client object | No | Optional test seam; when absent, use the configured Gemini client |

## Reminder Result

Every successful result has exactly the five fields described by
[the JSON Schema](./contracts/reminder-result.schema.json).

| Field | Type | Invariant |
|---|---|---|
| `intent` | enum string | One of `create_reminder`, `reschedule`, `snooze`, `needs_clarification`, `unsupported` |
| `task` | string or null | Non-empty for `create_reminder`; otherwise retain only if identifiable and meaningful |
| `datetime` | offset-bearing ISO 8601 string or null | Required and strictly after `now` for create/reschedule; null for snooze, clarification, and unsupported |
| `snooze_minutes` | integer 1–1440 or null | Required for snooze; null for clarification and unsupported |
| `clarification_question` | non-empty string or null | Required for clarification; null for all other intents |

`unsupported` has null for every field except `intent`. A `needs_clarification` result has a
non-empty question, null datetime and snooze duration, and a task only when it was reliably
identified.

## Error Result

Errors are not reminder intents and use the exact separate envelope:

| Field | Type | Validation |
|---|---|---|
| `error.code` | enum string | `SERVICE_ERROR` or `INVALID_CONTEXT` |
| `error.message` | string | Concise, non-sensitive; contains no credentials, request text, or model response |

`SERVICE_ERROR` represents exhausted model/network, timeout, or model-output validation failures.
`INVALID_CONTEXT` represents invalid caller-supplied `now` or timezone. Unexpected programming
errors are not to be silently converted into either user-facing error category.

## Evaluation Case

| Field | Type | Validation |
|---|---|---|
| `id` | unique string | Stable identifier used in reports |
| `synthetic` | boolean | MUST be `true`; evaluator fails closed when absent or false |
| `input` | object | Contains synthetic `text`, fixed `now`, and `timezone` |
| `traces` | string array | Non-empty; names covered FR/AC IDs |
| `expected` | object | Expected intent/invariants and optional datetime ground truth/task keywords |

Evaluation runs do not persist requests or model responses. Evidence is limited to case IDs,
trace IDs, outcome categories, invariant results, semantic scores, and aggregate status.

## State and Lifecycle

No reminder lifecycle or persistent identity exists in this feature. A request is validated,
classified by the model, validated as a result, and returned. The evaluation runner records
content-free evidence for each case and records the final human `ACCEPT` or `REJECT` decision.
