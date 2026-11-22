function makeClock(start = 0) {
  let current = start;
  return { now: () => current, advance: (ms) => { current += ms; } };
}

const testConfig = () => ({
  tiers: {
    free: { capacity: 10, refillRatePerSecond: 1 },
    pro: { capacity: 100, refillRatePerSecond: 10 },
    enterprise: { capacity: 1000, refillRatePerSecond: 100 },
  },
  clients: {
    'test-free-a': 'free',
    'test-free-b': 'free',
    'test-pro': 'pro',
    'test-enterprise': 'enterprise',
  },
});

module.exports = { makeClock, testConfig };
