# Module API Contract

## Public function

```js
const { parseReminder } = require("./src");

const result = await parseReminder({
  text: "Remind me to call the dentist tomorrow at 6pm",
  now: "2026-11-22T12:00:00Z",
  timezone: "Asia/Kolkata"
});
```

`parseReminder` is asynchronous and returns either a successful reminder result matching
[the schema](./reminder-result.schema.json), or the separate error envelope below.

```ts
type ReminderInput = {
  text: unknown;
  now: string;
  timezone: string;
  client?: ReminderClient;
};

type ReminderClient = {
  generate(input: {
    prompt: string;
    signal: AbortSignal;
  }): Promise<string>;
};

type ParseReminderResult =
  | ReminderResult
  | {
      error: {
        code: "SERVICE_ERROR" | "INVALID_CONTEXT";
        message: string;
      };
    };
```

`client` is optional and exists for deterministic tests. A production caller omits it; the
default client reads `GEMINI_API_KEY` and `GEMINI_MODEL` from the process environment. The
injected client's `generate` method returns the candidate JSON text; `parseReminder` parses,
validates, and applies intent invariants before exposing any result.

### Error behavior

- Invalid `now` or IANA timezone returns `{ error: { code: "INVALID_CONTEXT", message } }` without
  invoking the client.
- Empty, non-string, whitespace-only, or over-limit text returns the valid `unsupported` intent
  object without invoking the client.
- Network, HTTP (including 429), timeout, unparseable model response, or invalid model result is
  retried at most once. Exhaustion returns `{ error: { code: "SERVICE_ERROR", message } }`.
- Errors do not contain `intent`, credentials, request text, or model response text.

Only `src/gemini-client.js` performs network I/O. The parser and CLI MUST NOT log or retain request
or response content.
