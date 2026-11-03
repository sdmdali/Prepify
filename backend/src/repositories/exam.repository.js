'use strict';
const { query } = require('../config/database');

// Map the existing database schema to the API response without changing the frontend.
const present = (r) => r && ({
  id: Number(r.id),
  testId: Number(r.test_id),
  examCode: r.join_code,
  title: r.exam_name,
  startsAt: r.scheduled_start_at,
  endsAt: r.scheduled_end_at,
  status: String(r.status || '').toLowerCase(),
  resultReleaseStatus: String(r.result_release_status || '').toLowerCase(),
  createdAt: r.created_at,
});

const getById = async (id, conn) =>
  (await query('SELECT * FROM exam_sessions WHERE id = ?', [id], conn))[0] || null;
const getByCode = async (code) =>
  (await query('SELECT * FROM exam_sessions WHERE join_code = ?', [code]))[0] || null;

// A scheduled examination's test must never be startable through the generic
// practice-test endpoint. The exam-code flow is the only permitted entry point.
const getNonCancelledByTestId = async (testId, conn) =>
  (await query(
    `SELECT * FROM exam_sessions
      WHERE test_id = ? AND UPPER(status) <> 'CANCELLED'
      ORDER BY id DESC LIMIT 1`,
    [testId], conn
  ))[0] || null;

async function insert({ testId, code, title, startsAt, endsAt, userId }) {
  const r = await query(
    `INSERT INTO exam_sessions
      (test_id, created_by_user_id, exam_name, join_code, status,
       scheduled_start_at, scheduled_end_at, result_release_status)
     VALUES (?, ?, ?, ?, 'SCHEDULED', ?, ?, 'HELD')`,
    [testId, userId, title, code, startsAt, endsAt]
  );
  return r.insertId;
}

const setStatus = (id, status) => {
  const allowed = {
    draft: 'DRAFT', scheduled: 'SCHEDULED', live: 'LIVE',
    open: 'LIVE', closed: 'CLOSED', ended: 'CLOSED', cancelled: 'CANCELLED',
  };
  const normalized = allowed[String(status).toLowerCase()];
  if (!normalized) throw new Error(`Unsupported exam status: ${status}`);
  return query('UPDATE exam_sessions SET status = ? WHERE id = ?', [normalized, id]);
};

async function list({ limit, offset }) {
  const rows = await query('SELECT * FROM exam_sessions ORDER BY id DESC LIMIT ? OFFSET ?', [limit, offset]);
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM exam_sessions');
  return { rows, total: Number(n) };
}
const addParticipant = (examId, userId, at) =>
  query('INSERT IGNORE INTO exam_participants (exam_session_id, user_id, joined_at) VALUES (?,?,?)', [examId, userId, at]);
const isParticipant = async (examId, userId) =>
  (await query('SELECT id FROM exam_participants WHERE exam_session_id = ? AND user_id = ?', [examId, userId])).length > 0;
const participants = (examId) => query(
  `SELECT u.id, u.full_name, u.email, p.joined_at
     FROM exam_participants p JOIN users u ON u.id = p.user_id
    WHERE p.exam_session_id = ? ORDER BY p.joined_at`, [examId]);

// Activity logging is supplementary. Use the live schema's event_type/occurred_at fields.
async function log(examId, userId, action, details, conn) {
  try {
    let participantId = null;
    if (userId != null) {
      const rows = await query(
        'SELECT id FROM exam_participants WHERE exam_session_id = ? AND user_id = ? LIMIT 1',
        [examId, userId], conn);
      participantId = rows[0]?.id ?? null;
    }
    const event = details ? `${action}: ${String(details).slice(0, 180)}` : action;
    await query(
      'INSERT INTO exam_activity_logs (exam_participant_id, event_type, occurred_at) VALUES (?, ?, CURRENT_TIMESTAMP(6))',
      [participantId, event], conn);
  } catch (err) {
    console.error('[exam activity log unavailable]', err.code || err.message);
  }
}
const logs = (examId, { limit, offset }) => query(
  `SELECT id, exam_participant_id, event_type, occurred_at
     FROM exam_activity_logs
    WHERE exam_participant_id IN (SELECT id FROM exam_participants WHERE exam_session_id = ?)
    ORDER BY id DESC LIMIT ? OFFSET ?`, [examId, limit, offset]);
const results = (examId) => query(
  `SELECT a.id AS attempt_id, u.id AS user_id, u.full_name, u.email,
          a.status, a.started_at, a.submitted_at, a.score, a.max_score
     FROM test_attempts a JOIN users u ON u.id = a.user_id
    WHERE a.exam_session_id = ? ORDER BY a.score DESC, a.submitted_at`, [examId]);

module.exports = { present, getById, getByCode, getNonCancelledByTestId, insert, setStatus, list, addParticipant, isParticipant, participants, log, logs, results };
