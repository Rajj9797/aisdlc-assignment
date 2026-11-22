# CLI Contract

The CLI accepts exactly one value for each required option:

```text
node src/cli.js --text "Remind me to call the dentist tomorrow at 6pm" \
  --now "2026-11-22T12:00:00Z" --timezone "Asia/Kolkata"
```

| Option | Required | Meaning |
|---|---:|---|
| `--text` | Yes | Reminder request text; spaces are preserved as one value |
| `--now` | Yes | Caller-supplied ISO 8601 timestamp |
| `--timezone` | Yes | Caller-supplied IANA timezone |

The CLI prints exactly one JSON object to stdout: either a successful result matching the
[reminder result schema](./reminder-result.schema.json), or the API error envelope. It does not
print logs or request/response content to stderr. Success, clarification, and unsupported results
exit with status 0. `SERVICE_ERROR` and `INVALID_CONTEXT` exit non-zero. Missing or malformed CLI
options print concise usage to stderr and exit with status 2; they do not call the model.

The CLI loads developer values from the ignored local `.env` via the environment helper. It MUST
not accept an API key on the command line.
