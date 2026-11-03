'use strict';
const attempts = require('../repositories/attempt.repository');
const tests = require('../repositories/test.repository');
const questionsRepo = require('../repositories/question.repository');
const exams = require('../repositories/exam.repository');
const { withTransaction } = require('../config/database');
const { scoreAnswers } = require('../utils/scoring');
const { toSql, fromSql } = require('../utils/time');
const { E } = require('../utils/errors');
const examWindow = require('../utils/exam-window');
const { effectiveDeadline: chooseEffectiveDeadline } = require('../utils/deadline');

const remainingSeconds = (a, now = new Date()) => Math.max(0, Math.floor((fromSql(a.deadline_at) - now) / 1000));
const presentAttempt = (a, now = new Date()) => ({
  id: Number(a.id), testId: Number(a.test_id), examSessionId: a.exam_session_id ? Number(a.exam_session_id) : null,
  attemptNumber: Number(a.attempt_number), status: a.status, startedAt: a.started_at, deadlineAt: a.deadline_at,
  submittedAt: a.submitted_at, remainingSeconds: a.status === 'in_progress' ? remainingSeconds(a, now) : 0,
});

// The effective deadline is the earlier of the attempt duration and the scheduled
// examination end. Read the exam row on the server so changing the browser clock
// or editing sessionStorage cannot extend a scheduled examination.
async function effectiveDeadline(a, conn) {
  // Older in-progress exam attempts may predate exam_session_id being stored.
  // Resolve their scheduled exam by test id as a backwards-compatible fallback.
  const exam = a.exam_session_id
    ? await exams.getById(a.exam_session_id, conn)
    : await exams.getNonCancelledByTestId(a.test_id, conn);
  return chooseEffectiveDeadline(a.deadline_at, exam?.scheduled_end_at ?? exam?.ends_at ?? null);
}

/** Score and close an attempt. Caller MUST hold the row lock (FOR UPDATE) inside a transaction. */
async function finalizeLocked(conn, attempt, status, now) {
  const qs = await tests.questionsOf(attempt.test_id, conn);
  const saved = await attempts.answersOf(attempt.id, conn);
  const map = new Map(saved.map((r) => [Number(r.question_id), r.selected_option_index]));
  const s = scoreAnswers(qs, map);
  await attempts.finalize(conn, { attemptId: attempt.id, status, at: toSql(now), score: s.score, maxScore: s.maxScore, perQuestion: s.perQuestion });
  return s;
}

async function attemptPayload(a, conn) {
  const effective = await effectiveDeadline(a, conn);
  const payloadAttempt = { ...a, deadline_at: toSql(effective) };
  const rows = await tests.questionsOf(a.test_id, conn);
  const qs = await questionsRepo.hydrate(rows, false, conn); // no answer key, no explanations
  const saved = await attempts.answersOf(a.id, conn);
  const answers = {};
  for (const r of saved) if (r.selected_option_index !== null) answers[r.question_id] = r.selected_option_index;
  return { attempt: presentAttempt(payloadAttempt), questions: qs, answers };
}

