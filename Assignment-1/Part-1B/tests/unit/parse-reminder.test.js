const fs = require('fs');
const { parseReminder } = require('../../src/index');
const { NOW, TZ, results, stubClient } = require('../fixtures/reminder-cases');

const base = { now: NOW, timezone: TZ };
const REQUEST = 'Remind me to call the dentist tomorrow at 6pm';
const run = (over) => parseReminder({ text: REQUEST, ...base, ...over });

describe('parseReminder: results', () => {
  test.each(Object.keys(results))('AC-01/AC-02: returns a validated %s result after one model call', async (name) => {
    const client = stubClient([results[name]]);
    const out = await run({ client });
    expect(out).toEqual(results[name]);
    expect(client.calls).toHaveLength(1);
  });

  test('FR-015: user text stays in the user message; supplied now and timezone reach the model', async () => {
    const client = stubClient([results.create]);
    await run({ client });
    const { system, user } = client.calls[0];
    expect(system).not.toContain(REQUEST);
    expect(user).toContain(REQUEST);
    expect(`${system}\n${user}`).toContain(NOW);
    expect(`${system}\n${user}`).toContain(TZ);
  });

  test('NFR-004: a datetime earlier than the supplied now is rejected even if it is in the future of the real clock', async () => {
    const client = stubClient([{ ...results.create, datetime: '2099-01-01T09:00:00+05:30' }]);
    const out = await run({ now: '2099-01-01T10:00:00+05:30', client });
    expect(out.error.code).toBe('SERVICE_ERROR');
    expect(client.calls).toHaveLength(2);
  });

  test('NFR-004: a datetime later than the supplied now is accepted even if it is in the past of the real clock', async () => {
    const value = { ...results.create, datetime: '2000-01-02T10:00:00+05:30' };
    const out = await run({ now: '2000-01-01T10:00:00+05:30', client: stubClient([value]) });
    expect(out).toEqual(value);
  });
});

describe('parseReminder: retry and service errors (AC-08)', () => {
  test('retries once after unparseable output', async () => {
    const client = stubClient(['this is not json', results.create]);
    expect(await run({ client })).toEqual(results.create);
    expect(client.calls).toHaveLength(2);
  });

  test('retries once after a failed model call', async () => {
    const client = stubClient([new Error('network down'), results.create]);
    expect(await run({ client })).toEqual(results.create);
    expect(client.calls).toHaveLength(2);
  });

  test('retries once after a contract-invalid result', async () => {
    const client = stubClient([{ ...results.create, extra: true }, results.create]);
    expect(await run({ client })).toEqual(results.create);
    expect(client.calls).toHaveLength(2);
  });

  test.each([
    ['rejections', [new Error('timeout')]],
    ['unparseable output', ['not json at all']],
    ['contract-invalid results', [{ intent: 'create_reminder' }]],
    ['invariant-violating results', [{ ...results.create, datetime: '2026-11-22T10:00:00+05:30' }]],
  ])('two failed attempts (%s) return the SERVICE_ERROR envelope with no intent', async (_n, steps) => {
    const client = stubClient(steps);
    const out = await run({ client });
    expect(out).toEqual({ error: { code: 'SERVICE_ERROR', message: expect.any(String) } });
    expect(out).not.toHaveProperty('intent');
    expect(client.calls).toHaveLength(2);
  });

  test('error messages never contain request text or upstream error text', async () => {
    const client = stubClient([new Error('upstream said SENSITIVE-DETAIL')]);
    const out = await run({ client });
    expect(Object.keys(out)).toEqual(['error']);
    expect(Object.keys(out.error).sort()).toEqual(['code', 'message']);
    expect(out.error.message).not.toContain('SENSITIVE-DETAIL');
    expect(out.error.message).not.toContain(REQUEST);
  });
});

describe('parseReminder: preflight (AC-07, AC-08)', () => {
  test.each([
    ['empty text', ''],
    ['whitespace-only text', '   \n\t'],
    ['a number', 12345],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
    ['501 code points', '\u{1F600}'.repeat(501)],
  ])('AC-07: %s returns unsupported without calling the model', async (_n, text) => {
    const client = stubClient([results.create]);
    const out = await run({ text, client });
    expect(out).toEqual(results.unsupported);
    expect(client.calls).toHaveLength(0);
  });

  test('AC-07: exactly 500 code points is not rejected for length', async () => {
    const client = stubClient([results.clarify]);
    const out = await run({ text: '\u{1F600}'.repeat(500), client });
    expect(out.intent).toBe('needs_clarification');
    expect(client.calls).toHaveLength(1);
  });

  test.each([
    ['invalid now', { now: 'not-a-date' }],
    ['empty now', { now: '' }],
    ['missing now', { now: undefined }],
    ['unknown timezone', { timezone: 'Mars/Phobos' }],
    ['empty timezone', { timezone: '' }],
    ['missing timezone', { timezone: undefined }],
  ])('AC-08: %s returns INVALID_CONTEXT without calling the model', async (_n, over) => {
    const client = stubClient([results.create]);
    const out = await run({ ...over, client });
    expect(out).toEqual({ error: { code: 'INVALID_CONTEXT', message: expect.any(String) } });
    expect(out).not.toHaveProperty('intent');
    expect(client.calls).toHaveLength(0);
  });
});

describe('AC-14: no logging or writing of request text, model output or credentials', () => {
  const KEY = 'KEY-SHOULD-NEVER-APPEAR';
  const MODEL_TEXT = 'MODEL-RESPONSE-SHOULD-NEVER-APPEAR';
  const SECRET_REQUEST = 'SECRET-REQUEST-TEXT remind me to water the plants tomorrow at 7am';
  let spies;
  let savedKey;

  beforeEach(() => {
    savedKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = KEY;
    spies = ['log', 'error', 'warn', 'info', 'debug'].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    spies.push(jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {}));
    spies.push(jest.spyOn(fs, 'appendFileSync').mockImplementation(() => {}));
    spies.push(jest.spyOn(fs, 'writeFile').mockImplementation((...a) => { const cb = a[a.length - 1]; if (typeof cb === 'function') cb(null); }));
    spies.push(jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedKey;
  });

  test.each([
    ['a successful parse', [{ ...results.create, task: MODEL_TEXT }]],
    ['a clarification', [{ ...results.clarify, task: MODEL_TEXT }]],
    ['a refusal', [results.unsupported]],
    ['a service failure', [new Error(MODEL_TEXT)]],
  ])('%s produces no logged or written sensitive content', async (_n, steps) => {
    await parseReminder({ text: SECRET_REQUEST, ...base, client: stubClient(steps) });
    const seen = JSON.stringify(spies.map((s) => s.mock.calls));
    expect(seen).not.toContain('SECRET-REQUEST-TEXT');
    expect(seen).not.toContain(MODEL_TEXT);
    expect(seen).not.toContain(KEY);
  });
});
