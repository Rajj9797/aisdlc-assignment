---
description: "Implementation tasks for the tiered rate limiter"
---

# Tasks: Tiered Rate Limiter

**Input**: Design documents from `specs/001-tiered-rate-limiter/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`

**Tests**: Acceptance tests in `tests/` and the harness in `.harness/` (including the lint and coverage configs) are pre-supplied and student-authored. Do not create, modify or run them to self-correct. Tasks below implement only the service source and configuration; the student runs the harness after implementation.

**Organization**: Tasks are grouped by approved user story. Each task implements behavior from the feature spec and cites its related FR/AC identifiers.

## Phase 1: Setup

**Purpose**: Establish the Node.js project and required quality tooling without touching supplied tests, harness or gate configuration.

- [x] T001 Project setup (student-performed before implementation): `package.json` and `package-lock.json` for Node.js CommonJS with Express 5, Jest, Supertest, ESLint and `eslint-plugin-security`, with `start`, `test`, `test:coverage` and `lint` scripts pointing at the configs in `.harness/` (constitution quality gates).
- [x] T003 Add `**/config/local.json` to `Assignment-1/.gitignore` so local credentials cannot be committed (student-performed) (FR-009, FR-011; NFR-003).

## Phase 2: Foundational

**Purpose**: Provide deterministic time as a shared prerequisite for token-bucket behavior and acceptance validation.

- [ ] T004 Implement the production monotonic clock factory in `src/rate-limit/clock.js`, exposing milliseconds from `performance.now()` and allowing an injected clock to be passed to limiter logic; do not call `Date.now()` in core limiter code (FR-003, AC-01, AC-05, AC-06, AC-12).

**Checkpoint**: The project scripts and injectable clock are ready. User-story work can proceed; tests and harness remain unchanged.

## Phase 3: User Story 1 - Make an allowed resource request (Priority: P1) 🎯 MVP

**Goal**: A configured client can consume one available token per resource request and receive a successful response with accurate tier headers.

**Independent Test**: Using a known key and a fixed clock, request `GET /api/resource`; verify HTTP 200, the configured capacity, and the post-consumption whole-token balance. Repeat with a second key and verify its balance is independent.

### Implementation for User Story 1

- [ ] T005 [P] [US1] Implement the initial-full token bucket in `src/rate-limit/token-bucket.js`, exporting `createTokenBucket({ capacity, refillRatePerSecond, now })`; the bucket starts full with its last-refill time set to `now()` at creation, and the returned object has a synchronous `tryConsume()` returning `{ allowed, remaining, retryAfterSeconds }`; preserve fractional balance, allow only when at least one token is available, and report whole tokens by rounding down (FR-003, FR-004, FR-005; AC-01, AC-03, AC-04).
- [ ] T006 [P] [US1] Implement the per-configured-key in-memory bucket map in `src/rate-limit/bucket-store.js`, exporting `createBucketStore({ config, now })` with `has(apiKey)` and `consume(apiKey)`; `consume` returns the token-bucket result plus the tier's `limit`; create a separate bucket lazily for each known API key and never create state for unknown keys (FR-001, FR-003, FR-010; AC-07, AC-11).
- [ ] T007 [US1] Implement the Express app factory and `GET /api/resource` success path in `src/app.js`, exporting `createApp({ config, now })` which returns an Express app without listening on a port; `src/app.js` owns routing, key lookup and the HTTP mapping of limiter results (there is no separate middleware module); resolve the configured key's tier, consume one token, and return HTTP 200 with `X-RateLimit-Limit` and `X-RateLimit-Remaining` (FR-001, FR-004, FR-005; AC-02, AC-03, AC-04).

## Phase 4: User Story 2 - Recover after reaching the limit (Priority: P1)

**Goal**: A depleted bucket rejects requests without consuming tokens and tells the client when it can retry.

**Independent Test**: With a fixed clock, exhaust a bucket, verify HTTP 429 and a positive whole-second `Retry-After`, verify repeated rejects do not change the balance, then advance time until a request can be allowed.

### Implementation for User Story 2

- [ ] T008 [US2] Add elapsed-time refill, capacity capping, and nondecreasing refill timestamps to `src/rate-limit/token-bucket.js`; calculate a retry delay as the positive whole seconds rounded up until one token is available, without debiting a rejected request (FR-003, FR-006; AC-05, AC-06).
- [ ] T009 [US2] Map denied consume results to HTTP 429 and the integer `Retry-After` header in `src/app.js`, preserving HTTP 200 and success headers for allowed requests (FR-004, FR-006; AC-01, AC-05, AC-06, AC-12).

## Phase 5: User Story 3 - Check service health and identify client errors (Priority: P2)

**Goal**: Health checks bypass credentials and rate-limit state, and protected requests distinguish missing keys from unknown keys without disclosing secrets.

**Independent Test**: Call `GET /health` without a key before and after exhausting a bucket; verify HTTP 200 and unchanged bucket state. Verify missing/blank keys return 401 and unknown non-blank keys return 403 with safe error bodies.

### Implementation for User Story 3

- [ ] T010 [US3] Add `GET /health` to `src/app.js` outside API-key lookup and rate-limit handling; return HTTP 200 without accessing any bucket (FR-007; AC-08).
- [ ] T011 [US3] Add distinct safe error responses for missing/blank and unknown `X-API-Key` values in `src/app.js`; return 401 and 403 respectively and never echo the supplied key (FR-008, FR-011; AC-09).

