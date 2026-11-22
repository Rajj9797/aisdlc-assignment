const { createBucketStore } = require('../../src/rate-limit/bucket-store');
const { makeClock, testConfig } = require('../helpers');

describe('bucket store', () => {
  test('has() is true for configured keys and false for unknown keys', () => {
    const store = createBucketStore({ config: testConfig(), now: makeClock().now });
    expect(store.has('test-free-a')).toBe(true);
    expect(store.has('nobody')).toBe(false);
  });

  test('consume() reports the tier capacity as limit', () => {
    const store = createBucketStore({ config: testConfig(), now: makeClock().now });
    expect(store.consume('test-free-a').limit).toBe(10);
    expect(store.consume('test-pro').limit).toBe(100);
    expect(store.consume('test-enterprise').limit).toBe(1000);
  });

  test('AC-07: exhausting one key does not change another key', () => {
    const store = createBucketStore({ config: testConfig(), now: makeClock().now });
    for (let i = 0; i < 10; i += 1) store.consume('test-free-a');
    expect(store.consume('test-free-a').allowed).toBe(false);
    const other = store.consume('test-free-b');
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(9);
  });

  test('AC-11: a new store (restart) starts every bucket full', () => {
    const clock = makeClock();
    const first = createBucketStore({ config: testConfig(), now: clock.now });
    for (let i = 0; i < 10; i += 1) first.consume('test-free-a');
    const second = createBucketStore({ config: testConfig(), now: clock.now });
    expect(second.consume('test-free-a').remaining).toBe(9);
  });
});