async function start(user, testId, { examSessionId = null, maxDeadline = null } = {}) {
  const out = await withTransaction(async (conn) => {
    await attempts.lockUser(user.id, conn); // serialises this user's attempt creation (no duplicate/over-limit attempts)

    // Enforce scheduled-exam timing on the server for every attempt-creation path.
    // A student cannot bypass the exam-code flow by calling /tests/:id/attempts.
    if (examSessionId != null) {
      const exam = await exams.getById(examSessionId, conn);
      if (!exam || Number(exam.test_id) !== Number(testId)) throw E.notFound('Examination not found');
      if (!(await exams.isParticipant(examSessionId, user.id))) throw E.forbidden('Join the examination with its code first');
      examWindow.assertCanStart(exam, new Date());
    } else {
      const scheduledExam = await exams.getNonCancelledByTestId(testId, conn);
      if (scheduledExam) {
        throw E.conflict(
          'This test belongs to a scheduled examination. Join using the examination code and start only during its scheduled time.',
          'SCHEDULED_EXAM_REQUIRES_CODE'
        );
      }
    }

    const raw = await tests.getRaw(testId, conn);
    if (!raw || !tests.canView(user, raw)) throw E.notFound('Test not found');
    if (raw.status !== 'published') throw E.conflict('Test is not available', 'TEST_NOT_PUBLISHED');
    if (Number(raw.question_count) === 0) throw E.conflict('Test has no questions', 'TEST_EMPTY');
    const now = new Date();

    const open = await attempts.findOpen(testId, user.id, examSessionId, conn);
    if (open) {
      const deadline = await effectiveDeadline(open, conn);
      if (deadline > now) return { resumed: true, attempt: open };
      await finalizeLocked(conn, open, 'expired', deadline); // close exactly at the earliest applicable deadline
    }
    const used = await attempts.countFor(testId, user.id, examSessionId, conn);
    const limit = examSessionId ? 1 : Number(raw.max_attempts); // scheduled exams: one attempt per participant
    if (used >= limit) throw E.conflict('Attempt limit reached for this test', 'ATTEMPT_LIMIT_REACHED');

    let deadline = new Date(now.getTime() + Number(raw.duration_minutes) * 60_000);
    if (maxDeadline && deadline > maxDeadline) deadline = maxDeadline;
    const id = await attempts.insert(conn, { testId, userId: user.id, examId: examSessionId, number: used + 1, startedAt: toSql(now), deadlineAt: toSql(deadline) });
    return { resumed: false, attempt: await attempts.getAttempt(id, conn) };
  });
  return { resumed: out.resumed, ...(await attemptPayload(out.attempt)) };
}

async function loadOwned(user, attemptId, conn, lock = false) {
  const a = lock ? await attempts.lockAttempt(attemptId, conn) : await attempts.getAttempt(attemptId, conn);
  if (!a || Number(a.user_id) !== user.id) throw E.notFound('Attempt not found'); // same response for "not yours" and "missing"
  return a;
}

async function saveAnswers(user, attemptId, answers) {
  const outcome = await withTransaction(async (conn) => {
    const a = await loadOwned(user, attemptId, conn, true);
    if (a.status !== 'in_progress') return { closed: true };
    const now = new Date();
    const deadline = await effectiveDeadline(a, conn);
    if (deadline <= now) {
      await finalizeLocked(conn, a, 'expired', deadline);
      return { expired: true };
    }
    const counts = await attempts.optionCounts(a.test_id, conn);
    for (const ans of answers) {
      if (!counts.has(ans.questionId)) throw E.validation([{ field: 'questionId', message: `Question ${ans.questionId} is not part of this test` }]);
      if (ans.selectedIndex !== null && ans.selectedIndex >= counts.get(ans.questionId)) {
        throw E.validation([{ field: 'selectedIndex', message: `Option ${ans.selectedIndex} does not exist for question ${ans.questionId}` }]);
      }
    }
    for (const ans of answers) await attempts.upsertAnswer(conn, a.id, ans.questionId, ans.selectedIndex, toSql(now));
    return { saved: answers.length, remainingSeconds: remainingSeconds(a, now) };
  });
  if (outcome.closed) throw E.conflict('This attempt is already closed', 'ATTEMPT_CLOSED');
  if (outcome.expired) throw E.gone('Time limit exceeded; the attempt was closed', 'ATTEMPT_EXPIRED');
  return outcome;
}

/** Idempotent: a repeated submit returns the stored result and never re-awards marks. */
async function submit(user, attemptId) {
  const info = await withTransaction(async (conn) => {
    const a = await loadOwned(user, attemptId, conn, true);
    if (a.status !== 'in_progress') return { already: true };
    const now = new Date();
    const deadline = await effectiveDeadline(a, conn);
    const late = deadline <= now;
    await finalizeLocked(conn, a, late ? 'expired' : 'submitted', late ? deadline : now);
    if (a.exam_session_id) await exams.log(a.exam_session_id, user.id, late ? 'ATTEMPT_AUTO_CLOSED' : 'ATTEMPT_SUBMITTED', `attempt ${a.id}`, conn);
    return { already: false };
  });
  return { alreadySubmitted: info.already, ...(await getResult(user, attemptId)) };
}

