const { createTokenBucket } = require('../../src/rate-limit/token-bucket');

const valid = { capacity: 10, refillRatePerSecond: 1, now: () => 0 };

describe('token bucket argument validation (defensive behavior)', () => {
  test.each([
    ['zero capacity', { capacity: 0 }],
    ['capacity below one', { capacity: 0.5 }],
    ['negative capacity', { capacity: -5 }],
    ['non-numeric capacity', { capacity: '10' }],
    ['infinite capacity', { capacity: Infinity }],
    ['NaN capacity', { capacity: NaN }],
  ])('rejects %s', (_name, override) => {
    expect(() => createTokenBucket({ ...valid, ...override })).toThrow(/capacity/);
  });

  test.each([
    ['zero refill rate', { refillRatePerSecond: 0 }],
    ['negative refill rate', { refillRatePerSecond: -1 }],
    ['non-numeric refill rate', { refillRatePerSecond: '1' }],
    ['infinite refill rate', { refillRatePerSecond: Infinity }],
  ])('rejects %s', (_name, override) => {
    expect(() => createTokenBucket({ ...valid, ...override })).toThrow(/refillRatePerSecond/);
  });

  test.each([
    ['missing clock', { now: undefined }],
    ['non-function clock', { now: 12345 }],
  ])('rejects %s', (_name, override) => {
    expect(() => createTokenBucket({ ...valid, ...override })).toThrow(/now/);
  });

  test('accepts valid arguments', () => {
    expect(() => createTokenBucket(valid)).not.toThrow();
  });
});