## Phase 6: User Story 4 - Start with valid tier configuration (Priority: P2)

**Goal**: Operators can run with the committed fake demo keys or select another JSON file with RATE_LIMITER_CONFIG_FILE, while invalid configuration stops startup clearly.

**Independent Test**: Start using the committed demo JSON and verify valid keys map to all three default tiers. Start with malformed JSON, unsupported or missing tier values, and invalid client mappings; verify each invalid case exits before listening and emits no API-key value.

### Implementation for User Story 4

- [ ] T012 [P] [US4] Create `config/demo.json` with free `{ "capacity": 10, "refillRatePerSecond": 1 }`, pro `{ "capacity": 100, "refillRatePerSecond": 10 }`, and enterprise `{ "capacity": 1000, "refillRatePerSecond": 100 }` tiers plus visibly fake demo keys mapped to each tier (FR-001, FR-002; AC-02).
- [ ] T013 [US4] Implement JSON configuration loading and validation in `src/config/load-config.js`, exporting `loadConfig({ env, readFile })` and `ConfigError`; read the file named by `env.RATE_LIMITER_CONFIG_FILE`, defaulting to `config/demo.json`, using the synchronous `readFile(path)` that returns a string; return `{ tiers, clients }`; require all three tier definitions, finite capacity values greater than or equal to one, finite positive refill rates, non-blank client keys, and client values naming a configured tier; throw a `ConfigError` that names the invalid field or entry index and never contains an API-key value (FR-001, FR-002, FR-009; AC-02, AC-10).
- [ ] T015 [US4] Implement startup in `src/server.js`: read the port from `PORT` (default 3000), call `loadConfig` before `listen`, construct the app with the production monotonic clock and a fresh in-memory store, and on a `ConfigError` print a secret-safe message and exit non-zero (FR-009, FR-010; AC-10, AC-11).

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Make startup failures safe. Validation against the acceptance tests and release gates is performed by the student's harness after implementation, not by the implementing agent.

- [ ] T016 Handle failures other than `ConfigError` during startup in `src/server.js` (for example the port already being in use or an unexpected exception): print a secret-safe message, exit non-zero, and ensure no request headers, API keys, raw configuration or parser input are written to logs or responses (FR-009, FR-011; AC-10).

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No user-story dependencies.
- **Foundational (Phase 2)**: Depends on project setup; T004 blocks time-dependent limiter behavior.
- **User Stories (Phase 3+)**: All depend on project setup and the injectable clock. User Story 2 depends on User Story 1's bucket and resource route. User Story 3 depends on the app factory from User Story 1. User Story 4 depends on the app factory contract from User Story 1 so the validated configuration can be passed into it; it does not depend on the throttle or health behavior.
- **Polish (Phase 7)**: Depends on all four user stories.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Setup and Foundational; no dependency on another story.
- **User Story 2 (P1)**: Depends on User Story 1's consume result and `/api/resource` route.
- **User Story 3 (P2)**: Depends on User Story 1's Express app factory; independent of User Story 2.
- **User Story 4 (P2)**: Depends on User Story 1's app factory input contract; independent of User Stories 2 and 3.

### Parallel Opportunities

- T003 is student-performed; T004 can run alongside it.
- In User Story 1, T005 and T006 touch separate files and can be implemented in parallel; T007 integrates them afterward.
- User Story 3 and User Story 4 can proceed in parallel after User Story 1 because they work in `src/app.js` and `config/`/`src/config/`; User Story 2 is a separate required dependency only for throttling.
- User Story 2's token-bucket change (T008) and HTTP response mapping (T009) share a behavior contract and should be coordinated, not merged into independent edits of `src/app.js`.

## Parallel Execution Examples

### User Story 1

```text
Parallel: T005 in src/rate-limit/token-bucket.js
Parallel: T006 in src/rate-limit/bucket-store.js
Then:     T007 in src/app.js integrates both
```

### User Stories 3 and 4 (after User Story 1)

```text
Parallel: T010-T011 in src/app.js and T012 in config/demo.json
Parallel: T013 in src/config/load-config.js
Then:     T015 in src/server.js
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup and Foundational phases.
2. Implement User Story 1 and leave verification to the student's harness.
3. This MVP allows configured clients to access the resource within their tier and reports correct limit/remaining headers.

### Incremental Delivery

1. Add User Story 2 to enforce refill, exhaustion, and retry guidance.
2. Add User Story 3 to provide unthrottled health checks and explicit safe client errors.
3. Add User Story 4 to validate configuration and run the actual server with the demo or a selected config file.
4. Stop after the source tasks. The student runs the supplied tests and harness.

### User Story Independent Test Criteria

- **US1**: A known configured client receives HTTP 200; exactly one token is consumed and the two rate-limit headers reflect tier capacity and remaining balance.
- **US2**: An exhausted client receives HTTP 429 and a positive integer retry delay; repeated rejects do not debit the bucket, and refill eventually permits a request.
- **US3**: Health returns HTTP 200 without a key and does not change buckets; missing/blank and unknown keys return distinct 401/403 errors without echoing key values.
- **US4**: Valid demo configuration starts with the documented default tiers; invalid tier/config values stop startup with safe actionable errors, while RATE_LIMITER_CONFIG_FILE can select another config file.

## Notes

- Task IDs are sequential; `[P]` appears only where file ownership permits parallel work.
- Every implementation task has a user-story label, concrete project path, and related requirement/acceptance-criterion identifiers.
- No task creates or modifies `tests/` or `.harness/`.
