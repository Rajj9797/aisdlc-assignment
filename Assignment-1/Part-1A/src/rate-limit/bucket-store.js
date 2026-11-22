const { createTokenBucket } = require('./token-bucket');

function createBucketStore({ config, now }) {
  if (!config || !config.tiers || !config.clients) {
    throw new Error('config must include tiers and clients');
  }
  if (typeof now !== 'function') {
    throw new Error('now must be a function');
  }

  const buckets = new Map();

  function has(apiKey) {
    return typeof apiKey === 'string' && Object.prototype.hasOwnProperty.call(config.clients, apiKey);
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

    const tierName = config.clients[apiKey];
    const tier = config.tiers[tierName];
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
