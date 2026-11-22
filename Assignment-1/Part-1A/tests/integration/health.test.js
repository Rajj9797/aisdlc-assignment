const request = require('supertest');
const { createApp } = require('../../src/app');
const { makeClock, testConfig } = require('../helpers');

describe('GET /health', () => {
  test('AC-08: returns 200 without a key and does not touch any bucket', async () => {
    const clock = makeClock();
    const app = createApp({ config: testConfig(), now: clock.now });
    for (let i = 0; i < 10; i += 1) await request(app).get('/api/resource').set('X-API-Key', 'test-free-a');
    const before = await request(app).get('/api/resource').set('X-API-Key', 'test-free-a');
    expect(before.status).toBe(429);

    for (let i = 0; i < 3; i += 1) expect((await request(app).get('/health')).status).toBe(200);

    const after = await request(app).get('/api/resource').set('X-API-Key', 'test-free-a');
    expect(after.status).toBe(429);
    expect(after.headers['retry-after']).toBe(before.headers['retry-after']);
    const untouched = await request(app).get('/api/resource').set('X-API-Key', 'test-free-b');
    expect(untouched.headers['x-ratelimit-remaining']).toBe('9');
  });
});