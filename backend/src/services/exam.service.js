'use strict';
const exams = require('../repositories/exam.repository');
const tests = require('../repositories/test.repository');
const attemptService = require('./attempt.service');
const { randomCode } = require('../utils/hash');
const { toSql, fromSql } = require('../utils/time');
const examWindow = require('../utils/exam-window');
const { E } = require('../utils/errors');
const catalog = require('../repositories/catalog.repository');
const ai = require('./ai.service');
const questionService = require('./question.service');
const { withTransaction } = require('../config/database');

const publicView = (e) => exams.present(e);

async function create(user, b) {
  const t = await tests.getRaw(b.testId);
  if (!t) throw E.validation([{ field: 'testId', message: 'Test does not exist' }]);
  if (t.status !== 'published') throw E.conflict('Only published tests can be scheduled as exams', 'TEST_NOT_PUBLISHED');
  if (Number(t.question_count) === 0) throw E.conflict('Test has no questions', 'TEST_EMPTY');
  const startsAt = new Date(b.startsAt); const endsAt = new Date(b.endsAt);
  if (endsAt <= new Date()) throw E.validation([{ field: 'endsAt', message: 'Exam must end in the future' }]);
  for (let i = 0; i < 5; i++) {
    try {
      const id = await exams.insert({ testId: b.testId, code: randomCode(8), title: b.title, startsAt: toSql(startsAt), endsAt: toSql(endsAt), userId: user.id });
      await exams.log(id, user.id, 'EXAM_CREATED', b.title);
      return publicView(await exams.getById(id));
    } catch (err) { if (err.code !== 'ER_DUP_ENTRY' || i === 4) throw err; }
  }
}

/** Create a college examination from an AI-generated paper, never from a bulk-imported bank. */
async function createAiExam(user, b) {
  const subject = await catalog.getSubject(b.subjectId);
  if (!subject) throw E.validation([{ field: 'subjectId', message: 'Subject does not exist' }]);
  const syllabusText = String(b.syllabusText || '').trim();
  const topic = String(b.topic || '').trim();
  const generated = await ai.generateQuestions(user.id, {
    subjectName: subject.name,
    ...(topic ? { topic } : {}),
    ...(syllabusText ? { syllabusText } : {}),
    difficulty: b.difficulty || 'medium',
    count: Number(b.count),
  });
  if (!Array.isArray(generated?.questions) || generated.questions.length !== Number(b.count)) {
    throw E.badGateway('AI did not generate the requested number of exam questions. No examination was published.', 'AI_INSUFFICIENT_QUESTIONS');
  }
  let topicId = null;
  if (topic) {
    let row = await catalog.getTopicByName(subject.id, topic);
    if (!row) row = await catalog.createTopic(subject.id, topic);
    topicId = Number(row.id);
  }
  const savedIds = await questionService.saveMany(user, {
    subjectId: subject.id,
    ...(topicId ? { topicId } : {}),
    questions: generated.questions,
    source: 'AI',
  });
  const ids = [...new Set(savedIds.map(Number))];
  if (ids.length !== Number(b.count)) {
    throw E.conflict('AI produced duplicate questions. Please generate the examination again.', 'AI_DUPLICATE_QUESTIONS');
  }
  const testId = await withTransaction(async (conn) => {
    const id = await tests.insert(conn, {
      title: b.title,
      subjectId: subject.id,
      topicId,
      durationMinutes: b.durationMinutes,
      maxAttempts: 1,
      status: 'published',
      userId: user.id,
      questionCount: Number(b.count),
      difficulty: b.difficulty || 'medium',
      sourceType: 'AI_GENERATED',
    });
    await tests.replaceQuestions(conn, id, ids);
    return id;
  });
  try {
    const exam = await create(user, { testId, title: b.title, startsAt: b.startsAt, endsAt: b.endsAt });
    return { ...exam, testId, questionCount: ids.length, sourceType: 'AI_GENERATED' };
  } catch (err) {
    // Do not leave a published test that was not scheduled as an examination.
    await tests.setStatus(testId, 'archived').catch(() => {});
    throw err;
  }
}

async function cancel(user, id) {
  const e = await exams.getById(id);
  if (!e) throw E.notFound('Exam not found');
  await exams.setStatus(id, 'cancelled');
  await exams.log(id, user.id, 'EXAM_CANCELLED');
  return publicView(await exams.getById(id));
}

const phase = examWindow.phase;

async function join(user, code) {
  const e = await exams.getByCode(code);
  if (!e || String(e.status).toLowerCase() === 'cancelled') throw E.notFound('No exam found for this code');
  const p = phase(e);
  if (p === 'ended') throw E.gone('This exam has ended', 'EXAM_ENDED');
  await exams.addParticipant(e.id, user.id, toSql(new Date()));
  await exams.log(e.id, user.id, 'PARTICIPANT_JOINED');
  return { exam: publicView(e), phase: p };
}

async function startAttempt(user, examId) {
  const e = await exams.getById(examId);
  if (!e || String(e.status).toLowerCase() === 'cancelled') throw E.notFound('Exam not found');
  if (!(await exams.isParticipant(e.id, user.id))) throw E.forbidden('Join the exam with its code first');
  examWindow.assertCanStart(e);
  // Attempt may not outlive the exam window.
  const out = await attemptService.start(user, e.test_id, { examSessionId: Number(e.id), maxDeadline: fromSql(e.scheduled_end_at ?? e.ends_at) });
  if (!out.resumed) await exams.log(e.id, user.id, 'ATTEMPT_STARTED', `attempt ${out.attempt.id}`);
  return out;
}

async function adminList({ page, limit }) {
  const { rows, total } = await exams.list({ limit, offset: (page - 1) * limit });
  return { items: rows.map((r) => ({ ...publicView(r), phase: phase(r) })), page, limit, total };
}
async function adminGet(id) {
  const e = await exams.getById(id);
  if (!e) throw E.notFound('Exam not found');
  return e;
}
async function participants(id) { await adminGet(id); return (await exams.participants(id)).map((r) => ({ id: Number(r.id), fullName: r.full_name, email: r.email, joinedAt: r.joined_at })); }
async function logs(id, { page, limit }) { await adminGet(id); return exams.logs(id, { limit, offset: (page - 1) * limit }); }
async function results(id) {
  await adminGet(id);
  return (await exams.results(id)).map((r) => ({
    attemptId: Number(r.attempt_id), userId: Number(r.user_id), fullName: r.full_name, email: r.email, status: r.status,
    startedAt: r.started_at, submittedAt: r.submitted_at, score: r.score === null ? null : Number(r.score), maxScore: r.max_score === null ? null : Number(r.max_score),
  }));
}
module.exports = { create, createAiExam, cancel, join, startAttempt, adminList, participants, logs, results, phase };
