# Feature Specification: Tiered Rate Limiter

**Feature Branch**: `001-tiered-rate-limiter`

**Created**: 2026-11-11

**Status**: Draft

**Input**: A tiered rate-limiting HTTP service in which clients identify with an API key, are assigned a free, pro, or enterprise tier, and receive per-client request limits.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Make an allowed resource request (Priority: P1)

A client with a configured API key can request the protected resource while its tier has capacity, and can see its limit and remaining allowance.

**Why this priority**: This is the service's primary value: enforcing fair usage while allowing requests within each client's tier.

**Independent Test**: Configure one API key, request the resource before exhausting its allowance, and verify a successful response and accurate rate-limit headers.

**Acceptance Scenarios**:

1. **Given** a known API key with available tokens, **When** the client requests the resource, **Then** the service allows the request and reports the tier limit and post-request remaining allowance.
2. **Given** two known API keys, **When** one client consumes its full allowance, **Then** the other client's available allowance is unchanged.

---

### User Story 2 - Recover after reaching the limit (Priority: P1)

A client that has used its available allowance receives a clear retry delay and can make another request after enough time has passed.

**Why this priority**: Predictable throttling lets clients respect their tier and recover without confusing or hidden usage behavior.

**Independent Test**: Exhaust a client's allowance, verify the next request is throttled with a whole-second retry delay, then retry after the indicated time and verify it is allowed.

**Acceptance Scenarios**:

1. **Given** a client with less than one token, **When** it requests the resource, **Then** the service returns a rate-limit response with a whole-second retry delay.
2. **Given** a client has been rate limited, **When** it retries after enough refill time, **Then** the service allows the request without having accumulated extra token debt from the rejected request.

---

### User Story 3 - Check service health and identify client errors (Priority: P2)

A caller can check service health without credentials or rate-limit capacity, and a client can distinguish a missing API key from an unrecognized one.

**Why this priority**: Health checks support reliable operation, while distinct client errors help callers correct their requests.

**Independent Test**: Call the health route with no key and with an exhausted client's key; separately call the protected route with a missing key and an unknown key and compare the responses.

**Acceptance Scenarios**:

1. **Given** any rate-limit state, **When** a caller requests the health route, **Then** the service returns success without requiring or consuming a token.
2. **Given** no API key header, **When** a caller requests the protected resource, **Then** the service returns the designated missing-key client error.
3. **Given** an API key not present in configuration, **When** a caller requests the protected resource, **Then** the service returns a different client-error response from the missing-key response.

---

### User Story 4 - Start with valid tier configuration (Priority: P2)

An operator can configure client keys and tier limits, and receives a clear startup failure when tier configuration is invalid.

**Why this priority**: Correct configuration is necessary for reliable tier enforcement and prevents the service from running with ambiguous limits.

**Independent Test**: Start the service with valid defaults and a key mapping, then repeat with an unsupported tier or invalid limit and verify startup fails with an actionable error.

**Acceptance Scenarios**:

1. **Given** valid tier definitions and API-key mappings, **When** the service starts, **Then** it is ready to accept requests using the configured limits.
2. **Given** an unsupported tier, missing required tier value, or non-positive limit, **When** the service starts, **Then** it exits before serving requests and reports the invalid configuration.

### Edge Cases

- A bucket with a fractional balance below one token is treated as exhausted; its retry delay rounds up to a whole second.
- Repeated rejected requests do not reduce the balance or extend the time needed to obtain the next token.
- An API key mapped to a tier that is not configured is invalid configuration and prevents startup.
- The health route remains successful when every configured client's bucket is exhausted.
- A service restart clears in-memory bucket state; each client's bucket starts full on its first request after startup.
- Requests using a method other than GET are outside this feature's protected-resource behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST identify a client using the `X-API-Key` request header and map each configured key to exactly one supported tier: free, pro, or enterprise.
- **FR-002**: The service MUST provide default tier capacities and refill rates of free: 10 tokens and 1 token per second; pro: 100 tokens and 10 tokens per second; enterprise: 1,000 tokens and 100 tokens per second.
- **FR-003**: The service MUST maintain an independent token bucket for each configured client key, initially full, and refill it over time at the configured tier rate up to the tier capacity.
- **FR-004**: A GET request to `/api/resource` with a known key MUST consume exactly one token when at least one token is available and return HTTP 200.
- **FR-005**: An allowed resource response MUST include `X-RateLimit-Limit` equal to the tier capacity and `X-RateLimit-Remaining` equal to the whole-number tokens remaining after the request.
- **FR-006**: A resource request without one full token MUST return HTTP 429 and a `Retry-After` header containing the number of whole seconds, rounded up, until one token is available; rejection MUST NOT consume tokens or create token debt.
- **FR-007**: A GET request to `/health` MUST return HTTP 200 regardless of API-key presence or rate-limit state and MUST NOT consume a token.
- **FR-008**: A protected-resource request without an API-key header MUST receive HTTP 401; a request with an unrecognized key MUST receive HTTP 403.
- **FR-009**: Invalid or incomplete tier configuration, including unsupported tiers, capacity below one token, or non-positive refill values, MUST prevent startup and produce an error identifying the invalid setting without exposing configured API-key values.
- **FR-010**: Rate-limit state MUST be held in memory only, and the service MUST NOT persist it or coordinate rate limits across service instances.
- **FR-011**: The service MUST NOT provide authentication beyond API-key lookup or include a user interface.

