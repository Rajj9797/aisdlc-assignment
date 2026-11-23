"use strict";

const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
const schema = require("./schema");
const { isIsoDateTime } = require("./time");

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function validateResult(value, { now } = {}) {
  const errors = [];
  if (!validateSchema(value)) {
    errors.push(...(validateSchema.errors || []).map((error) => error.message));
  }

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value.intent === "create_reminder" || value.intent === "reschedule")
  ) {
    if (
      typeof value.datetime === "string" &&
      !/[+-]\d{2}:\d{2}$/.test(value.datetime)
    ) {
      errors.push("datetime must include an explicit numeric UTC offset");
    }
    if (!isIsoDateTime(now)) {
      errors.push("now must be a valid ISO 8601 datetime");
    } else if (
      isIsoDateTime(value.datetime) &&
      Date.parse(value.datetime) <= Date.parse(now)
    ) {
      errors.push("datetime must be strictly after now");
    }
  }

  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.intent === "create_reminder" &&
    typeof value.task === "string" &&
    value.task.trim().length === 0
  ) {
    errors.push("task must not be empty");
  }
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.intent === "needs_clarification" &&
    typeof value.clarification_question === "string" &&
    value.clarification_question.trim().length === 0
  ) {
    errors.push("clarification_question must not be empty");
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateResult };
