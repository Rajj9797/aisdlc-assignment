const { loadConfig, ConfigError } = require('../../src/config/load-config');

const SECRET = 'SECRET-KEY-123';
const valid = () => ({
  tiers: {
    free: { capacity: 10, refillRatePerSecond: 1 },
    pro: { capacity: 100, refillRatePerSecond: 10 },
    enterprise: { capacity: 1000, refillRatePerSecond: 100 },
  },
  clients: { [SECRET]: 'free' },
});
const mutate = (fn) => { const c = valid(); fn(c); return c; };
const load = (obj, env = {}) => loadConfig({ env, readFile: () => JSON.stringify(obj) });

describe('loadConfig', () => {
  test('AC-02: valid config returns the default tiers and client map', () => {
    const cfg = load(valid());
    expect(cfg.tiers.free).toEqual({ capacity: 10, refillRatePerSecond: 1 });
    expect(cfg.tiers.pro).toEqual({ capacity: 100, refillRatePerSecond: 10 });
    expect(cfg.tiers.enterprise).toEqual({ capacity: 1000, refillRatePerSecond: 100 });
    expect(cfg.clients[SECRET]).toBe('free');
  });

  test('reads config/demo.json by default and honours RATE_LIMITER_CONFIG_FILE', () => {
    const readFile = jest.fn(() => JSON.stringify(valid()));
    loadConfig({ env: {}, readFile });
    expect(readFile).toHaveBeenCalledWith('config/demo.json');
    loadConfig({ env: { RATE_LIMITER_CONFIG_FILE: 'config/local.json' }, readFile });
    expect(readFile).toHaveBeenLastCalledWith('config/local.json');
  });

  test.each([
    ['unsupported tier for a client', mutate((c) => { c.clients[SECRET] = 'platinum'; })],
    ['missing tier definition', mutate((c) => { delete c.tiers.pro; })],
    ['zero capacity', mutate((c) => { c.tiers.free.capacity = 0; })],
    ['capacity below one', mutate((c) => { c.tiers.free.capacity = 0.5; })],
    ['non-numeric capacity', mutate((c) => { c.tiers.free.capacity = 'ten'; })],
    ['missing refill rate', mutate((c) => { delete c.tiers.free.refillRatePerSecond; })],
    ['zero refill rate', mutate((c) => { c.tiers.free.refillRatePerSecond = 0; })],
    ['negative refill rate', mutate((c) => { c.tiers.free.refillRatePerSecond = -1; })],
    ['blank client key', mutate((c) => { c.clients = { '   ': 'free' }; })],
  ])('AC-10: %s throws a ConfigError without exposing API keys', (_name, cfg) => {
    let error;
    try { load(cfg); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).not.toContain(SECRET);
  });

  test('AC-10: malformed JSON throws a ConfigError without exposing file contents', () => {
    const readFile = () => `{"clients":{"${SECRET}": nope}}`;
    let error;
    try { loadConfig({ env: {}, readFile }); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).not.toContain(SECRET);
  });
});
