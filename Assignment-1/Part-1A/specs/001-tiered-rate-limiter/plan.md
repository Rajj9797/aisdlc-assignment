# Implementation Plan: Tiered Rate Limiter

**Branch**: `001-tiered-rate-limiter` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Approved feature specification and planning decisions in the user request.

## Summary

Build a single-process Node.js and Express HTTP service. A validated JSON configuration maps API keys to the free, pro, or enterprise tier. A synchronous, in-memory token bucket is created per configured key, uses an injected monotonic clock, and gates `GET /api/resource`. Health checks bypass client lookup and limiting. Demo credentials live only in committed example configuration; local and environment overrides supply real credentials without committing them.

## Technical Context

**Language/Version**: JavaScript, Node.js 22 LTS, ECMAScript modules

**Primary Dependencies**: Express 5; Jest and Supertest for tests; ESLint with `eslint-plugin-security` for static checks. Use Node.js built-ins for JSON and environment configuration; no limiter or storage dependency.

**Storage**: Process memory for bucket state; JSON files for non-secret tier/client configuration.

**Testing**: Jest unit and integration tests with Supertest; Jest coverage threshold of at least 90% line coverage for the token-bucket module.

**Target Platform**: Node.js server process.

**Project Type**: HTTP microservice.

**Performance Goals**: None gated; correctness under concurrency is verified deterministically.

**Constraints**: One process and in-memory state only; no external store or cross-instance coordination. No authentication beyond exact API-key lookup and no user interface. The core limiter receives time from an injected monotonic clock. Demo keys are visibly fake; actual keys are supplied from a git-ignored local configuration file or an environment variable and are never logged or returned.

**Scale/Scope**: State is created only for configured keys, so bucket count is bounded by the validated client map. Horizontal scaling and distributed rate-limit consistency are explicitly out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle or gate | Plan alignment | Status |
|---|---|---|
| Predictable token-bucket behavior; memory-only state | Independent in-process bucket per configured key; no persistence or shared store | PASS |
| Configuration-defined tiers | All tier limits are loaded and validated from JSON before the server listens | PASS |
| Deterministic time | Limiter accepts an injected clock; production clock uses monotonic elapsed time | PASS |
| Express and explicit HTTP contract | Express exposes the specified health and protected GET routes, status codes, and headers | PASS |
| Validated inputs and protected secrets | Validate config and missing/unknown keys; keep real keys out of committed config, logs, responses, and startup diagnostics | PASS |
| ESLint and `eslint-plugin-security` | Run lint and security rules as release checks; do not disable rules to pass | PASS |
| Dependency security | Run `npm audit --audit-level=high`; correct high/critical findings rather than suppressing them | PASS |
| Acceptance tests and core limiter coverage | Jest/Supertest tests cover the acceptance contract; require at least 90% line coverage for core limiter logic | PASS |
| Change integrity | Add tests for behavior; do not weaken existing assertions or harness gates to obtain a pass | PASS |

No constitution violations or exceptions are required.

## Architecture

1. **Configuration loader** reads the selected JSON file, applies any explicit client-map environment override, validates the complete configuration, and returns an immutable runtime configuration. It runs before `listen`, so malformed files and unsupported/missing tier values produce a non-zero startup failure rather than a partially running service.
2. **Application factory** receives validated configuration, a clock, and a fresh bucket store. It creates the Express app without opening a listening socket, allowing Supertest to exercise the exact production routes.
3. **Health route** is registered independently of the protected route and returns success without API-key lookup or bucket access.
4. **Protected route** treats a missing or blank `X-API-Key` as 401, looks up the exact configured key (unknown keys receive 403), and asks the limiter to consume one token. An allowed request returns 200 with the configured capacity and remaining whole tokens. A denied request returns 429 with an integer `Retry-After` rounded up.
5. **Token bucket** is synchronous and process-local. For a known key it refills by elapsed monotonic time, caps at the configured capacity, and consumes one token only when at least one token is available. Refill/check/debit has no `await` or callback boundary, so requests in the single Node.js process cannot interleave the state transition. A multi-process deployment is not supported by this design.
6. **Server entry point** loads configuration, constructs the app with the system clock, and then listens. It does not log request headers, API keys, raw configuration, or parser input.

