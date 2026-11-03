'use strict';
// Read-only connectivity check. Prints no credentials.
const { config } = require('../src/config/environment');
const { query, closePool } = require('../src/config/database');

(async () => {
  try {
    const [r] = await query('SELECT DATABASE() AS db, VERSION() AS version');
    console.log(`Connected to MySQL ${r.version} as ${config.db.user}@${config.db.host}:${config.db.port}, database "${r.db}".`);
    const tables = (await query('SHOW TABLES')).map((row) => Object.values(row)[0]);
    console.log(`Tables found (${tables.length}): ${tables.join(', ') || '(none)'}`);
  } catch (e) {
    console.error(`Database check FAILED: ${e.code || e.message}`);
    if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('Check DB_USER / DB_PASSWORD in backend/.env (keep the quotes around passwords containing spaces).');
    if (e.code === 'ECONNREFUSED') console.error('MySQL is not accepting connections on the configured host/port. Is the MySQL service running?');
    if (e.code === 'ER_BAD_DB_ERROR') console.error('Database does not exist. This tool never creates or drops databases.');
    process.exitCode = 1;
  } finally { await closePool(); }
})();
