// Synthetic fixtures only. No real reminder text.
const NOW = '2026-11-23T10:00:00+05:30';
const TZ = 'Asia/Kolkata';

const results = {
  create: { intent: 'create_reminder', task: 'call the dentist', datetime: '2026-11-24T18:00:00+05:30', snooze_minutes: null, clarification_question: null },
  reschedule: { intent: 'reschedule', task: 'team meeting', datetime: '2026-11-24T15:00:00+05:30', snooze_minutes: null, clarification_question: null },
  snooze: { intent: 'snooze', task: 'laundry', datetime: null, snooze_minutes: 30, clarification_question: null },
  clarify: { intent: 'needs_clarification', task: 'call mom', datetime: null, snooze_minutes: null, clarification_question: 'What time should I remind you?' },
  unsupported: { intent: 'unsupported', task: null, datetime: null, snooze_minutes: null, clarification_question: null },
};

const cases = [
  { synthetic: true, text: 'Remind me to call the dentist tomorrow at 6pm' },
  { synthetic: true, text: 'Snooze my laundry reminder for 30 minutes' },
  { synthetic: true, text: 'Remind me to call mom' },
];

// steps: array of results/strings (resolve) or Error (reject). The last step repeats.
function stubClient(steps) {
  const calls = [];
  return {
    calls,
    async complete(args) {
      calls.push(args);
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      if (step instanceof Error) throw step;
      return typeof step === 'string' ? step : JSON.stringify(step);
    },
  };
}

module.exports = { NOW, TZ, results, cases, stubClient };