The bucket map is keyed by the configured API key because that key is the specified client identity. Entries are created lazily and only after successful key lookup; their count is therefore bounded by configured clients. The process restart lifecycle naturally discards all bucket state.

## HTTP Endpoints

| Method and path | Authentication | Behavior |
|---|---|---|
| `GET /health` | None | Always returns 200 and never reads or changes a bucket. |
| `GET /api/resource` | `X-API-Key` | Missing/blank key returns 401; unknown key returns 403; available token returns 200 and `X-RateLimit-Limit` plus `X-RateLimit-Remaining`; unavailable token returns 429 and integer `Retry-After`. A rejected request does not debit a token. |

Error responses use a small JSON error code (`missing_api_key`, `unknown_api_key`, or `rate_limit_exceeded`) and a safe message. They never echo a supplied key. Per the approved specification, rate-limit headers other than `Retry-After` are required on successful responses; they are not required on 429 responses. Other methods and routes are not part of this feature contract.

See [contracts/openapi.yaml](./contracts/openapi.yaml) for the machine-readable contract.

## Configuration Schema

The committed `config/demo.json` contains the default tier definitions and clearly fake demo keys for local use and tests. Its format is:

```json
{
  "tiers": {
    "free": { "capacity": 10, "refillRatePerSecond": 1 },
    "pro": { "capacity": 100, "refillRatePerSecond": 10 },
    "enterprise": { "capacity": 1000, "refillRatePerSecond": 100 }
  },
  "clients": {
    "demo-free-not-a-secret": "free",
    "demo-pro-not-a-secret": "pro",
    "demo-enterprise-not-a-secret": "enterprise"
  }
}
```

- Every supported tier must be present. `capacity` must be a finite number of at least one, and `refillRatePerSecond` must be finite and positive. Unknown tier names, missing values, invalid client mappings, and malformed JSON fail startup.
- Each `clients` property name is an exact API key and its value is one of the configured tier names. Configuration errors identify a field or entry index, never the key value.
- By default, the service reads `config/demo.json`. `RATE_LIMITER_CONFIG_FILE` selects another complete JSON configuration file, such as git-ignored `config/local.json`. `RATE_LIMITER_CLIENTS_JSON`, when set, must be a JSON object mapping keys to tiers and replaces the file's `clients` map; the file continues to define the tier limits.
- Add `/Assignment-1/Part-1A/config/local.json` to the repository-root `.gitignore`; never commit it. The environment value and selected file path must not be logged. In production mode, require an explicit non-demo configuration source so committed demo keys are not used as a fallback.
- Values from `RATE_LIMITER_CLIENTS_JSON` take precedence over the file's client map. There is no implicit merge of key maps.

The source of default tier values is configuration rather than constants embedded in rate-limiting logic.

## Data Model

The runtime data shapes and state transitions are defined in [data-model.md](./data-model.md). Configuration owns tier definitions and key-to-tier mappings. Each configured key has an independent ephemeral bucket containing its current token balance and last-refill time. No user request can create an entry for an unknown key.

## Error Handling and Security

- Validate all configuration before starting the listener; return a clear field-level error and non-zero process exit on failure.
- Do not include API-key strings or raw config contents in thrown errors, logs, HTTP response bodies, or headers.
- Keep missing-key (401) and unknown-key (403) outcomes distinct, without exposing whether any other key is valid.
- Register `/health` outside the protected route's key and limiter handling.
- For a depleted bucket, calculate retry seconds as `ceil((1 - availableTokens) / refillRatePerSecond)` with a minimum of one; do not consume a token on denial.
- Use a monotonic production clock. The limiter receives an injected `now()` function in milliseconds; elapsed time less than zero is treated as zero and must not move stored refill time backwards.
- Do not use a distributed store, trust proxy-derived client identity, or add authentication mechanisms outside the requested API-key map.

## Testing and Quality Gates

