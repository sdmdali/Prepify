'use strict';
// Applies database/migrations/*.sql in order, once each. Additive only: never drops or truncates.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getPool, closePool } = require('../src/config/database');

const DESTRUCTIVE = /\b(DROP\s+(TABLE|DATABASE|SCHEMA|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i;

(async () => {
  const dir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const conn = await getPool().getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(190) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
    const [done] = await conn.query('SELECT name, checksum FROM schema_migrations');
    const applied = new Map(done.map((r) => [r.name, r.checksum]));
    let ran = 0;
    for (const f of files) {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      const sum = crypto.createHash('sha256').update(sql).digest('hex');
      if (applied.has(f)) {
        if (applied.get(f) !== sum) throw new Error(`Migration ${f} was modified after being applied. Add a new migration instead.`);
        console.log(`skip   ${f}`); continue;
      }
      const code = sql.replace(/--.*$/gm, '');
      if (DESTRUCTIVE.test(code)) throw new Error(`Migration ${f} contains destructive SQL; refusing to run.`);
      const stmts = code.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean);
      for (const s of stmts) await conn.query(s); // DDL auto-commits in MySQL; each statement is idempotent (IF NOT EXISTS)
      await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?,?)', [f, sum]);
      console.log(`apply  ${f} (${stmts.length} statements)`); ran++;
    }
    console.log(ran ? `Done. ${ran} migration(s) applied.` : 'Nothing to apply.');
  } catch (e) { console.error(`Migration FAILED: ${e.code || e.message}`); process.exitCode = 1; }
  finally { conn.release(); await closePool(); }
})();
