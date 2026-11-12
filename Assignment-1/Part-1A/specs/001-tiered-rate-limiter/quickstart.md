# Quickstart: Tiered Rate Limiter

## Prerequisites

- Node.js 22 LTS and npm
- The project dependency lockfile, after implementation

## Install and validate

From `Assignment-1/Part-1A`:

```sh
npm ci
npm test
npm run test:coverage
npm run lint
npm audit --audit-level=high
```

Expected results:

- Unit and Supertest suites pass.
- Core token-bucket line coverage is at least 90%.
- ESLint, including `eslint-plugin-security`, reports no errors.
- npm audit reports no high- or critical-severity findings.

## Run the service with demo configuration

```sh
npm start
```

The default configuration is `config/demo.json`. It must contain only obviously fake demo keys. The service listens on port 3000 unless `PORT` is set.

In another terminal:

```sh
curl -i http://localhost:3000/health
curl -i -H 'X-API-Key: demo-free-not-a-secret' http://localhost:3000/api/resource
```

Expected:

- Health returns HTTP 200 without rate-limit headers or a key.
- The resource request returns HTTP 200 and includes `X-RateLimit-Limit: 10` and `X-RateLimit-Remaining: 9`.
- After ten successful free-tier requests without waiting for refill, the next request returns HTTP 429 with a positive integer `Retry-After`.

## Use real/local credentials

To use real keys, create the git-ignored file `config/local.json` (same format as `config/demo.json`) and start the service with:

```bash
RATE_LIMITER_CONFIG_FILE=config/local.json npm start
```

Do not commit `config/local.json`, and do not put real keys in shell history or documentation.

## Deterministic rate-limit validation

Run the Jest suite for `src/rate-limit/token-bucket.js` with a fake injected clock. Advance time by controlled millisecond intervals instead of sleeping. Validate initial capacity, one-token debit, fractional refill, capacity ceiling, exact `Retry-After` rounding, rejection without debit, independent client buckets, and rollback handling.

For HTTP integration, use Supertest with the app factory and a fixed clock. Verify the routes and status/header contract in [contracts/openapi.yaml](./contracts/openapi.yaml), including the exact 10-allowed/10-rejected result for 20 simultaneous free-tier requests against one full bucket.
