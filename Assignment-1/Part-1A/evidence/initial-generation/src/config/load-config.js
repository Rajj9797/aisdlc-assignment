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
  for (const tierName of tierNames) {
    const tier = config.tiers[tierName];
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
  for (let index = 0; index < clientEntries.length; index += 1) {
    const [apiKey, tierName] = clientEntries[index];
    if (apiKey.trim().length === 0) {
      throw new ConfigError(`clients entry ${index} has a blank API key`);
    }
    if (!tierNames.includes(tierName) || !config.tiers[tierName]) {
      throw new ConfigError(`clients entry ${index} has an unsupported tier`);
    }
  }

  return {
    tiers: {
      free: { ...config.tiers.free },
      pro: { ...config.tiers.pro },
      enterprise: { ...config.tiers.enterprise },
    },
    clients: { ...config.clients },
  };
}

function loadConfig({ env = {}, readFile } = {}) {
  const read = typeof readFile === 'function'
    ? readFile
    : (path) => fs.readFileSync(path, 'utf8');
  const path = env.RATE_LIMITER_CONFIG_FILE || 'config/demo.json';

  let contents;
  try {
    contents = read(path);
  } catch (error) {
    throw new ConfigError('configuration file could not be read');
  }

  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new ConfigError('configuration file contains malformed JSON');
  }

  return validateConfig(parsed);
}

module.exports = { loadConfig, ConfigError };
