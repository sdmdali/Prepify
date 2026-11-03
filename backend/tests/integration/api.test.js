'use strict';
/**
 * Integration tests (Jest + Supertest) against a REAL but SEPARATE MySQL database.
 *   1. CREATE DATABASE prepify_test;   (manually; these tests never create or drop databases)
 *   2. DB_NAME=prepify_test npm run db:migrate
 *   3. TEST_DB_NAME=prepify_test npm test
 * Refuses to run against "prepify". Skipped entirely when TEST_DB_NAME is unset.
 */
const TEST_DB = process.env.TEST_DB_NAME;
const enabled = Boolean(TEST_DB) && TEST_DB !== 'prepify';
const suite = enabled ? describe : describe.skip;

suite('Prepify API (integration)', () => {
  let request, app, db, gemini;
  const stamp = Date.now();
  const mail = (n) => `${n}.${stamp}@example.test`;
  const pw = 'Passw0rd!Passw0rd';
  let adminToken, stuToken, stu2Token, ids = {};

  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_NAME = TEST_DB;
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
    process.env.GEMINI_API_KEY = '';
    request = require('supertest');
    db = require('../../src/config/database');
    gemini = require('../../src/config/gemini');
    app = require('../../src/app').createApp();
    const [{ name }] = await db.query('SELECT DATABASE() AS name');
    if (name === 'prepify') throw new Error('Refusing to run tests against prepify');
  });
  afterAll(async () => { await db.closePool(); });

  const register = async (n) => (await request(app).post('/api/auth/register').send({ fullName: n, email: mail(n), password: pw })).body.data;

  test('health reports database up', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200); expect(r.body.data.database).toBe('up');
    expect(r.headers['x-powered-by']).toBeUndefined(); // helmet / disabled header
  });

  test('registration: creates a student, never returns the hash, rejects duplicates and bad input', async () => {
    const r = await request(app).post('/api/auth/register').send({ fullName: 'Stu One', email: mail('stu1'), password: pw });
    expect(r.status).toBe(201); expect(r.body.data.user.role).toBe('student');
    expect(JSON.stringify(r.body)).not.toMatch(/password/i);
    stuToken = r.body.data.token;
    expect((await request(app).post('/api/auth/register').send({ fullName: 'Stu One', email: mail('stu1'), password: pw })).status).toBe(409);
    expect((await request(app).post('/api/auth/register').send({ fullName: 'X', email: 'bad', password: '123' })).status).toBe(422);
    // client cannot self-assign a role
    expect((await request(app).post('/api/auth/register').send({ fullName: 'Evil', email: mail('evil'), password: pw, role: 'admin' })).status).toBe(422);
    stu2Token = (await register('stu2')).token;
  });

  test('login: valid, wrong password, unknown email give correct statuses', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: mail('stu1'), password: pw })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: mail('stu1'), password: 'wrongwrong1' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'nobody@example.test', password: pw })).status).toBe(401);
  });

  test('protected routes need a valid token; students cannot use admin routes', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth('garbage'))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(stuToken))).status).toBe(200);
    expect((await request(app).post('/api/subjects').set(auth(stuToken)).send({ slug: 'x-y', name: 'XY' })).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(auth(stuToken))).status).toBe(403);
    expect((await request(app).get('/api/nope')).status).toBe(404);
  });

  test('admin setup (explicit DB promotion of a test account), subjects, topics, questions', async () => {
    const a = await register('adm');
    await db.query("UPDATE users SET role='admin' WHERE email = ?", [mail('adm')]);
    adminToken = a.token; // role is re-read from DB on each request
    const s = await request(app).post('/api/subjects').set(auth(adminToken)).send({ slug: `subj-${stamp}`, name: 'Subj' });
    expect(s.status).toBe(201); ids.subject = s.body.data.id;
    expect((await request(app).post('/api/subjects').set(auth(adminToken)).send({ slug: `subj-${stamp}`, name: 'Dup' })).status).toBe(409);
    const t = await request(app).post(`/api/subjects/${ids.subject}/topics`).set(auth(adminToken)).send({ name: 'Topic A' });
    expect(t.status).toBe(201); ids.topic = t.body.data.id;

    ids.q = [];
    for (let i = 0; i < 3; i++) {
      const q = await request(app).post('/api/questions').set(auth(adminToken)).send({
        subjectId: ids.subject, topicId: ids.topic, questionText: `Test question number ${i} ${stamp}`,
        options: ['A0', 'B1', 'C2', 'D3'], correctIndex: i, difficulty: 'easy', marks: 2 });
      expect(q.status).toBe(201); ids.q.push(q.body.data.id);
    }
    // duplicate + invalid payloads
    expect((await request(app).post('/api/questions').set(auth(adminToken)).send({
      subjectId: ids.subject, questionText: `Test question number 0 ${stamp}`, options: ['A0', 'B1'], correctIndex: 0 })).status).toBe(409);
    expect((await request(app).post('/api/questions').set(auth(adminToken)).send({
      subjectId: ids.subject, questionText: 'Valid text here', options: ['only'], correctIndex: 0 })).status).toBe(422);
  });

  test('students never see answer keys in question listings', async () => {
    const r = await request(app).get(`/api/questions?subjectId=${ids.subject}`).set(auth(stuToken));
    expect(r.status).toBe(200); expect(r.body.data.items.length).toBe(3);
    expect(JSON.stringify(r.body)).not.toMatch(/isCorrect|explanation/);
    const adm = await request(app).get(`/api/questions?subjectId=${ids.subject}`).set(auth(adminToken));
    expect(JSON.stringify(adm.body)).toMatch(/isCorrect/);
  });

  test('question import: dry run, real run, safe retry (duplicates), failed rows reported', async () => {
    const csv = ['subject,topic,question,optionA,optionB,correct,difficulty',
      `subj-${stamp},Topic A,Imported question one ${stamp},yes,no,A,easy`,
      `nosuch,,Imported question two ${stamp},yes,no,A,easy`].join('\n');
    const dry = await request(app).post('/api/admin/questions/import').set(auth(adminToken)).send({ format: 'csv', content: csv, dryRun: true });
    expect(dry.body.data.inserted).toBe(1); expect(dry.body.data.failed).toBe(1);
    const real = await request(app).post('/api/admin/questions/import').set(auth(adminToken)).send({ format: 'csv', content: csv });
    expect(real.body.data.inserted).toBe(1);
    const again = await request(app).post('/api/admin/questions/import').set(auth(adminToken)).send({ format: 'csv', content: csv });
    expect(again.body.data.inserted).toBe(0); expect(again.body.data.duplicates).toBe(1);
  });

  test('test lifecycle: draft cannot be taken; publish needs questions; students cannot create', async () => {
    expect((await request(app).post('/api/tests').set(auth(stuToken)).send({ title: 'x', durationMinutes: 10 })).status).toBe(403);
    const empty = await request(app).post('/api/tests').set(auth(adminToken)).send({ title: 'Empty test', subjectId: ids.subject, durationMinutes: 10 });
    expect((await request(app).post(`/api/tests/${empty.body.data.id}/publish`).set(auth(adminToken))).status).toBe(409);
    const t = await request(app).post('/api/tests').set(auth(adminToken)).send({
      title: 'Real test', subjectId: ids.subject, durationMinutes: 30, maxAttempts: 2, questionIds: ids.q });
    expect(t.status).toBe(201); ids.test = t.body.data.id;
    expect((await request(app).post(`/api/tests/${ids.test}/attempts`).set(auth(stuToken))).status).toBe(404); // draft hidden from students
    expect((await request(app).post(`/api/tests/${ids.test}/publish`).set(auth(adminToken))).status).toBe(200);
  });

  test('attempt: start (resume on repeat), answer validation, scoring, idempotent submit, ownership', async () => {
    const s = await request(app).post(`/api/tests/${ids.test}/attempts`).set(auth(stuToken));
    expect(s.status).toBe(201); ids.attempt = s.body.data.attempt.id;
    expect(JSON.stringify(s.body)).not.toMatch(/isCorrect|explanation/);
    const again = await request(app).post(`/api/tests/${ids.test}/attempts`).set(auth(stuToken));
    expect(again.status).toBe(200); expect(again.body.data.attempt.id).toBe(ids.attempt); // no duplicate attempt

    const bad = (b) => request(app).put(`/api/attempts/${ids.attempt}/answer`).set(auth(stuToken)).send(b);
    expect((await bad({ questionId: 999999999, selectedIndex: 0 })).status).toBe(422);
    expect((await bad({ questionId: ids.q[0], selectedIndex: 5 })).status).toBe(422);
    expect((await bad({ questionId: ids.q[0], selectedIndex: -1 })).status).toBe(422);
    expect((await request(app).put(`/api/attempts/${ids.attempt}/answer`).set(auth(stu2Token)).send({ questionId: ids.q[0], selectedIndex: 0 })).status).toBe(404);

    // q0 correct (0), q1 wrong (0 instead of 1), q2 unanswered. marks=2 each.
    expect((await bad({ questionId: ids.q[0], selectedIndex: 0 })).status).toBe(200);
    expect((await bad({ questionId: ids.q[1], selectedIndex: 0 })).status).toBe(200);
    expect((await request(app).get(`/api/results/${ids.attempt}`).set(auth(stuToken))).status).toBe(409); // still running

    const sub = await request(app).post(`/api/attempts/${ids.attempt}/submit`).set(auth(stuToken)).send({ score: 999 }); // client score ignored
    expect(sub.status).toBe(200); expect(sub.body.data.score).toBe(2); expect(sub.body.data.maxScore).toBe(6);
    expect(sub.body.data.correct).toBe(1); expect(sub.body.data.incorrect).toBe(1); expect(sub.body.data.unanswered).toBe(1);
    const dup = await request(app).post(`/api/attempts/${ids.attempt}/submit`).set(auth(stuToken));
    expect(dup.status).toBe(200); expect(dup.body.data.score).toBe(2); expect(dup.body.data.alreadySubmitted).toBe(true);
    expect((await bad({ questionId: ids.q[2], selectedIndex: 2 })).status).toBe(409); // closed
    expect((await request(app).get(`/api/results/${ids.attempt}`).set(auth(stu2Token))).status).toBe(404);
    const hist = await request(app).get('/api/results').set(auth(stuToken));
    expect(hist.body.data.total).toBeGreaterThanOrEqual(1);
  });

  test('concurrent attempt starts create exactly one attempt', async () => {
    const res = await Promise.all(Array.from({ length: 5 }, () => request(app).post(`/api/tests/${ids.test}/attempts`).set(auth(stu2Token))));
    expect(res.every((r) => [200, 201].includes(r.status))).toBe(true);
    expect(new Set(res.map((r) => r.body.data.attempt.id)).size).toBe(1);
  });

  test('practice test: fails honestly when bank is too small; succeeds when enough', async () => {
    const tooMany = await request(app).post('/api/tests/practice').set(auth(stuToken)).send({ subjectId: ids.subject, difficulty: 'hard', questionCount: 10, durationMinutes: 15 });
    expect(tooMany.status).toBe(409); expect(tooMany.body.error.code).toBe('INSUFFICIENT_QUESTIONS');
    const ok = await request(app).post('/api/tests/practice').set(auth(stuToken)).send({ subjectId: ids.subject, difficulty: 'easy', questionCount: 2, durationMinutes: 15 });
    expect(ok.status).toBe(201); expect(ok.body.data.questionCount).toBe(2);
  });

  test('exam: join by code, window enforcement, admin-only management', async () => {
    const future = new Date(Date.now() + 3600e3).toISOString(); const later = new Date(Date.now() + 7200e3).toISOString();
    expect((await request(app).post('/api/exams').set(auth(stuToken)).send({ testId: ids.test, title: 'Final', startsAt: future, endsAt: later })).status).toBe(403);
    const e = await request(app).post('/api/exams').set(auth(adminToken)).send({ testId: ids.test, title: 'Final exam', startsAt: future, endsAt: later });
    expect(e.status).toBe(201);
    const j = await request(app).post('/api/exams/join').set(auth(stuToken)).send({ code: e.body.data.examCode });
    expect(j.status).toBe(200); expect(j.body.data.phase).toBe('upcoming');
    expect((await request(app).post(`/api/exams/${e.body.data.id}/attempts`).set(auth(stuToken))).status).toBe(409); // not started
    expect((await request(app).post(`/api/exams/${e.body.data.id}/attempts`).set(auth(stu2Token))).status).toBe(403); // not joined
    expect((await request(app).post('/api/exams/join').set(auth(stuToken)).send({ code: 'ZZZZZZZZ' })).status).toBe(404);

    const open = await request(app).post('/api/exams').set(auth(adminToken)).send({ testId: ids.test, title: 'Open exam', startsAt: new Date(Date.now() - 60e3).toISOString(), endsAt: later });
    await request(app).post('/api/exams/join').set(auth(stuToken)).send({ code: open.body.data.examCode });
    const st = await request(app).post(`/api/exams/${open.body.data.id}/attempts`).set(auth(stuToken));
    expect(st.status).toBe(201);
    const logs = await request(app).get(`/api/exams/${open.body.data.id}/logs`).set(auth(adminToken));
    expect(logs.body.data.items.length).toBeGreaterThan(0);
  });

  test('time limit: an attempt past its deadline is closed and cannot be answered', async () => {
    const a = await request(app).post(`/api/tests/${ids.test}/attempts`).set(auth(stuToken)); // 2nd allowed attempt
    expect(a.status).toBe(201);
    await db.query("UPDATE test_attempts SET deadline_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE id = ?", [a.body.data.attempt.id]);
    const r = await request(app).put(`/api/attempts/${a.body.data.attempt.id}/answer`).set(auth(stuToken)).send({ questionId: ids.q[0], selectedIndex: 0 });
    expect(r.status).toBe(410); expect(r.body.error.code).toBe('ATTEMPT_EXPIRED');
    const res = await request(app).get(`/api/results/${a.body.data.attempt.id}`).set(auth(stuToken));
    expect(res.status).toBe(200); expect(res.body.data.attempt.status).toBe('expired'); expect(res.body.data.score).toBe(0);
    // attempt limit (2) now reached
    expect((await request(app).post(`/api/tests/${ids.test}/attempts`).set(auth(stuToken))).status).toBe(409);
  });

  test('AI: missing key -> 503 AI_NOT_CONFIGURED; students forbidden; rest of API unaffected', async () => {
    const body = { subjectId: ids.subject, topic: 'Stacks', count: 2 };
    expect((await request(app).post('/api/ai/questions/generate').set(auth(stuToken)).send(body)).status).toBe(403);
    const r = await request(app).post('/api/ai/questions/generate').set(auth(adminToken)).send(body);
    expect(r.status).toBe(503); expect(r.body.error.code).toBe('AI_NOT_CONFIGURED');
    expect((await request(app).get('/api/subjects').set(auth(stuToken))).status).toBe(200);
  });

  test('AI: mocked Gemini output is validated and saved with duplicates skipped', async () => {
    const q = { question: `AI generated question ${stamp}`, options: ['one', 'two', 'three', 'four'], correctIndex: 2, explanation: 'Because.' };
    gemini.setClientFactory(() => ({ models: { generateContent: async () => ({ text: JSON.stringify({ questions: [q, { question: 'bad', options: ['x'], correctIndex: 7 }] }) }) } }));
    const body = { subjectId: ids.subject, topic: 'Stacks', count: 2, difficulty: 'medium', save: true };
    const r = await request(app).post('/api/ai/questions/generate').set(auth(adminToken)).send(body);
    expect(r.status).toBe(200); expect(r.body.data.questions.length).toBe(1); expect(r.body.data.rejectedCount).toBe(1);
    expect(r.body.data.saved.savedIds.length).toBe(1);
    const r2 = await request(app).post('/api/ai/questions/generate').set(auth(adminToken)).send(body);
    expect(r2.body.data.saved.duplicates).toBe(1);
    gemini.setClientFactory(null);
  });

  test('security: malformed JSON -> 400 without stack traces; CORS rejects foreign origins', async () => {
    const r = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad json');
    expect(r.status).toBe(400); expect(JSON.stringify(r.body)).not.toMatch(/at .*\.js/);
    const c = await request(app).get('/api/health').set('Origin', 'http://evil.example');
    expect(c.headers['access-control-allow-origin']).toBeUndefined();
    const ok = await request(app).get('/api/health').set('Origin', 'http://127.0.0.1:5500');
    expect(ok.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5500');
  });
});
