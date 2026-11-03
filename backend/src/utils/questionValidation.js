'use strict';
/**
 * Shared validator for a single question payload (manual create, CSV/JSON import,
 * and AI-generated output). Pure; returns { ok, value, errors }.
 * Options are an array of 2-6 strings; correctIndex is a 0-based index.
 */
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function validateQuestion(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Question must be an object'] };

  const text = typeof raw.questionText === 'string' ? raw.questionText.trim() : '';
  if (text.length < 5 || text.length > 5000) errors.push('questionText must be 5-5000 characters');

  const options = Array.isArray(raw.options) ? raw.options.map((o) => (typeof o === 'string' ? o.trim() : '')) : [];
  if (options.length < 2 || options.length > 6) errors.push('options must contain 2-6 entries');
  if (options.some((o) => o.length === 0 || o.length > 1000)) errors.push('every option must be 1-1000 characters');
  const lower = options.map((o) => o.toLowerCase());
  if (new Set(lower).size !== lower.length) errors.push('options must be distinct');

  const idx = raw.correctIndex;
  if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) errors.push('correctIndex must be a valid 0-based option index');

  const difficulty = (raw.difficulty ?? 'medium');
  if (!DIFFICULTIES.includes(difficulty)) errors.push('difficulty must be easy, medium or hard');

  let marks = raw.marks === undefined || raw.marks === null ? 1 : Number(raw.marks);
  if (!Number.isFinite(marks) || marks <= 0 || marks > 100) errors.push('marks must be a number > 0 and <= 100');

  let explanation = null;
  if (raw.explanation !== undefined && raw.explanation !== null && raw.explanation !== '') {
    if (typeof raw.explanation !== 'string' || raw.explanation.length > 5000) errors.push('explanation must be a string up to 5000 characters');
    else explanation = raw.explanation.trim();
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], value: { questionText: text, options, correctIndex: idx, difficulty, marks, explanation } };
}
module.exports = { validateQuestion, DIFFICULTIES };
