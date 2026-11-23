"use strict";

const { parseReminder } = require("./index");
const { loadEnv } = require("./load-env");

const USAGE =
  "Usage: node src/cli.js --text <request> --now <ISO-8601> --timezone <IANA-zone>";
const REQUIRED_OPTIONS = new Set(["--text", "--now", "--timezone"]);

function parseArguments(argv) {
  if (!Array.isArray(argv)) {
    return null;
  }

  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!REQUIRED_OPTIONS.has(option) || values.has(option)) {
      return null;
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) {
      return null;
    }
    values.set(option, value);
    index += 1;
  }

  if (values.size !== REQUIRED_OPTIONS.size) {
    return null;
  }
  return {
    text: values.get("--text"),
    now: values.get("--now"),
    timezone: values.get("--timezone"),
  };
}

async function run(
  argv,
  {
    stdout = process.stdout,
    stderr = process.stderr,
    parseReminder: parse = parseReminder,
  } = {},
) {
  const input = parseArguments(argv);
  if (!input) {
    stderr.write(`${USAGE}\n`);
    return 2;
  }

  const result = await parse(input);
  stdout.write(`${JSON.stringify(result)}\n`);
  return result && typeof result === "object" && "error" in result ? 1 : 0;
}

if (require.main === module) {
  loadEnv();
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

module.exports = { run };
