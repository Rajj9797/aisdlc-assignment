const { loadConfig, ConfigError } = require('./config/load-config');
const { createApp } = require('./app');
const { createMonotonicClock } = require('./rate-limit/clock');

function start() {
  let config;
  try {
    config = loadConfig({ env: process.env });
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`Startup configuration error: ${error.message}\n`);
    } else {
      process.stderr.write('Startup failed due to an unexpected configuration error\n');
    }
    process.exitCode = 1;
    return;
  }

  let app;
  try {
    const clock = createMonotonicClock();
    app = createApp({ config, now: clock.now });
  } catch (error) {
    process.stderr.write('Startup failed due to an unexpected application error\n');
    process.exitCode = 1;
    return;
  }

  const parsedPort = Number(process.env.PORT || 3000);
  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
    process.stderr.write('Startup failed: invalid port\n');
    process.exitCode = 1;
    return;
  }

  let server;
  try {
    server = app.listen(parsedPort, () => {});
  } catch (error) {
    process.stderr.write('Startup failed: the server could not listen on the requested port\n');
    process.exitCode = 1;
    return;
  }

  server.on('error', () => {
    process.stderr.write('Startup failed: the server could not listen on the requested port\n');
    process.exitCode = 1;
  });
}

if (require.main === module) {
  start();
}

module.exports = { start };
