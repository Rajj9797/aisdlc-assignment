const express = require('express');
const { createBucketStore } = require('./rate-limit/bucket-store');

function createApp({ config, now }) {
  const app = express();
  const store = createBucketStore({ config, now });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/resource', (req, res) => {
    const rawKey = req.get('X-API-Key');
    if (typeof rawKey !== 'string' || rawKey.trim().length === 0) {
      return res.status(401).json({
        error: 'missing_api_key',
        message: 'X-API-Key is required',
      });
    }

    if (!store.has(rawKey)) {
      return res.status(403).json({
        error: 'unknown_api_key',
        message: 'The API key is not configured',
      });
    }

    const result = store.consume(rawKey);
    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Rate limit exceeded',
      });
    }

    res.set('X-RateLimit-Limit', String(result.limit));
    res.set('X-RateLimit-Remaining', String(result.remaining));
    return res.status(200).json({ status: 'ok' });
  });

  return app;
}

module.exports = { createApp };
