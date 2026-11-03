'use strict';
const mysql = require('mysql2/promise');
const { config } = require('./environment');

let pool;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...config.db,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true,
      timezone: 'Z',
    });
  }
  return pool;
}

async function query(sql, params = [], conn) {
  const [rows] = await (conn || getPool()).query(sql, params);
  return rows;
}

/** Run fn(conn) inside a transaction; commits on success, rolls back on error. */
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function closePool() {
  if (pool) { await pool.end(); pool = undefined; }
}

module.exports = { getPool, query, withTransaction, closePool };
