'use strict';
const ai = require('../services/ai.service');
const questionSvc = require('../services/question.service');
const catalog = require('../repositories/catalog.repository');
const questionRepo = require('../repositories/question.repository');
const { E } = require('../utils/errors');
const { ok } = require('../utils/respond');

exports.generateQuestions = async (req, res) => {
  const b = req.body;
  const subject = await catalog.getSubject(b.subjectId);
  if (!subject) throw E.validation([{ field: 'subjectId', message: 'Subject does not exist' }]);
  if (b.topicId) {
    const t = await catalog.getTopic(b.topicId);
    if (!t || Number(t.subjectId) !== Number(b.subjectId)) throw E.validation([{ field: 'topicId', message: 'Topic does not belong to this subject' }]);
  }
  const out = await ai.generateQuestions(req.user.id, { subjectName: subject.name, topic: b.topic, syllabusText: b.syllabusText, difficulty: b.difficulty, count: b.count });
  let saved = null;
  if (b.save) saved = await questionSvc.saveMany(req.user, { subjectId: b.subjectId, topicId: b.topicId, questions: out.questions, source: 'ai' });
  ok(res, { ...out, saved });
};

exports.explain = async (req, res) => {
  const q = await questionRepo.findById(req.body.questionId, true);
  if (!q) throw E.notFound('Question not found');
  const out = await ai.generateExplanation(req.user.id, q);
  if (req.body.save) await questionRepo.setExplanation(q.id, out.explanation);
  ok(res, { ...out, saved: req.body.save });
};
