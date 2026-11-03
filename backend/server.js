'use strict';
const { config, assertStartupConfig } = require('./src/config/environment');
const { createApp } = require('./src/app');
const { closePool, query } = require('./src/config/database');

assertStartupConfig();
const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Prepify API listening on http://localhost:${config.port} (${config.nodeEnv})`);
  query('SELECT 1').then(() => console.log('Database: connected'))
    .catch((e) => console.warn(`Database: NOT reachable (${e.code || e.message}). API will return 503 for DB routes.`));
});

let closing = false;
async function shutdown(signal) {
  if (closing) return; closing = true;
  console.log(`${signal} received: shutting down...`);
  const force = setTimeout(() => process.exit(1), 10_000); force.unref();
  server.close(async () => { try { await closePool(); } finally { process.exit(0); } });
}
['SIGINT', 'SIGTERM'].forEach((s) => process.on(s, () => shutdown(s)));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e && e.message));