/** Closes the attempt (at its deadline) if time ran out; otherwise leaves it. */
async function expireIfDue(attemptId) {
  await withTransaction(async (conn) => {
    const a = await attempts.lockAttempt(attemptId, conn);
    if (a && a.status === 'in_progress') {
      const deadline = await effectiveDeadline(a, conn);
      if (deadline <= new Date()) await finalizeLocked(conn, a, 'expired', deadline);
    }
  });
}

async function getAttempt(user, attemptId) {
  let a = await loadOwned(user, attemptId);
  if (a.status === 'in_progress' && await effectiveDeadline(a) <= new Date()) { await expireIfDue(a.id); a = await attempts.getAttempt(a.id); }
  if (a.status === 'in_progress') return attemptPayload(a);
  return { attempt: presentAttempt(a), closed: true };
}

async function getResult(user, attemptId) {
  let a = await attempts.getAttempt(attemptId);
  if (!a || (user.role !== 'admin' && Number(a.user_id) !== user.id)) throw E.notFound('Attempt not found');
  if (a.status === 'in_progress' && await effectiveDeadline(a) <= new Date()) { await expireIfDue(a.id); a = await attempts.getAttempt(a.id); }
  if (a.status === 'in_progress') throw E.conflict('Attempt is still in progress', 'ATTEMPT_IN_PROGRESS');

  const rows = await attempts.reviewRows(a.id, a.test_id);
  let counts = { correct: 0, incorrect: 0, unanswered: 0 };
  for (const r of rows) {
    if (r.selected_option_index === null || r.selected_option_index === undefined) counts.unanswered += 1;
    else if (r.is_correct) counts.correct += 1; else counts.incorrect += 1;
  }
  const score = Number(a.score); const max = Number(a.max_score);
  const result = {
    attempt: presentAttempt(a),
    score, maxScore: max, percentage: max > 0 ? Math.round((score / max) * 10000) / 100 : 0, ...counts,
  };

  // Answer key is revealed only once the attempt is closed and, for scheduled exams, the exam window has ended.
  let reveal = true;
  if (a.exam_session_id && user.role !== 'admin') {
    const ex = await exams.getById(a.exam_session_id);
    reveal = !ex || fromSql(ex.ends_at) <= new Date();
  }
  result.reviewAvailable = reveal;
  if (reveal) {
    const qrows = await tests.questionsOf(a.test_id);
    const qs = await questionsRepo.hydrate(qrows, true);
    const rev = new Map(rows.map((r) => [Number(r.id), r]));
    result.review = qs.map((q) => {
      const r = rev.get(q.id);
      return { ...q, selectedIndex: r?.selected_option_index ?? null, isCorrect: r?.is_correct === null || r?.is_correct === undefined ? null : Boolean(r.is_correct), marksAwarded: r?.marks_awarded === null || r?.marks_awarded === undefined ? 0 : Number(r.marks_awarded) };
    });
  }
  return result;
}

async function history(user, { page, limit }) {
  const stale = await attempts.staleOpenForUser(user.id, toSql(new Date()));
  for (const s of stale) await expireIfDue(s.id);
  const { rows, total } = await attempts.history(user.id, { limit, offset: (page - 1) * limit });
  const items = rows.map((r) => ({
    attemptId: Number(r.id), testId: Number(r.test_id), examSessionId: r.exam_session_id ? Number(r.exam_session_id) : null,
    title: r.title, attemptNumber: Number(r.attempt_number), status: r.status, startedAt: r.started_at, submittedAt: r.submitted_at,
    score: r.score === null ? null : Number(r.score), maxScore: r.max_score === null ? null : Number(r.max_score),
    percentage: r.max_score && Number(r.max_score) > 0 ? Math.round((Number(r.score) / Number(r.max_score)) * 10000) / 100 : 0,
  }));
  return { items, page, limit, total };
}
module.exports = { start, saveAnswers, submit, getAttempt, getResult, history, finalizeLocked, presentAttempt };
