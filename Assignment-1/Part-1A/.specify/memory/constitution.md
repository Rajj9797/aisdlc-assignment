<!--
Sync Impact Report
Version change: unversioned scaffold -> 1.0.0 (initial adoption)
Modified principles: none; five principles established
Added sections: Quality Standards; Development Workflow and Change Integrity
Removed sections: none
-->

# Tiered Rate Limiter Constitution

## Core Principles

### I. Predictable Token-Bucket Behavior
The service MUST apply a token-bucket algorithm to every rate-limited request. A request
MUST be allowed only when the applicable bucket has sufficient tokens; otherwise, it MUST
be limited. Bucket state MUST be maintained in memory only. No external datastore may be
used for rate-limit state.

### II. Configuration-Defined Tiers
The service MUST support the free, pro, and enterprise tiers. Tier limits MUST come from
validated configuration and MUST NOT be hard-coded in rate-limiting logic. Invalid or
incomplete tier configuration MUST cause startup to fail with an actionable error.

### III. Deterministic Time
All time-dependent core limiter behavior MUST read time through an injected clock. Core
limiter logic MUST NOT call `Date.now()` directly. This makes refill and retry behavior
deterministic and testable.

### IV. Explicit HTTP Contract
The service MUST use Node.js with Express. Limited requests MUST receive HTTP 429 and a
`Retry-After` header that communicates when another request may be attempted. Allowed
responses MUST include `X-RateLimit-Limit` and `X-RateLimit-Remaining`.

### V. Validated Inputs and Protected Secrets
The service MUST validate request input before rate-limit decisions and reject invalid
input with an appropriate client error. Secrets MUST NOT be included in source code, and
`.env` files MUST NOT be committed. Configuration and request validation protect the
service from ambiguous or unsafe inputs.

## Quality Standards

- ESLint MUST complete with zero errors.
- Static security analysis using `eslint-plugin-security` and `npm audit` MUST report no high- or critical-severity findings.
- All acceptance tests MUST pass.
- Core limiter logic MUST maintain at least 90% line coverage.

These are release gates, not advisory targets. A failure MUST be corrected rather than
worked around by weakening the gate.

## Development Workflow and Change Integrity

- The coding agent MUST NOT modify `tests/`, `.harness/`, or approved specification files to obtain a passing result.
- Assertions and quality thresholds MUST NOT be weakened; lint or security rules MUST NOT be disabled; and harness gates MUST NOT be bypassed.
- Legitimate behavior or scope changes MUST be documented through the approved Spec Kit artifacts before implementation.
- Changes MUST favor simple, maintainable solutions over unnecessary complexity.
- The first generated implementation MUST be preserved before any harness-driven correction.
- Harness failures MUST be recorded with the failing check, relevant output, expected behavior and observed behavior before repair.
- A final human ACCEPT/REJECT decision, with known limitations, MUST be recorded after the automated harness result.

## Governance

This constitution governs implementation and review of the Tiered Rate Limiter. Every
change MUST be reviewed for compliance with its principles, quality standards, and change
integrity rules. Pull requests and acceptance reviews MUST report the results of all
applicable quality gates; any exception requires an explicit constitution amendment
before the exception is implemented.

Amendments MUST be made in this constitution, explain their rationale, and be reviewed
for effects on existing requirements and approved specifications. Version numbers follow
Semantic Versioning: MAJOR for incompatible governance changes, MINOR for new principles
or material requirement additions, and PATCH for clarifications or non-semantic wording
changes. The version and last-amended date MUST be updated with each amendment.

**Version**: 1.0.0 | **Ratified**: 2026-11-11 | **Last Amended**: 2026-11-11
