'use strict';
const { z, id, pagination } = require('./common');

const email = z.string().trim().toLowerCase().email().max(190);
const password = z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters');
const difficulty = z.enum(['easy', 'medium', 'hard']);

exports.register = z.object({
  fullName: z.string().trim().min(2).max(120),
  email, password,
}).strict();
exports.login = z.object({ email, password: z.string().min(1).max(72) }).strict();
exports.passwordResetRequest = z.object({ email }).strict();
exports.passwordResetComplete = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid reset token'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
}).strict();

exports.subjectCreate = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits, hyphens').max(80),
  name: z.string().trim().min(2).max(150),
}).strict();
exports.topicCreate = z.object({ name: z.string().trim().min(2).max(150) }).strict();

exports.questionBody = z.object({
  subjectId: id,
  topicId: id.nullish(),
  questionText: z.string().trim().min(5).max(5000),
  options: z.array(z.string().trim().min(1).max(1000)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  difficulty: difficulty.default('medium'),
  marks: z.number().positive().max(100).default(1),
  explanation: z.string().trim().max(5000).nullish(),
}).strict();
exports.questionList = pagination.extend({
  subjectId: id.optional(), topicId: id.optional(), difficulty: difficulty.optional(),
  search: z.string().trim().max(200).optional(),
});

exports.importBody = z.object({
  format: z.enum(['csv', 'json']),
  content: z.string().max(5_000_000).optional(),      // CSV text, or JSON text
  rows: z.array(z.record(z.any())).max(5000).optional(), // JSON rows inline
  fileName: z.string().max(255).optional(),
  dryRun: z.boolean().default(false),
}).strict().refine((b) => b.content || b.rows, { message: 'Provide content or rows' });

exports.testCreate = z.object({
  title: z.string().trim().min(3).max(200),
  subjectId: id.nullish(),
  durationMinutes: z.number().int().min(1).max(600),
  maxAttempts: z.number().int().min(1).max(100).default(1),
  questionIds: z.array(id).max(500).optional(),
}).strict();
exports.testQuestions = z.object({ questionIds: z.array(id).min(1).max(500) }).strict();
exports.testList = pagination.extend({ subjectId: id.optional(), status: z.enum(['draft', 'published', 'archived']).optional() });

// Matches the fields on frontend/test-setup.html (subject, topics, difficulty, count, duration).
exports.practiceGenerate = z.object({
  subjectId: id.optional(),
  topicIds: z.array(id).max(50).optional(),
  topic: z.string().trim().max(300).optional(),
  syllabusText: z.string().trim().min(100).max(80000).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
  questionCount: z.number().int().min(1).max(100),
  durationMinutes: z.number().int().min(1).max(600),
}).strict().refine((b) => b.subjectId !== undefined || !!b.syllabusText, {
  message: 'Choose a subject or provide syllabusText',
  path: ['subjectId'],
});

exports.answerBody = z.object({
  questionId: id,
  selectedIndex: z.number().int().min(0).max(5).nullable(),
}).strict();
exports.answersBulk = z.object({ answers: z.array(exports.answerBody).min(1).max(200) }).strict();

exports.examCreate = z.object({
  testId: id,
  title: z.string().trim().min(3).max(200),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).strict().refine((b) => new Date(b.endsAt) > new Date(b.startsAt), { message: 'endsAt must be after startsAt', path: ['endsAt'] });
exports.examAiCreate = z.object({
  title: z.string().trim().min(3).max(200),
  subjectId: id,
  topic: z.string().trim().min(2).max(300).optional(),
  syllabusText: z.string().trim().min(100).max(80000).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('medium'),
  count: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(50)]),
  durationMinutes: z.number().int().min(1).max(600),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).strict().refine((b) => new Date(b.endsAt) > new Date(b.startsAt), { message: 'endsAt must be after startsAt', path: ['endsAt'] });

exports.examJoin = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,20}$/, 'Invalid exam code') }).strict();

exports.aiGenerate = z.object({
  subjectId: id,
  topic: z.string().trim().max(300).optional(),
  syllabusText: z.string().trim().max(20000).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('medium'),
  count: z.number().int().min(1).max(20).default(5),
  save: z.boolean().default(false),
  topicId: id.nullish(),
}).strict().refine((b) => b.topic || b.syllabusText, { message: 'Provide topic or syllabusText' });
exports.aiExplain = z.object({ questionId: id, save: z.boolean().default(false) }).strict();

exports.roleBody = z.object({ role: z.enum(['student', 'admin']) }).strict();
exports.activeBody = z.object({ isActive: z.boolean() }).strict();
