'use strict';
const { validateQuestion } = require('./questionValidation');

/** Strip code fences some models add despite JSON mode. */
function stripFences(t) {
  return String(t).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/**
 * Parse + validate Gemini output for question generation.
 * Accepts {"questions":[...]} or a bare array. Invalid items are dropped and reported.
 */
function parseGeneratedQuestions(rawText, { expectedDifficulty } = {}) {
  let data;
  try { data = JSON.parse(stripFences(rawText)); }
  catch { return { valid: [], rejected: [], parseError: 'Model response was not valid JSON' }; }
  const items = Array.isArray(data) ? data : Array.isArray(data?.questions) ? data.questions : null;
  if (!items) return { valid: [], rejected: [], parseError: 'Model response did not contain a questions array' };

  const valid = []; const rejected = [];
  items.forEach((it, i) => {
    const r = validateQuestion({
      questionText: it?.questionText ?? it?.question,
      options: it?.options,
      correctIndex: it?.correctIndex,
      difficulty: expectedDifficulty && expectedDifficulty !== 'mixed' ? expectedDifficulty : (it?.difficulty ?? 'medium'),
      marks: 1,
      explanation: it?.explanation,
    });
    if (r.ok) valid.push(r.value); else rejected.push({ index: i, errors: r.errors });
  });
  return { valid, rejected, parseError: null };
}

function parseExplanation(rawText) {
  let data;
  try { data = JSON.parse(stripFences(rawText)); } catch { return null; }
  const e = typeof data?.explanation === 'string' ? data.explanation.trim() : '';
  return e.length >= 5 && e.length <= 5000 ? e : null;
}
module.exports = { parseGeneratedQuestions, parseExplanation, stripFences };
