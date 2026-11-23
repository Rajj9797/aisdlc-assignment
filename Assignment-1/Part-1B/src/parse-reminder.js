"use strict";

const { createGeminiClient } = require("./gemini-client");
const { buildReminderPrompt } = require("./prompts/reminder");
const { validateResult } = require("./validator");
const { isIsoDateTime } = require("./time");

const UNSUPPORTED_RESULT = Object.freeze({
  intent: "unsupported",
  task: null,
  datetime: null,
  snooze_minutes: null,
  clarification_question: null,
});

function isValidTimezone(timezone) {
  if (typeof timezone !== "string" || timezone.length === 0) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch (error) {
    if (error instanceof RangeError) {
      return false;
    }
    throw error;
  }
}

function errorEnvelope(code, message) {
  return { error: { code, message } };
}

async function parseReminder({ text, now, timezone, client } = {}) {
  if (
    typeof text !== "string" ||
    text.trim().length === 0 ||
    Array.from(text).length > 500
  ) {
    return { ...UNSUPPORTED_RESULT };
  }

  if (!isIsoDateTime(now) || !isValidTimezone(timezone)) {
    return errorEnvelope(
      "INVALID_CONTEXT",
      "The supplied time or timezone is invalid.",
    );
  }

  const modelClient =
    client ||
    createGeminiClient({
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL,
    });
  const prompt = buildReminderPrompt({ text, now, timezone });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let raw;
    try {
      raw = await modelClient.complete(prompt);
    } catch {
      continue;
    }

    if (typeof raw !== "string") {
      continue;
    }

    let candidate;
    try {
      candidate = JSON.parse(raw);
    } catch (error) {
      if (error instanceof SyntaxError) {
        continue;
      }
      throw error;
    }

    const validation = validateResult(candidate, { now });
    if (validation.valid) {
      return candidate;
    }
  }

  return errorEnvelope("SERVICE_ERROR", "The model service could not return a valid result.");
}

module.exports = { parseReminder };
