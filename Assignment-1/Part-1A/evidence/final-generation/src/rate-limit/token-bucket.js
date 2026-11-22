function isFinitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function createTokenBucket({ capacity, refillRatePerSecond, now }) {
  if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity < 1) {
    throw new Error('capacity must be a finite number greater than or equal to 1');
  }
  if (!isFinitePositive(refillRatePerSecond)) {
    throw new Error('refillRatePerSecond must be a positive finite number');
  }
  if (typeof now !== 'function') {
    throw new Error('now must be a function');
  }

  let tokens = capacity;
  let lastRefillAtMs = now();

  function tryConsume() {
    const currentTime = now();
    const elapsedMs = currentTime - lastRefillAtMs;

    if (elapsedMs > 0) {
      tokens = Math.min(
        capacity,
        tokens + (elapsedMs / 1000) * refillRatePerSecond,
      );
      lastRefillAtMs = currentTime;
    }

    if (tokens >= 1) {
      tokens -= 1;
      return {
        allowed: true,
        remaining: Math.max(0, Math.floor(tokens)),
        retryAfterSeconds: null,
      };
    }

    const waitSeconds = (1 - tokens) / refillRatePerSecond;
    return {
      allowed: false,
      remaining: Math.max(0, Math.floor(tokens)),
      retryAfterSeconds: Math.max(1, Math.ceil(waitSeconds)),
    };
  }

  return { tryConsume };
}

module.exports = { createTokenBucket };
