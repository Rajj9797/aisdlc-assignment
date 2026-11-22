const { createTokenBucket } = require('./token-bucket');

function createBucketStore({ config, now }) {
  if (!config || !config.tiers || !config.clients) {
    throw new Error('config must include tiers and clients');
  }
  if (typeof now !== 'function') {
    throw new Error('now must be a function');
  }

  const clients = new Map(Object.entries(config.clients));
  const tiers = new Map(Object.entries(config.tiers));
  const buckets = new Map();

  function has(apiKey) {
    return typeof apiKey === 'string' && clients.has(apiKey);
  }

  function consume(apiKey) {
    if (!has(apiKey)) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 1,
        limit: 0,
      };
    }

    const tierName = clients.get(apiKey);
    const tier = tiers.get(tierName);
    let bucket = buckets.get(apiKey);

    if (!bucket) {
      bucket = createTokenBucket({
        capacity: tier.capacity,
        refillRatePerSecond: tier.refillRatePerSecond,
        now,
      });
      buckets.set(apiKey, bucket);
    }

    return {
      ...bucket.tryConsume(),
      limit: tier.capacity,
    };
  }

  return { has, consume };
}

module.exports = { createBucketStore };
