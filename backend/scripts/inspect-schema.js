'use strict';
// Read-only. Compares the live database with the columns this backend expects and reports gaps.
const { query, closePool } = require('../src/config/database');
const { config } = require('../src/config/environment');

const EXPECTED = {
  users: ['id', 'full_name', 'email', 'password_hash', 'role', 'is_active', 'created_at'],
  subjects: ['id', 'slug', 'name'],
  topics: ['id', 'subject_id', 'name'],
  questions: ['id', 'subject_id', 'topic_id', 'question_text', 'text_hash', 'difficulty', 'marks', 'explanation', 'source', 'created_by'],
  question_options: ['id', 'question_id', 'option_index', 'option_text', 'is_correct'],
  tests: ['id', 'title', 'subject_id', 'duration_minutes', 'max_attempts', 'status', 'created_by'],
  test_questions: ['id', 'test_id', 'question_id', 'position'],
  test_attempts: ['id', 'test_id', 'user_id', 'exam_session_id', 'attempt_number', 'status', 'started_at', 'deadline_at', 'submitted_at', 'score', 'max_score'],
  student_answers: ['id', 'attempt_id', 'question_id', 'selected_option_index', 'is_correct', 'marks_awarded', 'answered_at'],
  exam_sessions: ['id', 'test_id', 'exam_code', 'title', 'starts_at', 'ends_at', 'status', 'created_by'],
  exam_participants: ['id', 'exam_session_id', 'user_id', 'joined_at'],
  exam_activity_logs: ['id', 'exam_session_id', 'user_id', 'action', 'details', 'created_at'],
  ai_generation_usage: ['id', 'user_id', 'kind', 'model', 'success', 'error_code', 'created_at'],
  question_import_batches: ['id', 'user_id', 'file_name', 'total_rows', 'inserted_rows', 'duplicate_rows', 'failed_rows'],
};

(async () => {
  let problems = 0;
  try {
    const cols = await query(
      'SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ty FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION',
      [config.db.database]);
    const live = new Map();
    for (const r of cols) { if (!live.has(r.t)) live.set(r.t, new Map()); live.get(r.t).set(r.c, r.ty); }

    console.log(`Schema "${config.db.database}": ${live.size} table(s)\n`);
    for (const [t, c] of live) console.log(`  ${t}: ${[...c.keys()].join(', ')}`);
    console.log('\nCompatibility with this backend:');
    for (const [t, need] of Object.entries(EXPECTED)) {
      if (!live.has(t)) { console.log(`  MISSING TABLE  ${t}  (run: npm run db:migrate)`); problems++; continue; }
      const missing = need.filter((c) => !live.get(t).has(c));
      if (missing.length) { console.log(`  MISMATCH       ${t}: missing column(s) ${missing.join(', ')}`); problems++; }
      else console.log(`  ok             ${t}`);
    }
    const extra = [...live.keys()].filter((t) => !EXPECTED[t]);
    if (extra.length) console.log(`\nOther tables present (untouched): ${extra.join(', ')}`);
    if (problems) { console.log(`\n${problems} problem(s). Existing tables are never altered automatically; see database/README.md.`); process.exitCode = 2; }
    else console.log('\nSchema is compatible.');
  } catch (e) { console.error(`Inspect FAILED: ${e.code || e.message}`); process.exitCode = 1; }
  finally { await closePool(); }
})();
