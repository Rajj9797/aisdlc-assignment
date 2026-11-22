const { performance } = require('perf_hooks');

function createMonotonicClock() {
  return {
    now: () => performance.now(),
  };
}

module.exports = { createMonotonicClock };
