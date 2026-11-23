const { run } = require('../../src/cli');
const { NOW, TZ, results } = require('../fixtures/reminder-cases');

const TEXT = 'Remind me to call the dentist tomorrow at 6pm';
const sink = () => {
  const chunks = [];
  return { write: (s) => { chunks.push(String(s)); return true; }, text: () => chunks.join('') };
};
const args = ['--text', TEXT, '--now', NOW, '--timezone', TZ];
const go = async (argv, parseReminder) => {
  const stdout = sink();
  const stderr = sink();
  const code = await run(argv, { stdout, stderr, parseReminder });
  return { code, stdout, stderr };
};

describe('cli run()', () => {
  test('AC-09: passes the options to parseReminder, prints one JSON result, exits 0', async () => {
    const parse = jest.fn().mockResolvedValue(results.create);
    const { code, stdout, stderr } = await go(args, parse);
    expect(code).toBe(0);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][0]).toMatchObject({ text: TEXT, now: NOW, timezone: TZ });
    expect(JSON.parse(stdout.text())).toEqual(results.create);
    expect(stderr.text()).toBe('');
  });

  test('an error envelope is printed as one JSON document and exits 1', async () => {
    const envelope = { error: { code: 'SERVICE_ERROR', message: 'Model service unavailable' } };
    const { code, stdout } = await go(args, jest.fn().mockResolvedValue(envelope));
    expect(code).toBe(1);
    expect(JSON.parse(stdout.text())).toEqual(envelope);
  });

  test('an unsupported result is still a result and exits 0', async () => {
    const { code } = await go(args, jest.fn().mockResolvedValue(results.unsupported));
    expect(code).toBe(0);
  });

  test.each([
    ['missing --timezone', ['--text', TEXT, '--now', NOW]],
    ['missing --now', ['--text', TEXT, '--timezone', TZ]],
    ['missing --text', ['--now', NOW, '--timezone', TZ]],
    ['duplicate --text', [...args, '--text', 'again']],
    ['an unknown option', [...args, '--verbose']],
    ['an option without a value', ['--now', NOW, '--timezone', TZ, '--text']],
    ['no arguments', []],
  ])('%s exits 2 with usage on stderr, nothing on stdout, and no parse call', async (_n, argv) => {
    const parse = jest.fn();
    const { code, stdout, stderr } = await go(argv, parse);
    expect(code).toBe(2);
    expect(parse).not.toHaveBeenCalled();
    expect(stdout.text()).toBe('');
    expect(stderr.text().length).toBeGreaterThan(0);
    expect(stderr.text()).not.toContain(TEXT);
  });
});
