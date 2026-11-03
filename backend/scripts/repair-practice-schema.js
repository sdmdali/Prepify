'use strict';
// Add only columns needed by AI-generated practice tests and attempt scoring.
// Existing rows and tables are preserved.
const { getPool, closePool } = require('../src/config/database');

const required = {
  questions: {
    text_hash: 'CHAR(64) NULL',
    marks: 'DECIMAL(5,2) NOT NULL DEFAULT 1.00',
    source: "VARCHAR(20) NOT NULL DEFAULT 'manual'",
    created_by: 'BIGINT UNSIGNED NULL',
  },
  question_options: {
    option_index: 'TINYINT UNSIGNED NULL',
    is_correct: 'TINYINT(1) NOT NULL DEFAULT 0',
  },
  tests: {
    max_attempts: 'INT UNSIGNED NOT NULL DEFAULT 1',
    created_by: 'BIGINT UNSIGNED NULL',
  },
  test_questions: { position: 'INT UNSIGNED NULL' },
  test_attempts: {
    exam_session_id: 'BIGINT UNSIGNED NULL',
    deadline_at: 'DATETIME NULL',
  },
  student_answers: {
    question_id: 'BIGINT UNSIGNED NULL',
    selected_option_index: 'TINYINT UNSIGNED NULL',
    is_correct: 'TINYINT(1) NULL',
    marks_awarded: 'DECIMAL(5,2) NULL',
  },
  ai_generation_usage: {
    kind: "VARCHAR(40) NOT NULL DEFAULT 'generate_questions'",
    model: 'VARCHAR(80) NULL',
    success: 'TINYINT(1) NOT NULL DEFAULT 1',
    error_code: 'VARCHAR(60) NULL',
  },
};

(async () => {
  const pool = getPool();
  let conn;
  try {
    conn = await pool.getConnection();
    const [dbRows] = await conn.query('SELECT DATABASE() AS db');
    const db = dbRows[0].db;
    for (const [table, columns] of Object.entries(required)) {
      const [tableRows] = await conn.query(
        'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [db, table]);
      if (!tableRows.length) { console.log(`skip ${table}: table does not exist`); continue; }
      for (const [column, definition] of Object.entries(columns)) {
        const [rows] = await conn.query(
          'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', [db, table, column]);
        if (!rows.length) {
          await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
          console.log(`added ${table}.${column}`);
        }
      }
    }
    // Backfill the new nullable ordering fields for existing records.
    const [optCols] = await conn.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='question_options' AND COLUMN_NAME='option_index'", [db]);
    if (optCols.length) {
      const [opts] = await conn.query('SELECT id, question_id FROM question_options WHERE option_index IS NULL ORDER BY question_id, id');
      const next = new Map();
      for (const row of opts) {
        const idx = next.get(row.question_id) || 0;
        await conn.query('UPDATE question_options SET option_index=? WHERE id=?', [idx, row.id]);
        next.set(row.question_id, idx + 1);
      }
    }
    const [posCols] = await conn.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='test_questions' AND COLUMN_NAME='position'", [db]);
    if (posCols.length) {
      const [tqs] = await conn.query('SELECT id, test_id FROM test_questions WHERE position IS NULL ORDER BY test_id, id');
      const next = new Map();
      for (const row of tqs) {
        const pos = (next.get(row.test_id) || 0) + 1;
        await conn.query('UPDATE test_questions SET position=? WHERE id=?', [pos, row.id]);
        next.set(row.test_id, pos);
      }
    }
    console.log('Practice schema check complete.');
  } catch (err) {
    console.error('Schema repair failed:', err.code || err.message);
    process.exitCode = 1;
  } finally {
    if (conn) conn.release();
    await closePool();
  }
})();
