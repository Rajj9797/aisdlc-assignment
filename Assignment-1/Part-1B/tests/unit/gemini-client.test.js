const { createGeminiClient } = require('../../src/gemini-client');

const KEY = 'TEST-KEY-123';
const MODEL = 'test-model';
const okResponse = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
});
const failResponse = (status) => ({
  ok: false,
  status,
  json: async () => ({ error: { message: 'RESPONSE-SECRET' } }),
  text: async () => 'RESPONSE-SECRET',
});
const header = (h, name) => {
  if (!h) return undefined;
  if (typeof h.get === 'function') return h.get(name);
  const hit = Object.entries(h).find(([k]) => k.toLowerCase() === name.toLowerCase());
  return hit ? hit[1] : undefined;
};
const make = (fetchImpl, extra = {}) => createGeminiClient({ apiKey: KEY, model: MODEL, fetchImpl, ...extra });

describe('createGeminiClient', () => {
  test('FR-015: complete() returns the model text', async () => {
    const out = await make(jest.fn().mockResolvedValue(okResponse('{"hello":1}'))).complete({ system: 'sys', user: 'usr' });
    expect(out).toBe('{"hello":1}');
  });

  test('FR-014: sends the key only in the x-goog-api-key header, over HTTPS, never in the URL', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse('{}'));
    await make(fetchImpl).complete({ system: 'sys', user: 'usr' });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\//);
    expect(String(url)).toContain(MODEL);
    expect(String(url)).toContain(':generateContent');
    expect(String(url)).not.toContain(KEY);
    expect(header(opts.headers, 'x-goog-api-key')).toBe(KEY);
  });

  test('uses temperature zero and JSON output mode, and sends both prompts', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse('{}'));
    await make(fetchImpl).complete({ system: 'SYSTEM-PROMPT', user: 'USER-PROMPT' });
    const body = String(fetchImpl.mock.calls[0][1].body);
    expect(body).toContain('"temperature":0');
    expect(body).toContain('application/json');
    expect(body).toContain('SYSTEM-PROMPT');
    expect(body).toContain('USER-PROMPT');
  });

  test.each([500, 429, 403])('rejects on HTTP %i without leaking the key or the response body', async (status) => {
    const client = make(jest.fn().mockResolvedValue(failResponse(status)));
    const err = await client.complete({ system: 's', user: 'u' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain(KEY);
    expect(err.message).not.toContain('RESPONSE-SECRET');
  });

  test('rejects on a network failure without leaking the key', async () => {
    const client = make(jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));
    const err = await client.complete({ system: 's', user: 'u' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain(KEY);
  });

  test('NFR-002: rejects when the attempt exceeds timeoutMs', async () => {
    const fetchImpl = jest.fn((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const client = make(fetchImpl, { timeoutMs: 50 });
    await expect(client.complete({ system: 's', user: 'u' })).rejects.toBeInstanceOf(Error);
  });
});
