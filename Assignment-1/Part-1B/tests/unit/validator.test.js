const { validateResult } = require('../../src/validator');
const { NOW, results, cases } = require('../fixtures/reminder-cases');

const clone = (o) => JSON.parse(JSON.stringify(o));
const check = (value, now = NOW) => validateResult(value, { now });
const bad = (base, patch) => ({ ...clone(results[base]), ...patch });

describe('validateResult', () => {
  test('fixtures are marked synthetic', () => {
    expect(cases.every((c) => c.synthetic === true)).toBe(true);
  });

  test.each(Object.keys(results))('AC-02: valid %s result passes', (name) => {
    const r = check(clone(results[name]));
    expect(r).toEqual({ valid: true, errors: [] });
  });

  test('returns exactly { valid, errors } and explains failures', () => {
    const r = check(bad('create', { task: null }));
    expect(Object.keys(r).sort()).toEqual(['errors', 'valid']);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test('does not mutate its input', () => {
    const input = Object.freeze({ ...clone(results.create) });
    expect(() => check(input)).not.toThrow();
    expect(input).toEqual(results.create);
  });

  test.each([
    ['null', null],
    ['an array', []],
    ['a string', 'create_reminder'],
  ])('AC-01: rejects %s', (_n, value) => {
    expect(check(value).valid).toBe(false);
  });

  test('AC-01: rejects a missing field', () => {
    const v = clone(results.create);
    delete v.datetime;
    expect(check(v).valid).toBe(false);
  });

  test('AC-01: rejects an extra field', () => {
    expect(check({ ...clone(results.create), extra: 1 }).valid).toBe(false);
  });

  test.each([
    ['unknown intent', bad('create', { intent: 'delete_everything' })],
    ['non-string task', bad('create', { task: 42 })],
    ['snooze below range', bad('snooze', { snooze_minutes: 0 })],
    ['snooze above range', bad('snooze', { snooze_minutes: 1441 })],
    ['fractional snooze', bad('snooze', { snooze_minutes: 1.5 })],
    ['string snooze', bad('snooze', { snooze_minutes: '30' })],
    ['empty clarification question', bad('clarify', { clarification_question: '' })],
    ['datetime that is not a date', bad('create', { datetime: 'tomorrow evening' })],
  ])('AC-01: rejects %s', (_n, value) => {
    expect(check(value).valid).toBe(false);
  });

  test.each([
    ['create without task', bad('create', { task: null })],
    ['create with empty task', bad('create', { task: '' })],
    ['create without datetime', bad('create', { datetime: null })],
    ['create with snooze_minutes', bad('create', { snooze_minutes: 10 })],
    ['create with a clarification question', bad('create', { clarification_question: 'When?' })],
    ['create datetime equal to now', bad('create', { datetime: NOW })],
    ['create datetime before now', bad('create', { datetime: '2026-11-22T10:00:00+05:30' })],
    ['create datetime that is the same instant in another offset', bad('create', { datetime: '2026-11-23T04:30:00+00:00' })],
    ['create datetime without a UTC offset', bad('create', { datetime: '2026-11-24T18:00:00' })],
    ['reschedule without datetime', bad('reschedule', { datetime: null })],
    ['reschedule datetime in the past', bad('reschedule', { datetime: '2026-11-22T09:00:00+05:30' })],
    ['snooze with a datetime', bad('snooze', { datetime: '2026-11-24T18:00:00+05:30' })],
    ['snooze without minutes', bad('snooze', { snooze_minutes: null })],
    ['clarification with a datetime', bad('clarify', { datetime: '2026-11-24T18:00:00+05:30' })],
    ['clarification with snooze_minutes', bad('clarify', { snooze_minutes: 15 })],
    ['clarification without a question', bad('clarify', { clarification_question: null })],
    ['unsupported with a task', bad('unsupported', { task: 'x' })],
    ['unsupported with a datetime', bad('unsupported', { datetime: '2026-11-24T18:00:00+05:30' })],
    ['unsupported with snooze_minutes', bad('unsupported', { snooze_minutes: 5 })],
    ['unsupported with a question', bad('unsupported', { clarification_question: 'Why?' })],
  ])('AC-02: rejects %s', (_n, value) => {
    expect(check(value).valid).toBe(false);
  });

  test('clarification may carry a task string', () => {
    expect(check(bad('clarify', { task: 'call mom' })).valid).toBe(true);
    expect(check(bad('clarify', { task: null })).valid).toBe(true);
  });

  test('NFR-004: "after now" is judged against the supplied now, not the system clock (far future)', () => {
    const now = '2099-01-01T10:00:00+05:30';
    const early = bad('create', { datetime: '2099-01-01T09:00:00+05:30' });
    expect(check(early, now).valid).toBe(false);
  });

  test('NFR-004: "after now" is judged against the supplied now, not the system clock (far past)', () => {
    const now = '2000-01-01T10:00:00+05:30';
    const later = bad('create', { datetime: '2000-01-02T10:00:00+05:30' });
    expect(check(later, now).valid).toBe(true);
  });
});
