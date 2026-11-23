"use strict";

const dotenv = require("dotenv");

function loadEnv() {
  const result = dotenv.config();
  if (result.error && result.error.code !== "ENOENT") {
    throw new Error("Unable to load local environment configuration.");
  }
}

module.exports = { loadEnv };
