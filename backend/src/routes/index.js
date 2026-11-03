"use strict";
const express = require("express");
const h = require("../utils/asyncHandler");
const v = require("../middleware/validate");
const { authenticate, requireAdmin } = require("../middleware/auth");
const rl = require("../middleware/rateLimit");
const S = require("../validators/schemas");
const { z, idParam, pagination } = require("../validators/common");

const health = require("../controllers/health.controller");
const auth = require("../controllers/auth.controller");
const passwordReset = require("../controllers/password-reset.controller");
const user = require("../controllers/user.controller");
const subject = require("../controllers/subject.controller");
const question = require("../controllers/question.controller");
const qimport = require("../controllers/question-import.controller");
const test = require("../controllers/test.controller");
const attempt = require("../controllers/attempt.controller");
const answer = require("../controllers/answer.controller");
const result = require("../controllers/result.controller");
const exam = require("../controllers/exam.controller");
const admin = require("../controllers/admin.controller");
const ai = require("../controllers/ai.controller");
const syllabus = require("../controllers/syllabus.controller");

const r = express.Router();
const A = authenticate;
const ADM = [authenticate, requireAdmin];

r.get("/health", h(health.health));

// Auth
r.post("/auth/register", rl.auth, v({ body: S.register }), h(auth.register));
r.post("/auth/login", rl.auth, v({ body: S.login }), h(auth.login));
r.post("/auth/forgot-password", rl.passwordReset, v({ body: S.passwordResetRequest }), h(passwordReset.request));
r.post("/auth/reset-password", rl.passwordReset, v({ body: S.passwordResetComplete }), h(passwordReset.reset));
r.post("/auth/logout", A, h(auth.logout));
r.get("/auth/me", A, h(auth.me));
r.get("/users/me", A, h(user.profile));

// Subjects & topics
r.get("/subjects", h(subject.list));
r.post("/subjects", ...ADM, v({ body: S.subjectCreate }), h(subject.create));
r.get("/subjects/:id/topics", A, v({ params: idParam }), h(subject.topics));
r.post(
  "/subjects/:id/topics",
  ...ADM,
  v({ params: idParam, body: S.topicCreate }),
  h(subject.createTopic),
);

// Questions (answer keys are only serialised for admins)
r.get("/questions", A, v({ query: S.questionList }), h(question.list));
r.get("/questions/:id", A, v({ params: idParam }), h(question.get));
r.post("/questions", ...ADM, v({ body: S.questionBody }), h(question.create));
r.put(
  "/questions/:id",
  ...ADM,
  v({ params: idParam, body: S.questionBody }),
  h(question.update),
);
r.delete("/questions/:id", ...ADM, v({ params: idParam }), h(question.remove));
r.post(
  "/admin/questions/import",
  ...ADM,
  v({ body: S.importBody }),
  h(qimport.importQuestions),
);

// Tests
r.get("/tests", A, v({ query: S.testList }), h(test.list));
r.post("/tests/practice", A, v({ body: S.practiceGenerate }), h(test.practice));
r.post("/tests", ...ADM, v({ body: S.testCreate }), h(test.create));
r.get("/tests/:id", A, v({ params: idParam }), h(test.get));
r.put(
  "/tests/:id/questions",
  ...ADM,
  v({ params: idParam, body: S.testQuestions }),
  h(test.assign),
);
r.post("/tests/:id/publish", ...ADM, v({ params: idParam }), h(test.publish));
r.post("/tests/:id/archive", ...ADM, v({ params: idParam }), h(test.archive));

// Attempts, answers, results
r.post("/tests/:id/attempts", A, v({ params: idParam }), h(attempt.start));
r.get("/attempts/:id", A, v({ params: idParam }), h(attempt.get));
r.put(
  "/attempts/:id/answer",
  A,
  v({ params: idParam, body: S.answerBody }),
  h(answer.saveOne),
);
r.put(
  "/attempts/:id/answers",
  A,
  v({ params: idParam, body: S.answersBulk }),
  h(answer.saveMany),
);
r.post("/attempts/:id/submit", A, v({ params: idParam }), h(attempt.submit));
r.get("/results", A, v({ query: pagination }), h(result.history));
r.get("/results/:id", A, v({ params: idParam }), h(result.get));

// Examinations
r.post("/exams/join", A, v({ body: S.examJoin }), h(exam.join));
r.post("/exams/:id/attempts", A, v({ params: idParam }), h(exam.start));
r.post("/exams", ...ADM, v({ body: S.examCreate }), h(exam.create));
r.post("/exams/ai", ...ADM, rl.ai, v({ body: S.examAiCreate }), h(exam.createAi));
r.get("/exams", ...ADM, v({ query: pagination }), h(exam.list));
r.post("/exams/:id/cancel", ...ADM, v({ params: idParam }), h(exam.cancel));
r.get(
  "/exams/:id/participants",
  ...ADM,
  v({ params: idParam }),
  h(exam.participants),
);
r.get(
  "/exams/:id/logs",
  ...ADM,
  v({ params: idParam, query: pagination }),
  h(exam.logs),
);
r.get("/exams/:id/results", ...ADM, v({ params: idParam }), h(exam.results));

// Admin
r.get("/admin/stats", ...ADM, h(admin.stats));
r.get("/admin/users", ...ADM, v({ query: pagination }), h(admin.listUsers));
r.patch(
  "/admin/users/:id/role",
  ...ADM,
  v({ params: idParam, body: S.roleBody }),
  h(admin.setRole),
);
r.patch(
  "/admin/users/:id/active",
  ...ADM,
  v({ params: idParam, body: S.activeBody }),
  h(admin.setActive),
);

// Syllabus PDF extraction for authenticated students
r.post("/syllabus/extract", A, syllabus.uploadMiddleware, h(syllabus.extract));

// AI (admin-only: spends quota and writes to the shared question bank)
r.post(
  "/ai/questions/generate",
  ...ADM,
  rl.ai,
  v({ body: S.aiGenerate }),
  h(ai.generateQuestions),
);
r.post(
  "/ai/explanations",
  ...ADM,
  rl.ai,
  v({ body: S.aiExplain }),
  h(ai.explain),
);

module.exports = r;
