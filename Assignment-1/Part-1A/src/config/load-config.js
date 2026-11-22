const fs = require('fs');

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateConfig(config) {
  if (!isPlainObject(config)) {
    throw new ConfigError('configuration must be a JSON object');
  }
  if (!isPlainObject(config.tiers)) {
    throw new ConfigError('tiers must be a JSON object');
  }

  const tierNames = ['free', 'pro', 'enterprise'];
  const tiers = new Map(Object.entries(config.tiers));
  for (const tierName of tierNames) {
    const tier = tiers.get(tierName);
    if (!isPlainObject(tier)) {
      throw new ConfigError(`tiers.${tierName} is missing`);
    }

    if (
      typeof tier.capacity !== 'number'
      || !Number.isFinite(tier.capacity)
      || tier.capacity < 1
    ) {
      throw new ConfigError(`tiers.${tierName}.capacity is invalid`);
    }

    if (
      typeof tier.refillRatePerSecond !== 'number'
      || !Number.isFinite(tier.refillRatePerSecond)
      || tier.refillRatePerSecond <= 0
    ) {
      throw new ConfigError(`tiers.${tierName}.refillRatePerSecond is invalid`);
    }
  }

  if (!isPlainObject(config.clients)) {
    throw new ConfigError('clients must be a JSON object');
  }

  const clientEntries = Object.entries(config.clients);
  for (const [index, [apiKey, tierName]] of clientEntries.entries()) {
    if (apiKey.trim().length === 0) {
      throw new ConfigError(`clients entry ${index} has a blank API key`);
    }
    if (!tierNames.includes(tierName) || !tiers.has(tierName)) {
      throw new ConfigError(`clients entry ${index} has an unsupported tier`);
    }
  }

  return {
    tiers: Object.fromEntries(tierNames.map((tierName) => [tierName, { ...tiers.get(tierName) }])),
    clients: Object.fromEntries(clientEntries),
  };
}

function loadConfig({ env = {}, readFile } = {}) {
  const read = typeof readFile === 'function'
    ? readFile
    : fs.readFileSync;
  const path = env.RATE_LIMITER_CONFIG_FILE || 'config/demo.json';

  let contents;
  try {
    contents = read(path);
  } catch {
    throw new ConfigError('configuration file could not be read');
  }

  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new ConfigError('configuration file contains malformed JSON');
  }

  return validateConfig(parsed);
}

module.exports = { loadConfig, ConfigError };
