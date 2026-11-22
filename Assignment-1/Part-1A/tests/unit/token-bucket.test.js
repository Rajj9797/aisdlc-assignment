const { createTokenBucket } = require('../../src/rate-limit/token-bucket');

function makeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    set: (ms) => { current = ms; },
    advance: (ms) => { current += ms; },
  };
}

const TIERS = {
  free: { capacity: 10, refillRatePerSecond: 1 },
  pro: { capacity: 100, refillRatePerSecond: 10 },
  enterprise: { capacity: 1000, refillRatePerSecond: 100 },
};

function bucketFor(tier, clock) {
  return createTokenBucket({ ...TIERS[tier], now: clock.now });
}

function drain(bucket, count) {
  const results = [];
  for (let i = 0; i < count; i += 1) results.push(bucket.tryConsume());
  return results;
}

describe('token bucket', () => {
  test('AC-01: full free bucket allows 10 requests and rejects the 11th', () => {
    const bucket = bucketFor('free', makeClock());
    const results = drain(bucket, 11);
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(results[10].allowed).toBe(false);
  });

  test.each([
    ['free', 10, 1],
    ['pro', 100, 10],
    ['enterprise', 1000, 100],
  ])('AC-02: %s tier allows %i requests and refills %i token(s) per second', (tier, capacity, rate) => {
    const clock = makeClock();
    const bucket = bucketFor(tier, clock);
    expect(drain(bucket, capacity).every((r) => r.allowed)).toBe(true);
    expect(bucket.tryConsume().allowed).toBe(false);
    clock.advance(1000);
    expect(drain(bucket, rate).every((r) => r.allowed)).toBe(true);
    expect(bucket.tryConsume().allowed).toBe(false);
  });

  test('AC-03: an allowed request consumes exactly one token', () => {
    const bucket = bucketFor('free', makeClock());
    expect(bucket.tryConsume()).toEqual({ allowed: true, remaining: 9, retryAfterSeconds: null });
    expect(bucket.tryConsume().remaining).toBe(8);
  });

  test('AC-04: remaining is a whole number rounded down from a fractional balance', () => {
    const clock = makeClock();
    const bucket = bucketFor('free', clock);
    drain(bucket, 10);
    clock.advance(2500); // balance 2.5, then 1.5 after consuming
    const result = bucket.tryConsume();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  test('AC-04: remaining is never negative or fractional, even when rejected', () => {
    const clock = makeClock();
    const bucket = bucketFor('free', clock);
    drain(bucket, 10);
    clock.advance(400);
    const rejected = bucket.tryConsume();
    expect(rejected.allowed).toBe(false);
    expect(Number.isInteger(rejected.remaining)).toBe(true);
    expect(rejected.remaining).toBeGreaterThanOrEqual(0);
  });

  test('AC-05: exhausted free bucket returns a positive integer retryAfterSeconds', () => {
    const bucket = bucketFor('free', makeClock());
    drain(bucket, 10);
    const rejected = bucket.tryConsume();
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBe(1);
  });

  test('AC-05: 0.4 tokens at 1 token/s rounds up to a 1 second retry', () => {
    const clock = makeClock();
    const bucket = bucketFor('free', clock);
    drain(bucket, 10);
    clock.advance(400);
    expect(bucket.tryConsume().retryAfterSeconds).toBe(1);
  });

  test('AC-05: slow refill rounds the retry delay up to whole seconds', () => {
    const clock = makeClock();
    const bucket = createTokenBucket({ capacity: 2, refillRatePerSecond: 0.5, now: clock.now });
    drain(bucket, 2);
    clock.advance(500); // balance 0.25; needs 0.75 more at 0.5/s = 1.5s
    expect(bucket.tryConsume().retryAfterSeconds).toBe(2);
  });

  test('AC-05: retry delay is at least 1 second even when a token returns sooner', () => {
    const bucket = bucketFor('pro', makeClock());
    drain(bucket, 100);
    expect(bucket.tryConsume().retryAfterSeconds).toBe(1);
  });

  test('AC-06: rejected requests do not change the balance or the retry delay', () => {
    const clock = makeClock();
    const bucket = bucketFor('free', clock);
    drain(bucket, 10);
    const rejections = drain(bucket, 5);
    expect(rejections.every((r) => !r.allowed)).toBe(true);
    expect(new Set(rejections.map((r) => r.retryAfterSeconds)).size).toBe(1);
    clock.advance(1000);
    expect(bucket.tryConsume().allowed).toBe(true);
    expect(bucket.tryConsume().allowed).toBe(false);
  });

  test('refill never exceeds capacity after a long idle period', () => {
    const clock = makeClock();
    const bucket = bucketFor('free', clock);
    clock.advance(60 * 60 * 1000);
    const results = drain(bucket, 11);
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(results[10].allowed).toBe(false);
  });

  test('bucket starts full relative to the clock value at creation', () => {
    const bucket = bucketFor('free', makeClock(5000));
    expect(drain(bucket, 10).every((r) => r.allowed)).toBe(true);
  });

  test('clock rollback adds no tokens and does not move the refill time backwards', () => {
    const clock = makeClock(10000);
    const bucket = bucketFor('free', clock);
    drain(bucket, 10);
    clock.set(5000);
    expect(bucket.tryConsume().allowed).toBe(false);
    clock.set(11000); // 1s after the last real refill point
    const result = bucket.tryConsume();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  test('constitution III: core limiter never reads Date.now directly', () => {
    const spy = jest.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now must not be called by limiter logic');
    });
    try {
      const clock = makeClock();
      const bucket = bucketFor('free', clock);
      drain(bucket, 11);
      clock.advance(1000);
      bucket.tryConsume();
    } finally {
      spy.mockRestore();
    }
  });
});