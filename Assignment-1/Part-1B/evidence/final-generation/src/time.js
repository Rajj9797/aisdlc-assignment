"use strict";

function hasDigits(value, start, end) {
  for (let index = start; index < end; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}

function isIsoDateTime(value) {
  if (typeof value !== "string" || value.length < 20 || value.length > 35) {
    return false;
  }

  if (
    value[4] !== "-" ||
    value[7] !== "-" ||
    value[10] !== "T" ||
    value[13] !== ":" ||
    value[16] !== ":" ||
    !hasDigits(value, 0, 4) ||
    !hasDigits(value, 5, 7) ||
    !hasDigits(value, 8, 10) ||
    !hasDigits(value, 11, 13) ||
    !hasDigits(value, 14, 16) ||
    !hasDigits(value, 17, 19)
  ) {
    return false;
  }

  let suffixStart = 19;
  if (value.charAt(suffixStart) === ".") {
    suffixStart += 1;
    const fractionStart = suffixStart;
    while (
      suffixStart < value.length &&
      value.charCodeAt(suffixStart) >= 48 &&
      value.charCodeAt(suffixStart) <= 57
    ) {
      suffixStart += 1;
    }
    if (suffixStart === fractionStart) {
      return false;
    }
  }

  const suffixLength = value.length - suffixStart;
  const offset = value.slice(suffixStart);
  if (
    offset !== "Z" &&
    (suffixLength !== 6 ||
      (value.charAt(suffixStart) !== "+" &&
        value.charAt(suffixStart) !== "-") ||
      value.charAt(suffixStart + 3) !== ":" ||
      !hasDigits(value, suffixStart + 1, suffixStart + 3) ||
      !hasDigits(value, suffixStart + 4, suffixStart + 6))
  ) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }

  const calendarDate = new Date(0);
  calendarDate.setUTCFullYear(year, month - 1, day);
  calendarDate.setUTCHours(hour, minute, second, 0);
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return false;
  }

  if (offset !== "Z") {
    const offsetHours = Number(value.slice(suffixStart + 1, suffixStart + 3));
    const offsetMinutes = Number(value.slice(suffixStart + 4, suffixStart + 6));
    if (offsetHours > 23 || offsetMinutes > 59) {
      return false;
    }
  }
  return Number.isFinite(Date.parse(value));
}

module.exports = { isIsoDateTime };
