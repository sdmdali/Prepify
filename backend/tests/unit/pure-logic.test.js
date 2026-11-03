'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreAnswers } = require('../../src/utils/scoring');
const { validateQuestion } = require('../../src/utils/questionValidation');
const { parseCsv } = require('../../src/utils/csv');
const { normaliseRow } = require('../../src/utils/importRows');
const { parseGeneratedQuestions, parseExplanation } = require('../../src/utils/aiValidation');
const { textHash } = require('../../src/utils/hash');
const { toSql, fromSql } = require('../../src/utils/time');

const qs = [
  { id: 1, marks: 2, correct_index: 0 },
  { id: 2, marks: 1, correct_index: 2 },
  { id: 3, marks: 1, correct_index: 1 },
];

test('scoring: correct, wrong, unanswered', () => {
  const r = scoreAnswers(qs, new Map([[1, 0], [2, 1]]));
  assert.equal(r.score, 2); assert.equal(r.maxScore, 4);
  assert.equal(r.correct, 1); assert.equal(r.incorrect, 1); assert.equal(r.unanswered, 1);
  assert.equal(r.percentage, 50);
});
test('scoring: empty test is 0%, no divide by zero', () => {
  const r = scoreAnswers([], new Map());
  assert.equal(r.percentage, 0); assert.equal(r.maxScore, 0);
});
test('scoring ignores answers for questions not in the test', () => {
  const r = scoreAnswers(qs, new Map([[99, 0]]));
  assert.equal(r.score, 0); assert.equal(r.unanswered, 3);
});

test('question validation: accepts valid', () => {
  const r = validateQuestion({ questionText: 'What is 2+2?', options: ['3', '4'], correctIndex: 1 });
  assert.equal(r.ok, true); assert.equal(r.value.marks, 1); assert.equal(r.value.difficulty, 'medium');
});
test('question validation: rejects bad index, duplicates, short text', () => {
  assert.equal(validateQuestion({ questionText: 'What is 2+2?', options: ['3', '4'], correctIndex: 2 }).ok, false);
  assert.equal(validateQuestion({ questionText: 'What is 2+2?', options: ['4', '4'], correctIndex: 0 }).ok, false);
  assert.equal(validateQuestion({ questionText: 'hi', options: ['a', 'b'], correctIndex: 0 }).ok, false);
  assert.equal(validateQuestion({ questionText: 'What is 2+2?', options: ['3', '4'], correctIndex: 1, difficulty: 'insane' }).ok, false);
  assert.equal(validateQuestion({ questionText: 'What is 2+2?', options: ['3', '4'], correctIndex: 1, marks: -1 }).ok, false);
  assert.equal(validateQuestion(null).ok, false);
});

test('csv: quotes, commas, embedded newlines, BOM', () => {
  const rows = parseCsv('\uFEFFsubject,question,optionA\r\njava,"Say ""hi"", ok\nline2",x\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].question, 'Say "hi", ok\nline2');
  assert.equal(rows[0].subject, 'java');
});
test('csv: unterminated quote throws', () => {
  assert.throws(() => parseCsv('a,b\n"x,y\n'));
});
test('importRows: letter and 1-based numeric correct answers', () => {
  const a = normaliseRow({ subject: 'java', question: 'Q text here', optionA: 'a', optionB: 'b', correct: 'B' });
  assert.equal(a.question.correctIndex, 1); assert.deepEqual(a.question.options, ['a', 'b']);
  const b = normaliseRow({ subject: 'java', question: 'Q text here', optionA: 'a', optionB: 'b', correct: '2' });
  assert.equal(b.question.correctIndex, 1);
  const c = normaliseRow({ subject: 'java', question: 'Q text here', optionA: 'a', optionB: 'b', correct: 'Z' });
  assert.equal(validateQuestion(c.question).ok, false);
});

test('ai validation: valid, fenced, partial rejects, garbage', () => {
  const good = { questions: [
    { question: 'What is a stack?', options: ['LIFO', 'FIFO'], correctIndex: 0, explanation: 'LIFO order.' },
    { question: 'Bad one', options: ['a'], correctIndex: 5 },
  ] };
  const r = parseGeneratedQuestions('```json\n' + JSON.stringify(good) + '\n```', { expectedDifficulty: 'hard' });
  assert.equal(r.valid.length, 1); assert.equal(r.rejected.length, 1);
  assert.equal(r.valid[0].difficulty, 'hard');
  assert.ok(parseGeneratedQuestions('not json').parseError);
  assert.ok(parseGeneratedQuestions('{"foo":1}').parseError);
});
test('ai explanation parsing', () => {
  assert.equal(parseExplanation('{"explanation":"Because LIFO."}'), 'Because LIFO.');
  assert.equal(parseExplanation('{"explanation":""}'), null);
  assert.equal(parseExplanation('nope'), null);
});

test('hash: whitespace/case-insensitive duplicate detection', () => {
  assert.equal(textHash('  What IS   a stack? '), textHash('what is a stack?'));
  assert.notEqual(textHash('a'), textHash('b'));
});
test('time roundtrip', () => {
  const d = new Date('2026-10-20T10:11:12Z');
  assert.equal(toSql(d), '2026-10-20 10:11:12');
  assert.equal(fromSql('2026-10-20 10:11:12').toISOString(), d.toISOString());
});
