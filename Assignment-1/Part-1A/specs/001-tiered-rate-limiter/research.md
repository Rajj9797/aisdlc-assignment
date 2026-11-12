# Research: Tiered Rate Limiter

**Date**: 2026-11-11

## Decisions

### Service structure and HTTP integration

- **Decision**: Use an Express app factory; keep API-key lookup and response mapping in route wiring in src/app.js, and keep token-bucket calculations in an independent module. This also fixes the typo “lookupand”.
- **Rationale**: Express middleware runs in request order and must either complete a response or pass control onward. A separate limiter makes state transitions independently unit-testable and lets Supertest exercise the same app without production startup side effects.
- **Alternatives considered**: Use a prebuilt rate-limit package, or put lookup, bucket math, and HTTP behavior in one route. A generic rate-limit package may implement a different policy or store model than this spec's token bucket. A monolithic handler makes deterministic boundary tests and secret-safe error handling harder to isolate.

### Token-bucket state and clock

- **Decision**: Keep one lazy bucket per configured API key in a process-local `Map`. Store current fractional tokens and last-refill monotonic time in milliseconds. Inject a `now()` clock into the bucket logic; use Node's monotonic `performance.now()` for production.
- **Rationale**: Monotonic elapsed time is unaffected by wall-clock corrections, and an injected clock makes refill, exhaustion, and retry behavior deterministic. Only configured keys can create buckets, bounding state to configured client count. A synchronous refill/check/debit transition is atomic with respect to other handlers in the single Node process.
- **Alternatives considered**: Use `Date.now()` directly, which is not deterministic and can move backwards; use a fixed-window limiter, which does not match the accepted token-bucket requirements; use a shared store, which is excluded by scope.
- **Clock rollback behavior**: Treat negative elapsed time as zero and never move a bucket's stored refill timestamp backwards.

### Configuration and API-key secrets

- **Decision**: Store tiers and the client-to-tier map in JSON. Commit config/demo.jsonwith the default tier values and visibly fake keys. Support a complete alternative file selected byRATE_LIMITER_CONFIG_FILE. Ignore config/local.json.
- **Rationale**: JSON is directly supported by Node and keeps the schema inspectable without adding a parser dependency. Demo values enable tests and local examples without being credentials. Explicit overrides allow real keys without committing them, and environment precedence is unambiguous. Preventing the demo file from becoming a production fallback avoids accidental deployment with sample credentials.
- **Alternatives considered**: Put real keys in committed defaults (rejected because secrets must never be committed); merge key maps implicitly (rejected because precedence and accidental demo-key retention would be surprising); add a secrets-manager integration (outside the requested scope).

### Test and release gates

- **Decision**: Use Jest for unit/integration tests and coverage, Supertest for the Express app, ESLint with `eslint-plugin-security`, and `npm audit --audit-level=high`.
- **Rationale**: The selected test stack matches the user request; injected time avoids sleeping in tests. Supertest exercises routing and headers without a separate manually managed server. ESLint/security and npm audit provide the release checks required by the constitution.
- **Alternatives considered**: Timer-based tests with real delays (slower and timing-sensitive); source-only tests that skip HTTP behavior (miss route wiring); a custom dependency scanner (unnecessary when npm audit is mandated).
- **Audit threshold**: High and critical findings fail the gate, as required by the constitution; lower-severity findings are recorded but are not this release gate.

## References

- Express, “Using middleware”: https://expressjs.com/en/guide/using-middleware.html
- Node.js, `perf_hooks` and monotonic `performance.now()`: https://nodejs.org/api/perf_hooks.html
- Jest timer mocks: https://jestjs.io/docs/timer-mocks
- Supertest: https://github.com/ladjs/supertest
- ESLint security plugin: https://github.com/eslint-community/eslint-plugin-security
- npm audit: https://docs.npmjs.com/cli/v11/commands/npm-audit
- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

Research retrieval verified the Express middleware guide, Node module/performance documentation, and npm audit documentation. Jest, Supertest, ESLint security, and OWASP references were identified for the plan; their pages were not all retrievable in the research environment.