### Non-Functional Requirements

- **NFR-001**: Rate-limit decisions MUST be consistent for concurrent requests from the same client: a token MUST NOT be granted to more than one request.
- **NFR-003**: Client-facing responses MUST NOT disclose configured API-key values.

### Acceptance Criteria

- **AC-01**: With default settings and a fixed clock, a newly initialized full free-tier bucket allows the first 10 requests and returns HTTP 429 on the 11th.
- **AC-02**: With default settings, free, pro, and enterprise clients have capacities of 10, 100, and 1,000 tokens and refill rates of 1, 10, and 100 tokens per second, respectively.
- **AC-03**: A request that is allowed consumes exactly one token, returns HTTP 200, and includes the configured capacity in `X-RateLimit-Limit`.
- **AC-04**: `X-RateLimit-Remaining` on an allowed response is the non-negative whole-number token balance after the request, rounded down when the balance is fractional.
- **AC-05**: A client with less than one token receives HTTP 429 and a positive integer `Retry-After` value equal to the wait for one token rounded up to whole seconds. Example: a free-tier bucket holding 0.4 tokens returns `Retry-After: 1`.
- **AC-06**: With an exhausted bucket and a fixed clock, after any number of rejected requests the bucket balance is unchanged and `Retry-After` is identical on every rejection.
- **AC-07**: Two API keys mapped to the same or different tiers have separate bucket state; exhausting one key does not change the other key's remaining allowance.
- **AC-08**: A GET to `/health` returns HTTP 200 without an API key and does not change any client's bucket balance, including when that bucket is exhausted.
- **AC-09**: A GET to `/api/resource` with a missing or blank `X-API-Key` returns HTTP 401; a GET with a non-blank unconfigured key returns HTTP 403.
- **AC-10**: Startup with valid tier configuration succeeds; startup with an unsupported tier, missing required tier limit, capacity below one token, or non-positive refill rate fails before requests are served and identifies the invalid configuration without printing API-key values.
- **AC-11**: After a service restart, previously accumulated in-memory bucket state is absent and each configured client's bucket is initially full.
- **AC-12**: With a fixed clock and a full free-tier bucket, 20 simultaneous requests from one key result in exactly 10 HTTP 200 responses and exactly 10 HTTP 429 responses.

### Key Entities

- **Client API key**: A configured client identifier mapped to one supported tier; its value is not disclosed in client-facing responses.
- **Tier**: A named service level with a token capacity and refill rate.
- **Token bucket**: A client's current available token balance and refill progression, limited by its tier capacity and held only for the lifetime of the service process.
- **Resource request**: A GET request to the protected resource that either consumes one available token or receives a rate-limit response.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of tested allowed protected-resource requests return success and both required rate-limit headers with values matching the configured tier and post-request balance.
- **SC-002**: Across all three default tiers, 100% of requests made without a full token are denied, and the reported retry delay is the correct positive whole-second wait.
- **SC-003**: 100% of tested requests without a key and with an unknown key receive distinct client-error statuses, while health checks succeed in all tested rate-limit states.
- **SC-004**: All invalid tier configurations in the acceptance suite fail before the service accepts requests and identify the invalid setting without disclosing API keys.

## Assumptions

- A client bucket starts at full capacity when the service first handles that client's request after startup.
- Refill is continuous; fractional tokens accumulate, but a resource request requires at least one full token.
- `X-RateLimit-Remaining` reports whole tokens by rounding down, and `Retry-After` rounds up to the next whole second.
- Missing and unknown keys use HTTP 401 and 403 respectively to provide distinct client-error responses.
- A blank API-key header is treated as a missing key.
- Default tier definitions apply unless valid configuration overrides them; configured keys must map to one of the three defined tiers.
- When a request is rate limited, the error response need not include the two success-only rate-limit headers.
- Restarting the process resets all in-memory rate-limit state; persistence and cross-instance coordination are intentionally excluded.
- Configuration is JSON: committed demo configuration provides the default tiers and visibly fake keys; real keys are supplied through a git-ignored local file or an environment variable. The selected configuration behavior is detailed in the implementation plan.