- **Unit**: tier/config validation, startup errors without secret leakage, initial-full buckets, exact token consumption, refill and capacity cap, fractional balance rounding, exact retry rounding, unchanged state on denial, independent keys, and clock rollback handling.
- **Integration/contract**: health without credentials or bucket use; missing and unknown key status distinction; per-tier headers; 429 retry header; the fixed-clock 20-request/10-allowed concurrency scenario; and restart/reset behavior.
- **Coverage**: Jest coverage for core limiter logic must remain at or above 90% line coverage.
- **Lint/security**: `npm run lint` must pass with the security plugin enabled.
- **Dependency audit**: `npm audit --audit-level=high` must report no high- or critical-severity findings.
- Any failed gate must be fixed without weakening assertions, disabling checks, or changing the approved specification to hide a failure.

## Interfaces (Test Contract)

These exported names and shapes are fixed so that independently authored tests can target them. Time is always supplied as a clock function `now()` that returns milliseconds as a number.

- `src/config/load-config.js` exports `loadConfig({ env, readFile })` and returns `{ tiers, clients }`. On invalid configuration it throws a `ConfigError` whose message names the invalid setting but never contains an API-key value.
- `src/rate-limit/token-bucket.js` exports `createTokenBucket({ capacity, refillRatePerSecond, now })`. The returned object has `tryConsume()`, which returns `{ allowed, remaining, retryAfterSeconds }`. `remaining` is a whole number, and `retryAfterSeconds` is a positive integer when `allowed` is false and `null` when it is true. A rejected call changes no state.
- `src/rate-limit/bucket-store.js` exports `createBucketStore({ config, now })`. The returned object has `has(apiKey)` and `consume(apiKey)`; `consume` returns the same shape as `tryConsume()` plus the tier's `limit`. Buckets are created lazily and only for configured keys.
- `src/app.js` exports `createApp({ config, now })`, which returns an Express app without listening on a port.
- `src/server.js` loads configuration, calls `createApp` with the system clock and listens. It is not unit-tested directly; startup failure (AC-10) is verified through `loadConfig`.


## Project Structure

### Documentation (this feature)

```text
specs/001-tiered-rate-limiter/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── tasks.md                 # Created by /speckit-tasks
```

### Source Code (repository root: `Assignment-1/Part-1A`)

```text
config/
├── demo.json                # Committed; fake keys and default tiers only
└── local.json               # Git-ignored; optional real/local configuration
src/
├── app.js                   # Express app factory and route registration
├── server.js                # Config load, app construction, listen, startup errors
├── config/
│   └── load-config.js       # Config sources and validation
├── middleware/
│   └── rate-limit.js        # API-key lookup and HTTP mapping
└── rate-limit/
    ├── token-bucket.js      # Pure bucket decision logic; injected clock
    └── bucket-store.js      # Per-configured-key in-memory state
tests/                       # Student-authored from the acceptance criteria
├── unit/
│   ├── config.test.js
│   └── token-bucket.test.js
└── integration/
    ├── resource.test.js
    └── health.test.js
harness/                    # Student-authored harness
├── run-harness.js           # Runs lint, security, audit and tests; saves results
├── eslint.config.js         # Lint and eslint-plugin-security rules (gate config)
└── jest.config.js           # Jest config with 90% line-coverage threshold on token-bucket.js
evidence/
├── initial-generation/      # First generated src/ preserved before any repair
├── final-generation/        # Final src/ after any repair
├── harness-results/         # Saved harness outputs from each run
└── harness-log.md           # Student-authored log
package.json
package-lock.json
```

`tests/` and `.harness/` are authored by the student before implementation. The implementing agent does not create or modify them. `evidence/` is maintained by the student.

**Structure Decision**: Use one small JavaScript service with a separate pure limiter module and Express app factory. This keeps policy and clock-driven state testable without networking, while Supertest covers the actual HTTP wiring. A separate frontend, workspace package, database, and external limiter service are unnecessary for this scope.

## Constitution Check (Post-Design)

All pre-design gates remain satisfied. The design has no external state, separates configuration from limiter policy, uses injected monotonic time, preserves the specified Express contract, validates secrets/config without disclosure, and includes the required lint, audit, test, and coverage release gates. No exceptions or complexity justifications are needed.
