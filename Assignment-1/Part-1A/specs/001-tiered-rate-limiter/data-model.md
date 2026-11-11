# Data Model: Tiered Rate Limiter

## Configuration

### Tier definition

One entry for each supported tier name: `free`, `pro`, and `enterprise`.

| Field | Type | Constraints |
|---|---|---|
| `capacity` | Finite number greater than or equal to 1 | Maximum number of tokens held by a bucket. Defaults are 10, 100, and 1,000 for the respective tiers. |
| `refillRatePerSecond` | Positive finite number | Tokens added per second. Defaults are 1, 10, and 100 for the respective tiers. |

All supported tier entries and both fields are required in a complete configuration. Unsupported tier entries, missing fields, non-numeric values, `NaN`, infinities, capacity below one, or a non-positive refill rate fail startup.

### Client mapping

The `clients` object maps each configured API-key string to exactly one supported tier name.

| Field/value | Type | Constraints |
|---|---|---|
| Object property | Non-blank string | API key used for exact request-header lookup. Never emitted in logs, errors, or response data. |
| Object value | Tier-name string | Must be `free`, `pro`, or `enterprise`, and that tier must be defined in the same configuration. |

Malformed client maps and keys that are blank or map to unsupported/missing tiers fail startup. Diagnostics identify the client entry by index rather than reproducing the key.

## Runtime Bucket

There is one bucket per configured API key that has been used since process startup. A bucket is initialized lazily when a known key makes its first protected request.

| Field | Type | Meaning |
|---|---|---|
| `tokens` | Finite number | Current available balance, including fractional refill, bounded from zero through the tier capacity. |
| `lastRefillAtMs` | Finite monotonic timestamp | Time of the most recent refill calculation; never moves backwards. |

The bucket references its tier's capacity and refill rate through the validated runtime configuration; those values are not copied as mutable bucket state.

### State transitions

1. **Uninitialized → full**: First request for a configured key creates a bucket with `tokens = capacity` and the current injected monotonic time.
2. **Refill**: For a later request, add `max(0, now - lastRefillAtMs) * refillRatePerSecond / 1000`; cap at capacity. For a clock rollback, treat elapsed time as zero and do not move the saved time backwards.
3. **Allowed**: If the balance is at least one, subtract exactly one token and report `floor(tokens)` as `X-RateLimit-Remaining`.
4. **Denied**: If the balance is below one, do not subtract a token. Return `Retry-After = max(1, ceil((1 - tokens) / refillRatePerSecond))`.
5. **Restart**: Process-local buckets are discarded. The next request initializes a full bucket.

The refill/check/debit sequence is synchronous. In one Node.js event loop, the state transition contains no asynchronous yield, so same-process concurrent requests cannot debit the same token twice. Multiple service processes are intentionally outside the consistency guarantee.

## Relationships and Lifetime

- A client API key maps to exactly one tier.
- A tier may be referenced by multiple API keys.
- Each API key maps to at most one runtime bucket in a process.
- Tier and client configuration is read at startup; changing a file or environment value requires a restart.
- Configuration survives process restarts as a file/environment input; bucket state does not.
