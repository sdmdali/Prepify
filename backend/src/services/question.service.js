'use strict';
const repo = require('../repositories/question.repository');
const { withTransaction } = require('../config/database');
const { validateQuestion } = require('../utils/questionValidation');
const { E } = require('../utils/errors');

async function saveMany(user, { subjectId, topicId = null, questions, source = 'AI' }) {
  if (!Array.isArray(questions) || questions.length === 0) return [];
  const ids = await withTransaction(async conn => {
    const saved = [];
    for (const raw of questions) {
      const checked = validateQuestion(raw);
      if (!checked.ok) throw E.validation([{ field: 'questions', message: checked.errors.join('; ') }], 'Generated question was invalid');
      const q = checked.value;
      const dup = await repo.existsDuplicate(subjectId, q.questionText, conn, String(source).toUpperCase());
      if (dup) { saved.push(Number(dup.id)); continue; }
      saved.push(await repo.insert(conn, { subjectId, topicId, q, source: String(source).toUpperCase() }));
    }
    return saved;
  });
  return ids;
}
async function list(user, params = {}) { const page = Math.max(1, Number(params.page) || 1); const limit = Math.min(100, Math.max(1, Number(params.limit) || 20)); const result = await repo.search({ ...params, limit, offset: (page - 1) * limit }, String(user?.role || '').toLowerCase() === 'admin'); return { ...result, page, limit }; }
async function get(user, id) { const q = await repo.findById(id, String(user?.role || '').toLowerCase() === 'admin'); if (!q) throw E.notFound('Question not found'); return q; }
async function create(user, body) {
  const checked = validateQuestion(body);
  if (!checked.ok) throw E.validation([{ field: 'question', message: checked.errors.join('; ') }]);
  const ids = await withTransaction(conn => repo.insert(conn, { subjectId: body.subjectId, topicId: body.topicId, q: checked.value, source: 'MANUAL' }));
  return repo.findById(ids, true);
}
async function update(id, body) {
  const checked = validateQuestion(body);
  if (!checked.ok) throw E.validation([{ field: 'question', message: checked.errors.join('; ') }]);
  await withTransaction(conn => repo.update(conn, id, { subjectId: body.subjectId, topicId: body.topicId, q: checked.value }));
  return repo.findById(id, true);
}
async function remove(id) { await repo.remove(id); }
module.exports = { ...repo, saveMany, list, get, create, update, remove };
