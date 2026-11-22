const request = require('supertest');
const { createApp } = require('../../src/app');
const { makeClock, testConfig } = require('../helpers');

function setup() {
  const clock = makeClock();
  const app = createApp({ config: testConfig(), now: clock.now });
  return { clock, app };
}
const get = (app, key) => {
  const r = request(app).get('/api/resource');
  return key === undefined ? r : r.set('X-API-Key', key);
};
const exhaust = async (app, key, n) => { for (let i = 0; i < n; i += 1) await get(app, key); };

describe('GET /api/resource', () => {
  test.each([
    ['test-free-a', '10', '9'],
    ['test-pro', '100', '99'],
    ['test-enterprise', '1000', '999'],
  ])('AC-03: key %s gets 200 with limit %s and remaining %s', async (key, limit, remaining) => {
    const { app } = setup();
    const res = await get(app, key);
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe(limit);
    expect(res.headers['x-ratelimit-remaining']).toBe(remaining);
  });

  test('AC-01: the first 10 requests are allowed and the 11th returns 429', async () => {
    const { app } = setup();
    for (let i = 0; i < 10; i += 1) expect((await get(app, 'test-free-a')).status).toBe(200);
    expect((await get(app, 'test-free-a')).status).toBe(429);
  });

  test('AC-05: a throttled response carries an integer Retry-After', async () => {
    const { app } = setup();
    await exhaust(app, 'test-free-a', 10);
    const res = await get(app, 'test-free-a');
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('1');
    expect(JSON.stringify(res.body)).toContain('rate_limit_exceeded');
  });

  test('AC-06: repeated rejections do not extend the wait', async () => {
    const { app, clock } = setup();
    await exhaust(app, 'test-free-a', 10);
    const first = await get(app, 'test-free-a');
    for (let i = 0; i < 4; i += 1) await get(app, 'test-free-a');
    const last = await get(app, 'test-free-a');
    expect(last.headers['retry-after']).toBe(first.headers['retry-after']);
    clock.advance(1000);
    expect((await get(app, 'test-free-a')).status).toBe(200);
  });

  test('AC-07: exhausting one key leaves another key untouched', async () => {
    const { app } = setup();
    await exhaust(app, 'test-free-a', 11);
    const res = await get(app, 'test-free-b');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-remaining']).toBe('9');
  });

  test('AC-09: missing and blank keys return 401', async () => {
    const { app } = setup();
    const missing = await get(app);
    expect(missing.status).toBe(401);
    expect(JSON.stringify(missing.body)).toContain('missing_api_key');
    expect((await get(app, '')).status).toBe(401);
    expect((await get(app, '   ')).status).toBe(401);
  });

  test('AC-09: an unknown key returns 403 and is never echoed back', async () => {
    const { app } = setup();
    const res = await get(app, 'totally-unknown-key');
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('unknown_api_key');
    expect(res.text).not.toContain('totally-unknown-key');
    expect(JSON.stringify(res.headers)).not.toContain('totally-unknown-key');
  });

  test('AC-12: 20 simultaneous requests give exactly 10 allowed and 10 rejected', async () => {
    const { app } = setup();
    const results = await Promise.all(Array.from({ length: 20 }, () => get(app, 'test-free-a')));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);
  });
});